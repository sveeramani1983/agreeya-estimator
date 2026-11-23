import { getDb } from "@/lib/db"
import { callNvidiaWithRetry, extractCleanJson, classifyNvidiaError } from "@/lib/ai-provider"
import crypto from "crypto"

export interface OverheadRecommendationData {
  rationale: string
  keyFactors: string[]
  recommendations: {
    ba_enabled: boolean
    ba_percent: number
    qa_enabled: boolean
    qa_percent: number
    devops_enabled: boolean
    devops_percent: number
    ux_enabled: boolean
    ux_percent: number
    pm_enabled: boolean
    pm_percent: number
    change_mgmt_enabled: boolean
    change_mgmt_percent: number
    solutions_arch_enabled: boolean
    solutions_arch_percent: number
    training_enabled: boolean
    training_percent: number
    warranty_enabled: boolean
    warranty_percent: number
    risk_buffer_enabled: boolean
    risk_buffer_percent: number
    project_contingency_percent: number
  }
}

function clampPercent(val: unknown, fallback: number): number {
  const num = typeof val === "number" ? val : parseFloat(String(val))
  if (isNaN(num)) return fallback
  return Math.max(0, Math.min(100, Math.round(num * 10) / 10))
}

function toBoolean(val: unknown, fallback: boolean): boolean {
  if (typeof val === "boolean") return val
  if (val === 1 || val === "true" || val === "1") return true
  if (val === 0 || val === "false" || val === "0") return false
  return fallback
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const tab = body.tab || "overhead"
    const regenerate = Boolean(body.regenerate)

    if (tab !== "overhead") {
      return Response.json(
        { success: false, error: `AI recommendation for tab '${tab}' is not supported yet.` },
        { status: 400 }
      )
    }

    const db = getDb()

    // 1. Fetch Project
    const project = db
      .prepare("SELECT id, name, client_name, description, executive_summary FROM projects WHERE id = ?")
      .get(projectId) as {
        id: string
        name: string
        client_name: string | null
        description: string | null
        executive_summary: string | null
      } | undefined

    if (!project) {
      return Response.json({ success: false, error: "Project not found" }, { status: 404 })
    }

    // 2. Fetch WBS Components
    const components = db
      .prepare(
        "SELECT id, category, component_name, description, complexity, story_points, base_hours, confidence_level FROM wbs_components WHERE project_id = ?"
      )
      .all(projectId) as Array<{
        id: string
        category: string
        component_name: string
        description: string | null
        complexity: string
        story_points: number
        base_hours: number
        confidence_level: string
      }>

    // 3. Compute construction hours & distributions
    const constructionHours = components.reduce((sum, c) => sum + (c.base_hours || 0), 0)

    // PAUSE CONDITION CHECK: If WBS construction hours are zero, do not call AI.
    if (constructionHours <= 0 || components.length === 0) {
      return Response.json({
        status: "paused",
        reason: "zero_construction_hours",
        message: "The WBS has 0 estimated hours. Please add and estimate components on the Estimate tab before configuring overheads.",
        actionUrl: `/projects/${projectId}/estimate`,
        actionLabel: "Go to Estimate Tab",
      })
    }

    // Category breakdown
    const categoryBreakdown: Record<string, { count: number; hours: number }> = {}
    // Confidence breakdown
    const confidenceBreakdown: Record<string, { count: number; hours: number }> = {
      high: { count: 0, hours: 0 },
      medium: { count: 0, hours: 0 },
      low: { count: 0, hours: 0 },
      spike: { count: 0, hours: 0 },
    }

    for (const c of components) {
      const cat = c.category || "Other"
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, hours: 0 }
      }
      categoryBreakdown[cat].count += 1
      categoryBreakdown[cat].hours += c.base_hours || 0

      const conf = (c.confidence_level || "medium").toLowerCase()
      if (confidenceBreakdown[conf]) {
        confidenceBreakdown[conf].count += 1
        confidenceBreakdown[conf].hours += c.base_hours || 0
      }
    }

    // 4. Fetch current Overhead Configuration
    const currentConfig = db
      .prepare("SELECT * FROM overhead_config WHERE project_id = ?")
      .get(projectId) as any

    // 5. Generate cache fingerprint (context_hash)
    const contextFingerprint = {
      description: project.description || "",
      executive_summary: project.executive_summary || "",
      constructionHours,
      categoryBreakdown,
      confidenceBreakdown,
    }
    const contextHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(contextFingerprint))
      .digest("hex")

    // 6. Check cache if not regenerating
    if (!regenerate) {
      const cached = db
        .prepare(
          "SELECT recommendation_json, context_hash FROM project_ai_recommendations WHERE project_id = ? AND tab = ?"
        )
        .get(projectId, tab) as { recommendation_json: string; context_hash: string } | undefined

      if (cached && cached.context_hash === contextHash) {
        try {
          const parsed = JSON.parse(cached.recommendation_json)
          console.log(`[AI Copilot] Cache hit for project ${projectId} tab ${tab}`)
          return Response.json({
            status: "ready",
            cached: true,
            data: parsed,
          })
        } catch {
          // If parse fails, fall through to regenerate
        }
      }
    }

    // 7. Build AI Prompt for Overhead Recommendations
    const prompt = `You are a software delivery estimation expert specializing in professional services, agency, and enterprise software estimation.

Analyze the following project delivery context and generate recommended overhead tiers (percentages and enabled/disabled status) and project contingency.

=== PROJECT CONTEXT ===
Project Name: ${project.name}
Client: ${project.client_name || "General Client"}
Project Description: ${project.description || "Not provided"}
Executive Summary: ${project.executive_summary || "Not provided"}

=== WBS ESTIMATE BASE ===
Total Construction Hours: ${constructionHours.toFixed(1)} hrs (${components.length} components)

Category Breakdown:
${Object.entries(categoryBreakdown)
  .map(([cat, d]) => `- ${cat}: ${d.hours.toFixed(1)} hrs (${d.count} items, ${((d.hours / constructionHours) * 100).toFixed(1)}%)`)
  .join("\n")}

Confidence Distribution:
- High Confidence: ${confidenceBreakdown.high.hours.toFixed(1)} hrs (${((confidenceBreakdown.high.hours / constructionHours) * 100).toFixed(1)}%)
- Medium Confidence: ${confidenceBreakdown.medium.hours.toFixed(1)} hrs (${((confidenceBreakdown.medium.hours / constructionHours) * 100).toFixed(1)}%)
- Low Confidence: ${confidenceBreakdown.low.hours.toFixed(1)} hrs (${((confidenceBreakdown.low.hours / constructionHours) * 100).toFixed(1)}%)
- Spike / Discovery: ${confidenceBreakdown.spike.hours.toFixed(1)} hrs

Current Overhead Settings:
- Layer 1 (Direct Effort % of Base): BA=${currentConfig?.ba_percent ?? 10}% (${currentConfig?.ba_enabled ? "ON" : "OFF"}), QA=${currentConfig?.qa_percent ?? 15}% (${currentConfig?.qa_enabled ? "ON" : "OFF"}), DevOps=${currentConfig?.devops_percent ?? 8}% (${currentConfig?.devops_enabled ? "ON" : "OFF"}), UX=${currentConfig?.ux_percent ?? 5}% (${currentConfig?.ux_enabled ? "ON" : "OFF"})
- Layer 2 (Management % of L1 Subtotal): PM=${currentConfig?.pm_percent ?? 12}% (${currentConfig?.pm_enabled ? "ON" : "OFF"}), Change Mgmt=${currentConfig?.change_mgmt_percent ?? 5}% (${currentConfig?.change_mgmt_enabled ? "ON" : "OFF"}), Solutions Arch=${currentConfig?.solutions_arch_percent ?? 5}% (${currentConfig?.solutions_arch_enabled ? "ON" : "OFF"}), Training=${currentConfig?.training_percent ?? 5}% (${currentConfig?.training_enabled ? "ON" : "OFF"}), Warranty=${currentConfig?.warranty_percent ?? 10}% (${currentConfig?.warranty_enabled ? "ON" : "OFF"}), Risk Buffer=${currentConfig?.risk_buffer_percent ?? 5}% (${currentConfig?.risk_buffer_enabled ? "ON" : "OFF"})
- Project Contingency: ${currentConfig?.project_contingency_percent ?? 10}%

=== OVERHEAD RULES & GUIDELINES ===
1. Layer 1 applies directly to the WBS Estimate Base:
   - Business Analysis (BA): Standard 8-12%. Increase if user stories/requirements are complex or vague.
   - Quality Assurance (QA): Standard 12-20%. Increase for heavy backend, data analytics, integration, or low-confidence components.
   - DevOps / Infrastructure: Standard 5-10%. Enable if backend, infrastructure, mobile, or cloud is present.
   - UX / Design: Standard 5-10%. Enable if frontend, mobile, or user stories are prominent.
2. Layer 2 applies to the Layer 1 Subtotal (Cascading):
   - Project Management (PM): Standard 10-15%. Essential for all client engagements.
   - Change Management: 3-8%. Enable if enterprise transformation, workflow changes, or training is needed.
   - Solutions Architecture: 4-8%. Crucial if integration, backend, security, or enterprise architecture is present.
   - Training & Enablement: 3-6%. Enable if client handoff or end-user adoption is mentioned.
   - Warranty / Hypercare: 5-10%. Enable for production delivery stability post-launch.
   - Risk Buffer: 3-8%. Enable if significant technical uncertainty exists.
3. Project Contingency: Applied to the Grand Total.
   - Standard is 10-15%. If low confidence hours exceed 25% of the project, consider 15-20%. If high confidence exceeds 70%, 5-10% is sufficient.
4. CRITICAL DETERMINISTIC RULE:
   - DO NOT calculate hours or totals. You are ONLY recommending percentages and enabled flags.
   - The software's deterministic formula engine will calculate all resulting hours and totals automatically.

=== OUTPUT SCHEMA ===
Output ONLY valid JSON matching this structure:
{
  "rationale": "2-3 clear sentences explaining why these specific overhead tiers and contingency were recommended for this project.",
  "keyFactors": [
    "Short bullet explaining key driver (e.g. 'Frontend & User Stories comprise 45% of base, requiring UX and BA')",
    "Short bullet explaining testing/stability driver",
    "Short bullet explaining contingency driver based on confidence distribution"
  ],
  "recommendations": {
    "ba_enabled": boolean,
    "ba_percent": number,
    "qa_enabled": boolean,
    "qa_percent": number,
    "devops_enabled": boolean,
    "devops_percent": number,
    "ux_enabled": boolean,
    "ux_percent": number,
    "pm_enabled": boolean,
    "pm_percent": number,
    "change_mgmt_enabled": boolean,
    "change_mgmt_percent": number,
    "solutions_arch_enabled": boolean,
    "solutions_arch_percent": number,
    "training_enabled": boolean,
    "training_percent": number,
    "warranty_enabled": boolean,
    "warranty_percent": number,
    "risk_buffer_enabled": boolean,
    "risk_buffer_percent": number,
    "project_contingency_percent": number
  }
}`

    console.log(`[AI Copilot] Requesting overhead recommendations from NVIDIA NIM for project ${projectId}...`)

    const rawResponse = await callNvidiaWithRetry(prompt, {
      systemPrompt:
        "You are an expert software delivery estimation consultant. Output ONLY a valid JSON object matching the requested schema.",
      temperature: 0.2,
      maxTokens: 2048,
    })

    const cleanJson = extractCleanJson(rawResponse)
    const rawParsed = JSON.parse(cleanJson)

    // Normalize and validate
    const rawRecs = rawParsed.recommendations || {}
    const recommendationData: OverheadRecommendationData = {
      rationale: typeof rawParsed.rationale === "string" ? rawParsed.rationale : "AI recommended overhead tiers based on project scope and category distribution.",
      keyFactors: Array.isArray(rawParsed.keyFactors) ? rawParsed.keyFactors.map(String) : [],
      recommendations: {
        ba_enabled: toBoolean(rawRecs.ba_enabled, true),
        ba_percent: clampPercent(rawRecs.ba_percent, 10),
        qa_enabled: toBoolean(rawRecs.qa_enabled, true),
        qa_percent: clampPercent(rawRecs.qa_percent, 15),
        devops_enabled: toBoolean(rawRecs.devops_enabled, true),
        devops_percent: clampPercent(rawRecs.devops_percent, 8),
        ux_enabled: toBoolean(rawRecs.ux_enabled, false),
        ux_percent: clampPercent(rawRecs.ux_percent, 5),

        pm_enabled: toBoolean(rawRecs.pm_enabled, true),
        pm_percent: clampPercent(rawRecs.pm_percent, 12),
        change_mgmt_enabled: toBoolean(rawRecs.change_mgmt_enabled, false),
        change_mgmt_percent: clampPercent(rawRecs.change_mgmt_percent, 5),
        solutions_arch_enabled: toBoolean(rawRecs.solutions_arch_enabled, true),
        solutions_arch_percent: clampPercent(rawRecs.solutions_arch_percent, 5),
        training_enabled: toBoolean(rawRecs.training_enabled, false),
        training_percent: clampPercent(rawRecs.training_percent, 5),
        warranty_enabled: toBoolean(rawRecs.warranty_enabled, true),
        warranty_percent: clampPercent(rawRecs.warranty_percent, 10),
        risk_buffer_enabled: toBoolean(rawRecs.risk_buffer_enabled, false),
        risk_buffer_percent: clampPercent(rawRecs.risk_buffer_percent, 5),

        project_contingency_percent: clampPercent(rawRecs.project_contingency_percent, 10),
      },
    }

    // 8. Save to cache
    const id = crypto.randomUUID()
    db.prepare(`
      INSERT INTO project_ai_recommendations (id, project_id, tab, context_hash, recommendation_json, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project_id, tab) DO UPDATE SET
        context_hash = excluded.context_hash,
        recommendation_json = excluded.recommendation_json,
        created_at = CURRENT_TIMESTAMP
    `).run(id, projectId, tab, contextHash, JSON.stringify(recommendationData))

    console.log(`[AI Copilot] Cached overhead recommendation for project ${projectId}`)

    return Response.json({
      status: "ready",
      cached: false,
      data: recommendationData,
    })
  } catch (err: unknown) {
    const classified = classifyNvidiaError(err)
    console.error(`[AI Copilot] Error generating overhead recommendation:`, classified)
    return Response.json(
      {
        success: false,
        status: "error",
        error: `AI analysis failed: ${classified.message}`,
        category: classified.category,
      },
      { status: classified.isTransient ? 503 : 500 }
    )
  }
}
