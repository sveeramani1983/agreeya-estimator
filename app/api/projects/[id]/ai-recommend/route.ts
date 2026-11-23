import { getDb } from "@/lib/db"
import { callNvidiaWithRetry, extractCleanJson, classifyNvidiaError } from "@/lib/ai-provider"
import {
  getFinalEstimatedHours,
  getLaborCosts,
  getAdditionalCosts,
  getCommercialsConfig,
} from "@/lib/actions"
import { getClientIntelligence } from "@/lib/intelligence"
import { RateCardItem, TriggerType } from "@/lib/types"
import { format, addWeeks, addMonths, parseISO, eachWeekOfInterval, eachMonthOfInterval } from "date-fns"
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

export interface RecommendedStaffRole {
  name: string
  role: string
  location: "onsite" | "offshore"
  rate_per_hour: number
  total_hours: number
  total_cost: number
  allocation_start: string
  allocation_end: string
  rationale: string
  period_loading: Record<string, number>
}

export interface ResourceRecommendationData {
  rationale: string
  keyFactors: string[]
  targetHours: number
  recommendedTotalHours: number
  recommendedTotalCost: number
  blendedRate: number
  onsiteHours: number
  offshoreHours: number
  onsitePercent: number
  offshorePercent: number
  staffing: RecommendedStaffRole[]
}

export interface PreliminaryMilestoneRecommendation {
  title: string
  trigger_type: TriggerType
  percentage: number
  amount: number
  description: string
  deliverables?: string
  timing_hint: string
  is_preliminary: true
}

export interface CommercialsRecommendationData {
  targetMarginPercent: number
  pricingStrategy: string
  pricingRationale: string
  commercialConsiderations: string[]
  quoteNarrative: string
  preliminaryMilestones: PreliminaryMilestoneRecommendation[]
  authoritativeCost: {
    loadedLaborCost: number
    loadedLaborHours: number
    totalAdditionalCosts: number
    subtotalCost: number
    resourceBlendedRate: number
  }
  authoritativePricing: {
    recommendedMarginPercent: number
    marginAmount: number
    preTaxTotal: number
    blendedSellRate: number
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

    if (tab !== "overhead" && tab !== "resources" && tab !== "commercials") {
      return Response.json(
        { success: false, error: `AI recommendation for tab '${tab}' is not supported yet.` },
        { status: 400 }
      )
    }

    const db = getDb()

    // 1. Fetch Project
    const project = db
      .prepare(
        "SELECT id, name, client_name, client_id, description, executive_summary, timeline_start, timeline_end, timeline_mode, timeline_duration_value, timeline_duration_unit, loading_period_type FROM projects WHERE id = ?"
      )
      .get(projectId) as {
        id: string
        name: string
        client_name: string | null
        client_id: string | null
        description: string | null
        executive_summary: string | null
        timeline_start: string | null
        timeline_end: string | null
        timeline_mode: string | null
        timeline_duration_value: number | null
        timeline_duration_unit: string | null
        loading_period_type: string | null
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

    // Category breakdown
    const categoryBreakdown: Record<string, { count: number; hours: number }> = {}
    const confidenceBreakdown: Record<string, { count: number; hours: number }> = {
      high: { count: 0, hours: 0 },
      medium: { count: 0, hours: 0 },
      low: { count: 0, hours: 0 },
      spike: { count: 0, hours: 0 },
    }

    for (const c of components) {
      const cat = c.category || "Uncategorized"
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, hours: 0 }
      }
      categoryBreakdown[cat].count += 1
      categoryBreakdown[cat].hours += c.base_hours || 0

      const conf = (c.confidence_level || "medium").toLowerCase()
      if (conf === "high" || conf === "medium" || conf === "low" || conf === "spike") {
        confidenceBreakdown[conf].count += 1
        confidenceBreakdown[conf].hours += c.base_hours || 0
      }
    }

    // =========================================================================
    // TAB: OVERHEAD
    // =========================================================================
    if (tab === "overhead") {
      // PAUSE CONDITION CHECK: If WBS construction hours are zero, do not call AI.
      if (constructionHours <= 0 || components.length === 0) {
        return Response.json({
          status: "paused",
          reason: "zero_construction_hours",
          message:
            "The WBS has 0 estimated hours. Please add and estimate components on the Estimate tab before configuring overheads.",
          actionUrl: `/projects/${projectId}/estimate`,
          actionLabel: "Go to Estimate Tab",
        })
      }

      // Fetch current Overhead Configuration
      const currentConfig = db
        .prepare("SELECT * FROM overhead_config WHERE project_id = ?")
        .get(projectId) as any

      // Generate cache fingerprint (context_hash)
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

      // Check cache if not regenerating
      if (!regenerate) {
        const cached = db
          .prepare(
            "SELECT recommendation_json, context_hash FROM project_ai_recommendations WHERE project_id = ? AND tab = 'overhead'"
          )
          .get(projectId) as { recommendation_json: string; context_hash: string } | undefined

        if (cached && cached.context_hash === contextHash) {
          try {
            const parsed = JSON.parse(cached.recommendation_json)
            console.log(`[AI Copilot] Cache hit for project ${projectId} tab overhead`)
            return Response.json({
              status: "ready",
              cached: true,
              data: parsed,
            })
          } catch {}
        }
      }

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

=== CRITICAL REQUIREMENT ===
Output ONLY valid JSON matching this schema:
{
  "rationale": "Comprehensive explanation (3-4 sentences) justifying the recommendations based on scope, technical complexity, and risk profile.",
  "keyFactors": [
    "Specific factor 1 observed in the project scope",
    "Specific factor 2 justifying a percentage choice",
    "Specific factor 3 explaining risk or contingency"
  ],
  "recommendations": {
    "ba_enabled": true,
    "ba_percent": 10.0,
    "qa_enabled": true,
    "qa_percent": 16.0,
    "devops_enabled": true,
    "devops_percent": 8.0,
    "ux_enabled": false,
    "ux_percent": 5.0,
    "pm_enabled": true,
    "pm_percent": 12.0,
    "change_mgmt_enabled": false,
    "change_mgmt_percent": 5.0,
    "solutions_arch_enabled": true,
    "solutions_arch_percent": 6.0,
    "training_enabled": false,
    "training_percent": 5.0,
    "warranty_enabled": true,
    "warranty_percent": 8.0,
    "risk_buffer_enabled": false,
    "risk_buffer_percent": 5.0,
    "project_contingency_percent": 12.0
  }
}`

      console.log(`[AI Copilot] Requesting overhead recommendations from NVIDIA NIM for project ${projectId}...`)

      const rawResponse = await callNvidiaWithRetry(prompt, {
        systemPrompt:
          "You are an expert software estimation engineer. Output ONLY a valid JSON object matching the requested schema.",
        temperature: 0.2,
      })

      const cleanJson = extractCleanJson(rawResponse)
      const rawParsed = JSON.parse(cleanJson)

      const rawRecs = rawParsed.recommendations || {}
      const recommendationData: OverheadRecommendationData = {
        rationale:
          typeof rawParsed.rationale === "string"
            ? rawParsed.rationale
            : "AI recommended overhead calibration based on project scope, category breakdown, and risk confidence profile.",
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

      // Save to cache
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
    }

    // =========================================================================
    // TAB: RESOURCES
    // =========================================================================
    if (tab === "resources") {
      // 1. Calculate final estimated hours target (construction + overheads)
      const totalEstimatedHours = await getFinalEstimatedHours(projectId)

      // Pause Condition A: Zero Estimated Hours
      if (totalEstimatedHours <= 0) {
        return Response.json({
          status: "paused",
          reason: "zero_estimated_hours",
          message:
            "Total estimated effort (WBS construction + overhead) is 0 hours. Please add and estimate components on the Estimate and Overhead tabs before creating a staffing plan.",
          actionUrl: `/projects/${projectId}/estimate`,
          actionLabel: "Go to Estimate Tab",
          missingField: "estimate",
        })
      }

      // 2. Fetch Project Timeline
      const timelineStart = project.timeline_start
      let effectiveEnd = project.timeline_end

      if (project.timeline_mode === "duration" && timelineStart && project.timeline_duration_value) {
        try {
          const s = parseISO(timelineStart)
          const computedEnd =
            project.timeline_duration_unit === "months"
              ? addMonths(s, project.timeline_duration_value)
              : addWeeks(s, project.timeline_duration_value)
          effectiveEnd = format(computedEnd, "yyyy-MM-dd")
        } catch {}
      }

      // Pause Condition B: Missing timeline dates/duration
      if (!timelineStart || !effectiveEnd || effectiveEnd <= timelineStart) {
        return Response.json({
          status: "paused",
          reason: "missing_timeline",
          message:
            "Project timeline (start date and duration or end date) is not configured. Staffing AI requires a project timeline to schedule role allocations across delivery periods.",
          actionLabel: "Configure Project Timeline",
          missingField: "timeline",
        })
      }

      // 3. Fetch Rate Card
      const rateCard = db
        .prepare(
          "SELECT id, role_title, standard_rate, onsite_rate, offshore_rate, notes FROM rate_card ORDER BY role_title"
        )
        .all() as RateCardItem[]

      // Pause Condition C: Empty Rate Card
      if (!rateCard || rateCard.length === 0) {
        return Response.json({
          status: "paused",
          reason: "empty_rate_card",
          message:
            "The Rate Card has no active roles or rates. Staffing AI selects roles directly from your active Rate Card without inventing billing rates.",
          actionUrl: "/rate-card",
          actionLabel: "Go to Rate Card",
          missingField: "rateCard",
        })
      }

      // 4. Generate delivery periods
      const periodType: "weekly" | "monthly" =
        project.loading_period_type === "monthly" ? "monthly" : "weekly"
      let periods: Array<{ key: string; label: string }> = []
      try {
        const sDate = parseISO(timelineStart)
        const eDate = parseISO(effectiveEnd)
        if (periodType === "weekly") {
          periods = eachWeekOfInterval({ start: sDate, end: eDate }).map((date) => ({
            key: format(date, "yyyy-MM-dd"),
            label: format(date, "MMM d, yyyy"),
          }))
        } else {
          periods = eachMonthOfInterval({ start: sDate, end: eDate }).map((date) => ({
            key: format(date, "yyyy-MM"),
            label: format(date, "MMM yyyy"),
          }))
        }
      } catch {}

      if (periods.length === 0) {
        return Response.json({
          status: "paused",
          reason: "invalid_timeline_dates",
          message:
            "Could not generate delivery periods from the timeline dates. Please check start and end dates.",
          actionLabel: "Adjust Timeline Dates",
          missingField: "timeline",
        })
      }

      // Pause Condition D: Timeline Capacity Constraint
      const avgTeamPace = totalEstimatedHours / periods.length
      const minRecommendedPeriods = periodType === "weekly"
        ? Math.max(2, Math.ceil(totalEstimatedHours / 120))
        : Math.max(1, Math.ceil(totalEstimatedHours / 480))

      if (periods.length < 2 && totalEstimatedHours > 160) {
        return Response.json({
          status: "paused",
          reason: "timeline_capacity_constrained",
          message: `The project timeline (${periods.length} ${periodType === "weekly" ? "week" : "month"}) cannot reasonably accommodate ${totalEstimatedHours.toFixed(0)} estimated hours. Squeezing this effort into a single period exceeds standard delivery capacity. Please extend the project timeline to at least ${minRecommendedPeriods} ${periodType === "weekly" ? "weeks" : "months"}.`,
          actionLabel: "Extend Project Timeline",
          missingField: "timeline",
        })
      }

      const maxPace = periodType === "weekly" ? 300 : 1200
      if (avgTeamPace > maxPace && totalEstimatedHours > 300) {
        return Response.json({
          status: "paused",
          reason: "timeline_capacity_constrained",
          message: `The requested timeline (${periods.length} ${periodType === "weekly" ? "weeks" : "months"}) requires an average delivery pace of ${avgTeamPace.toFixed(1)} hrs/${periodType === "weekly" ? "wk" : "mo"} across the team, which exceeds standard capacity for this scope. Please extend the timeline to at least ${minRecommendedPeriods} ${periodType === "weekly" ? "weeks" : "months"} to allow a balanced delivery schedule.`,
          actionLabel: "Extend Project Timeline",
          missingField: "timeline",
        })
      }

      // 5. Check Cache
      const contextFingerprint = {
        tab: "resources",
        totalEstimatedHours,
        constructionHours,
        timelineStart,
        effectiveEnd,
        periodType,
        periodsCount: periods.length,
        categoryBreakdown,
        rateCardHash: rateCard.map((r) => `${r.role_title}-${r.onsite_rate}-${r.offshore_rate}`).join(";"),
      }
      const contextHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(contextFingerprint))
        .digest("hex")

      if (!regenerate) {
        const cached = db
          .prepare(
            "SELECT recommendation_json, context_hash FROM project_ai_recommendations WHERE project_id = ? AND tab = 'resources'"
          )
          .get(projectId) as { recommendation_json: string; context_hash: string } | undefined

        if (cached && cached.context_hash === contextHash) {
          try {
            const parsed = JSON.parse(cached.recommendation_json)
            console.log(`[AI Copilot] Cache hit for project ${projectId} tab resources`)
            return Response.json({
              status: "ready",
              cached: true,
              data: parsed,
            })
          } catch {}
        }
      }

      // 6. Build Prompt for NVIDIA NIM
      const avgTeamHoursPerPeriod = (totalEstimatedHours / periods.length).toFixed(1)
      const prompt = `You are a software delivery staffing and resource management expert.
Analyze the project requirements, delivery timeline, target hours, and rate card to recommend an optimal staffing plan.

=== CRITICAL BUDGET CONSTRAINT ===
AUTHORITATIVE EFFORT BUDGET: ${totalEstimatedHours.toFixed(1)} hrs total (including WBS construction effort, accepted cascading overheads, and contingency).
TIMELINE DURATION: ${periods.length} ${periodType} periods (${timelineStart} to ${effectiveEnd}).
AVERAGE COMBINED TEAM PACE: ${avgTeamHoursPerPeriod} hrs/${periodType === "weekly" ? "week" : "month"} TOTAL across the ENTIRE team combined!

THE TIMELINE CONTROLS WHEN ESTIMATED EFFORT IS DELIVERED, NOT HOW MUCH EFFORT IS CREATED.
DO NOT CREATE MORE EFFORT THAN THE ${totalEstimatedHours.toFixed(0)} HOUR BUDGET.
The sum of all allocated hours across ALL roles and ALL periods MUST strictly target 100% of ${totalEstimatedHours.toFixed(0)} hours (tolerance ±5%, between ${(totalEstimatedHours * 0.95).toFixed(0)} and ${(totalEstimatedHours * 1.05).toFixed(0)} hrs).

=== PROJECT CONTEXT ===
Project Name: ${project.name}
Client: ${project.client_name || "General Client"}
Description: ${project.description || "Not provided"}
Executive Summary: ${project.executive_summary || "Not provided"}

=== TIMELINE & DELIVERY PARAMETERS ===
Start Date: ${timelineStart}
End Date: ${effectiveEnd}
Delivery Schedule Type: ${periodType} (${periods.length} periods)
Periods to allocate: ${periods.map((p) => p.key).join(", ")}

=== TARGET EFFORT TO STAFF ===
Target Total Hours: ${totalEstimatedHours.toFixed(1)} hrs
Construction Effort: ${constructionHours.toFixed(1)} hrs across ${components.length} components

Category Breakdown:
${Object.entries(categoryBreakdown)
  .map(([cat, d]) => `- ${cat}: ${d.hours.toFixed(1)} hrs`)
  .join("\n")}

=== AVAILABLE ROLES FROM RATE CARD ===
${rateCard
  .map(
    (rc) =>
      `- "${rc.role_title}"${rc.notes ? ` (${rc.notes})` : ""} | Onsite: $${rc.onsite_rate || rc.standard_rate}/hr | Offshore: $${rc.offshore_rate || rc.standard_rate}/hr`
  )
  .join("\n")}

=== STAFFING RULES & GUIDELINES ===
1. RIGHT-SIZE THE TEAM:
   - For an effort of ~${totalEstimatedHours.toFixed(0)} hrs across ${periods.length} periods, recommend a lean team of 3 to 6 distinct roles.
   - Do NOT create a bloated team of 10+ heavily loaded roles.
2. DO NOT LOAD EVERY RESOURCE FOR EVERY WEEK:
   - Roles must NOT be loaded for every available week. Most roles should have 0 hours in periods when they are not actively contributing.
   - For example:
     * Architecture / Business Analysis: Front-loaded in early periods (e.g. weeks 1-3), then 0 or minimal advisory (2-5 hrs/wk) during build.
     * Core Developers (Full-Stack / Frontend / Backend): Concentrated in the middle build periods, ramping up after architecture.
     * QA / Testing: Starts with light test planning around mid-project, peaks during testing/UAT periods near the end, then ramps down.
     * Project Manager: Steady governance throughout at fractional loading (e.g. 5-10 hrs/wk, NOT 40 hrs/wk).
     * DevOps: Concentrated in setup periods (weeks 1-2) and release/cutover periods.
3. WEEKLY LOADING AMOUNTS:
   - Remember: The ENTIRE team combined only has ${avgTeamHoursPerPeriod} hrs/week on average!
   - Individual weekly loadings should typically be fractional/part-time (e.g. 5, 10, 15, 20, or 25 hrs/wk per person).
   - Only 1 core developer might work 30-40 hrs/wk during peak sprint weeks.
4. ONSITE vs. OFFSHORE LOCATION:
   - Assign each role to either "onsite" or "offshore".
   - Client-facing / leadership roles (e.g. Project Manager, Lead Architect) are typically Onsite.
   - Core engineering and QA roles are typically Offshore or Blended for cost efficiency.
5. STRICT DETERMINISTIC RULES:
   - Select roles ONLY from the available Rate Card roles listed above.
   - Do NOT invent custom billing rates. Billing rates are populated deterministically by the system from the Rate Card.
   - The total sum of all hours across all roles must equal approximately ${totalEstimatedHours.toFixed(0)} hrs (±5%).

=== OUTPUT SCHEMA ===
Output ONLY valid JSON matching this structure:
{
  "rationale": "3-4 sentence executive summary of the staffing plan, team structure, and delivery strategy.",
  "keyFactors": [
    "Short bullet explaining key driver (e.g. 'Project Manager loaded at 5-10 hrs/wk throughout duration for governance')",
    "Short bullet explaining core development timing and offshore cost efficiency",
    "Short bullet explaining QA testing allocation timing in later periods"
  ],
  "staffing": [
    {
      "name": "Project Manager",
      "role": "Exact role title matching Rate Card",
      "location": "onsite",
      "rationale": "Clear rationale for role responsibility and timing",
      "period_loading": {
        "${periods[0]?.key || "2026-03-02"}": 10
      }
    }
  ]
}`

      console.log(`[AI Copilot] Requesting staffing plan recommendations from NVIDIA NIM for project ${projectId}...`)

      const rawResponse = await callNvidiaWithRetry(prompt, {
        systemPrompt:
          "You are an expert software delivery staffing consultant. Output ONLY a valid JSON object matching the requested schema.",
        temperature: 0.2,
        maxTokens: 4096,
      })

      const cleanJson = extractCleanJson(rawResponse)
      const rawParsed = JSON.parse(cleanJson)

      // 7. Post-process and normalize staffing roles against Rate Card
      const rawStaffing = Array.isArray(rawParsed.staffing) ? rawParsed.staffing : []
      const normalizedStaffing: RecommendedStaffRole[] = []

      for (let i = 0; i < rawStaffing.length; i++) {
        const item = rawStaffing[i]
        const rawRoleTitle = String(item.role || item.name || "").trim()

        let matchedRc = rateCard.find(
          (rc) => rc.role_title.toLowerCase().trim() === rawRoleTitle.toLowerCase().trim()
        )
        if (!matchedRc) {
          matchedRc =
            rateCard.find((rc) =>
              rc.role_title.toLowerCase().includes(rawRoleTitle.toLowerCase())
            ) ||
            rateCard.find((rc) =>
              rawRoleTitle.toLowerCase().includes(rc.role_title.toLowerCase())
            ) ||
            rateCard[0]
        }

        const location: "onsite" | "offshore" =
          String(item.location).toLowerCase().trim() === "offshore" ? "offshore" : "onsite"

        const rate_per_hour =
          location === "offshore"
            ? (matchedRc.offshore_rate || matchedRc.standard_rate)
            : (matchedRc.onsite_rate || matchedRc.standard_rate)

        // Normalize period loading
        const period_loading: Record<string, number> = {}
        let roleHours = 0
        const rawLoading = item.period_loading || {}

        let firstPeriod = ""
        let lastPeriod = ""

        for (const p of periods) {
          const rawH = rawLoading[p.key]
          const numH = typeof rawH === "number" ? rawH : parseFloat(String(rawH || 0))
          const safeH = isNaN(numH) || numH < 0 ? 0 : Math.round(numH)
          if (safeH > 0) {
            period_loading[p.key] = safeH
            roleHours += safeH
            if (!firstPeriod) firstPeriod = p.key
            lastPeriod = p.key
          } else {
            period_loading[p.key] = 0
          }
        }

        normalizedStaffing.push({
          name: String(item.name || matchedRc.role_title).trim(),
          role: matchedRc.role_title,
          location,
          rate_per_hour,
          total_hours: roleHours,
          total_cost: roleHours * rate_per_hour,
          allocation_start: firstPeriod || timelineStart,
          allocation_end: lastPeriod || effectiveEnd,
          rationale: typeof item.rationale === "string" ? item.rationale : `Allocated for ${matchedRc.role_title} responsibilities.`,
          period_loading,
        })
      }

      // 8. Deterministic Budget Calibration (±5% Target)
      const targetHours = totalEstimatedHours
      const minAcceptableHours = targetHours * 0.95
      const maxAcceptableHours = targetHours * 1.05

      let rawTotalHours = normalizedStaffing.reduce((sum, r) => sum + r.total_hours, 0)

      if (rawTotalHours > 0 && (rawTotalHours < minAcceptableHours || rawTotalHours > maxAcceptableHours)) {
        console.log(
          `[AI Copilot] Calibrating raw staffing hours (${rawTotalHours} hrs) to authoritative budget (${targetHours.toFixed(1)} hrs)`
        )
        const scale = targetHours / rawTotalHours
        let calibratedTotal = 0

        for (const r of normalizedStaffing) {
          let roleHours = 0
          for (const p of periods) {
            const rawH = r.period_loading[p.key] || 0
            if (rawH > 0) {
              const scaledH = Math.round(rawH * scale)
              const safeH = Math.max(0, scaledH)
              r.period_loading[p.key] = safeH
              roleHours += safeH
              calibratedTotal += safeH
            }
          }
          r.total_hours = roleHours
          r.total_cost = roleHours * r.rate_per_hour
        }

        // Adjust small rounding residual onto primary active developer role so total strictly targets ~100%
        let residual = Math.round(targetHours - calibratedTotal)
        if (residual !== 0) {
          const primaryRole =
            normalizedStaffing.find((r) =>
              r.role.toLowerCase().includes("developer") ||
              r.role.toLowerCase().includes("engineer")
            ) || normalizedStaffing[0]

          if (primaryRole) {
            const activePeriodKeys = periods
              .map((p) => p.key)
              .filter((k) => (primaryRole.period_loading[k] || 0) > 0)

            if (activePeriodKeys.length > 0) {
              let idx = 0
              while (residual !== 0 && idx < activePeriodKeys.length * 3) {
                const k = activePeriodKeys[idx % activePeriodKeys.length]
                const cur = primaryRole.period_loading[k]
                if (residual > 0) {
                  primaryRole.period_loading[k] = cur + 1
                  primaryRole.total_hours += 1
                  primaryRole.total_cost += primaryRole.rate_per_hour
                  calibratedTotal += 1
                  residual -= 1
                } else if (residual < 0 && cur > 1) {
                  primaryRole.period_loading[k] = cur - 1
                  primaryRole.total_hours -= 1
                  primaryRole.total_cost -= primaryRole.rate_per_hour
                  calibratedTotal -= 1
                  residual += 1
                }
                idx++
              }
            }
          }
        }
      }

      // Recompute active start/end based on periods that actually have hours > 0
      for (const r of normalizedStaffing) {
        let firstP = ""
        let lastP = ""
        for (const p of periods) {
          if ((r.period_loading[p.key] || 0) > 0) {
            if (!firstP) firstP = p.key
            lastP = p.key
          }
        }
        r.allocation_start = firstP || timelineStart
        r.allocation_end = lastP || effectiveEnd
      }

      const activeStaffing = normalizedStaffing.filter((r) => r.total_hours > 0)
      const finalStaffing = activeStaffing.length > 0 ? activeStaffing : normalizedStaffing

      // Calculate totals
      const recommendedTotalHours = finalStaffing.reduce((sum, r) => sum + r.total_hours, 0)
      const recommendedTotalCost = finalStaffing.reduce((sum, r) => sum + r.total_cost, 0)
      const blendedRate =
        recommendedTotalHours > 0 ? Math.round((recommendedTotalCost / recommendedTotalHours) * 100) / 100 : 0

      const onsiteHours = finalStaffing
        .filter((r) => r.location === "onsite")
        .reduce((sum, r) => sum + r.total_hours, 0)
      const offshoreHours = recommendedTotalHours - onsiteHours
      const onsitePercent =
        recommendedTotalHours > 0 ? Math.round((onsiteHours / recommendedTotalHours) * 100) : 0
      const offshorePercent =
        recommendedTotalHours > 0 ? Math.round((offshoreHours / recommendedTotalHours) * 100) : 0

      const recommendationData: ResourceRecommendationData = {
        rationale:
          typeof rawParsed.rationale === "string"
            ? rawParsed.rationale
            : "AI recommended staffing plan based on delivery timeline and target hours.",
        keyFactors: Array.isArray(rawParsed.keyFactors) ? rawParsed.keyFactors.map(String) : [],
        targetHours: totalEstimatedHours,
        recommendedTotalHours,
        recommendedTotalCost,
        blendedRate,
        onsiteHours,
        offshoreHours,
        onsitePercent,
        offshorePercent,
        staffing: finalStaffing,
      }

      // Save to cache
      const id = crypto.randomUUID()
      db.prepare(`
        INSERT INTO project_ai_recommendations (id, project_id, tab, context_hash, recommendation_json, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id, tab) DO UPDATE SET
          context_hash = excluded.context_hash,
          recommendation_json = excluded.recommendation_json,
          created_at = CURRENT_TIMESTAMP
      `).run(id, projectId, "resources", contextHash, JSON.stringify(recommendationData))

      console.log(`[AI Copilot] Cached staffing recommendation for project ${projectId}`)

      return Response.json({
        status: "ready",
        cached: false,
        data: recommendationData,
      })
    }

    // =========================================================================
    // TAB: COMMERCIALS
    // =========================================================================
    if (tab === "commercials") {
      // Pause Condition A: Zero WBS effort
      if (constructionHours <= 0 || components.length === 0) {
        return Response.json({
          status: "paused",
          reason: "zero_construction_hours",
          message:
            "The WBS has 0 estimated hours. Please add and estimate components on the Estimate tab before configuring commercial pricing.",
          actionUrl: `/projects/${projectId}/estimate`,
          actionLabel: "Go to Estimate Tab",
          missingField: "estimate",
        })
      }

      // 1. Fetch Resources & Labor Costs
      const laborCosts = await getLaborCosts(projectId)
      const loadedLaborCost = laborCosts.reduce((acc, curr) => acc + curr.total_cost, 0)
      const loadedLaborHours = laborCosts.reduce((acc, curr) => acc + curr.total_hours, 0)
      const resourceBlendedRate = loadedLaborHours > 0 ? loadedLaborCost / loadedLaborHours : 0

      // Pause Condition B: Zero Labor Cost / Zero Staffed Hours
      if (loadedLaborCost <= 0 || loadedLaborHours <= 0) {
        return Response.json({
          status: "paused",
          reason: "zero_labor_cost",
          message:
            "The project currently has 0 staffed hours and $0 labor cost. Commercials AI requires an accepted staffing plan and labor cost baseline before recommending margins, pricing strategy, and payment milestones.",
          actionUrl: `/projects/${projectId}/resources`,
          actionLabel: "Go to Resources Tab",
          missingField: "resources",
        })
      }

      // 2. Fetch Additional Costs & Commercials Config
      const additionalCosts = await getAdditionalCosts(projectId)
      const totalAdditionalCosts = additionalCosts.reduce((acc, curr) => {
        const lineTotal = curr.cost_type === "monthly" ? (curr.amount || 0) * (curr.duration_months || 1) : (curr.amount || 0)
        return acc + lineTotal
      }, 0)

      const commercialsConfig = await getCommercialsConfig(projectId)

      // 3. Fetch Client Intelligence if client_id exists
      const clientIntelligence = project.client_id
        ? await getClientIntelligence(project.client_id)
        : null

      // 4. Summarize staffing distribution
      const onsiteItems = laborCosts.filter((l) => l.location !== "offshore")
      const offshoreItems = laborCosts.filter((l) => l.location === "offshore")
      const onsiteHours = onsiteItems.reduce((a, b) => a + b.total_hours, 0)
      const offshoreHours = offshoreItems.reduce((a, b) => a + b.total_hours, 0)
      const onsitePercent = loadedLaborHours > 0 ? Math.round((onsiteHours / loadedLaborHours) * 100) : 0
      const offshorePercent = loadedLaborHours > 0 ? Math.round((offshoreHours / loadedLaborHours) * 100) : 0

      // 5. Total baseline cost (labor + additional costs)
      const subtotalCost = loadedLaborCost + totalAdditionalCosts

      // 6. Check Cache
      const contextFingerprint = {
        tab: "commercials",
        loadedLaborCost,
        loadedLaborHours,
        resourceBlendedRate,
        totalAdditionalCosts,
        subtotalCost,
        constructionHours,
        contingencyBreakdown: confidenceBreakdown,
        onsiteHours,
        offshoreHours,
        clientIntelligence: clientIntelligence
          ? {
              won: clientIntelligence.won,
              lost: clientIntelligence.lost,
              winRate: clientIntelligence.winRate,
              avgWinMargin: clientIntelligence.avgWinMargin,
              marginSuggestion: clientIntelligence.marginSuggestion,
            }
          : null,
        ratesIncludeMargin: commercialsConfig?.rates_include_margin ?? false,
        projectName: project.name,
        clientName: project.client_name,
        description: project.description || "",
      }

      const contextHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(contextFingerprint))
        .digest("hex")

      if (!regenerate) {
        const cached = db
          .prepare(
            "SELECT recommendation_json, context_hash FROM project_ai_recommendations WHERE project_id = ? AND tab = 'commercials'"
          )
          .get(projectId) as { recommendation_json: string; context_hash: string } | undefined

        if (cached && cached.context_hash === contextHash) {
          try {
            const parsed = JSON.parse(cached.recommendation_json)
            console.log(`[AI Copilot] Cache hit for project ${projectId} tab commercials`)
            return Response.json({
              status: "ready",
              cached: true,
              data: parsed,
            })
          } catch {}
        }
      }

      // 7. Build Prompt for NVIDIA NIM
      const prompt = `You are a senior commercial director and pricing strategist for an enterprise IT professional services and systems integration consultancy.
Analyze the following accepted project scope, delivery model, staffing costs, and client intelligence to recommend a target margin, pricing strategy, commercial considerations, preliminary payment milestones, and an executive quote narrative.

=== PROJECT & CLIENT CONTEXT ===
Project Name: ${project.name}
Client Name: ${project.client_name || "General Enterprise Client"}
Description: ${project.description || "Not provided"}
Executive Summary: ${project.executive_summary || "Not provided"}

=== CLIENT INTELLIGENCE ===
${
  clientIntelligence
    ? `- Total Pursued Deals: ${clientIntelligence.totalPursued} (Won: ${clientIntelligence.won}, Lost: ${clientIntelligence.lost})
- Historical Win Rate: ${clientIntelligence.winRate !== null ? `${clientIntelligence.winRate.toFixed(1)}%` : "N/A"}
- Historical Average Win Margin: ${clientIntelligence.avgWinMargin !== null ? `${clientIntelligence.avgWinMargin.toFixed(1)}%` : "N/A"}
- Suggested Margin Benchmark: ${clientIntelligence.marginSuggestion !== null ? `${clientIntelligence.marginSuggestion.toFixed(1)}%` : "N/A"}
- Key Client Feedback / Loss Driver: ${clientIntelligence.topLossReason || "None recorded"}
- Strategic Pricing Guidance: ${clientIntelligence.pricingMessage || "Standard competitive pricing"}`
    : "- No historical win/loss data recorded for this client. Apply competitive industry standards (typically 18% - 30% for IT professional services)."
}

=== ACCEPTED SCOPE & DELIVERY BASELINE ===
- Total Estimated WBS Construction Effort: ${constructionHours.toFixed(1)} hrs across ${components.length} components
- Scope Confidence Breakdown: High: ${((confidenceBreakdown.high.hours / (constructionHours || 1)) * 100).toFixed(0)}%, Medium: ${((confidenceBreakdown.medium.hours / (constructionHours || 1)) * 100).toFixed(0)}%, Low/Spike: ${(((confidenceBreakdown.low.hours + confidenceBreakdown.spike.hours) / (constructionHours || 1)) * 100).toFixed(0)}%
- Authoritative Staffed Labor Hours: ${loadedLaborHours.toFixed(1)} hrs
- Authoritative Labor Cost Baseline: $${loadedLaborCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}
- Blended Internal Labor Cost Rate: $${resourceBlendedRate.toFixed(2)}/hr
- Team Delivery Model: ${onsitePercent}% Onsite (${onsiteHours.toFixed(0)} hrs) / ${offshorePercent}% Offshore (${offshoreHours.toFixed(0)} hrs)
- Additional Project Expenses & Licensing: $${totalAdditionalCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}
- Total Authoritative Project Cost Baseline: $${subtotalCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}

=== COMMERCIAL RULES & GUIDELINES ===
1. TARGET MARGIN RECOMMENDATION:
   - Recommend a single target gross margin percentage (e.g. 20.0, 22.5, 25.0).
   - Balance profitability with win probability.
   - If offshore leverage is high (${offshorePercent}%), a healthy margin (20% - 28%) can be achieved while maintaining an attractive blended client bill rate.
   - If scope uncertainty is elevated (high low-confidence/spike hours), factor in appropriate margin buffer or recommend risk provisions.
2. PRICING STRATEGY & RATIONALE:
   - Provide a 3-4 sentence rationale explaining why this margin and pricing approach is optimal for this client and delivery profile.
3. COMMERCIAL CONSIDERATIONS:
   - Provide 3-5 concise bullet points outlining commercial protections (e.g. standard Net 30 payment terms, scope change order governance, client dependency assumptions, etc.).
4. PRELIMINARY PAYMENT MILESTONE STRUCTURE:
   - Pricing must work without completing the detailed project schedule.
   - Recommend 3 to 5 preliminary payment milestones whose percentages sum to EXACTLY 100%.
   - Valid trigger types: "contract_signing", "milestone", "phase_complete", "client_approval", "date".
   - Include a timing hint (e.g. "Mobilization / Project Start", "Mid-Delivery / Sprint 3", "UAT Sign-off", "Final Handover & Acceptance").
   - These milestones are preliminary and will be refined once the Schedule tab is completed.
5. EXECUTIVE QUOTE NARRATIVE:
   - Write a professional, client-facing quote narrative (3-4 paragraphs) suitable for inclusion in an RFP proposal or Statement of Work.
   - Include:
     * Brief solution context and delivery approach (mentioning the cost-effective blended delivery model).
     * Clear statement of commercial structure (fixed-price milestone basis).
     * Key commercial assumptions & exclusions.
     * Invoicing cadence and payment terms.

=== DETERMINISTIC MATH RULE ===
DO NOT invent custom project cost figures. All labor and expense totals are deterministically fixed by the estimator.

=== OUTPUT SCHEMA ===
Output ONLY valid JSON matching this structure:
{
  "targetMarginPercent": 22.5,
  "pricingStrategy": "Summary of pricing strategy (e.g. Competitive value pricing with offshore cost efficiency)",
  "pricingRationale": "3-4 sentence detailed rationale balancing win rate, offshore leverage, and risk.",
  "commercialConsiderations": [
    "Commercial protection / risk consideration bullet 1",
    "Commercial protection / risk consideration bullet 2",
    "Commercial protection / risk consideration bullet 3"
  ],
  "preliminaryMilestones": [
    {
      "title": "Initial Deposit & Engagement Mobilization",
      "trigger_type": "contract_signing",
      "percentage": 20,
      "description": "Mobilization, environment setup, and backlog finalization",
      "deliverables": "Project charter, architecture blueprint, environment readiness",
      "timing_hint": "Project Kickoff / Contract Execution"
    },
    {
      "title": "Core Sprint Delivery & Interim Review",
      "trigger_type": "phase_complete",
      "percentage": 30,
      "description": "Completion of core functional features and initial integration",
      "deliverables": "Working functional increments, code review sign-off",
      "timing_hint": "Mid-Project (Build Phase)"
    },
    {
      "title": "System Integration & UAT Acceptance",
      "trigger_type": "client_approval",
      "percentage": 30,
      "description": "End-to-end integration testing, defect remediation, and client UAT sign-off",
      "deliverables": "UAT acceptance certificate, test reports",
      "timing_hint": "UAT Sign-off"
    },
    {
      "title": "Production Deployment & Final Acceptance",
      "trigger_type": "milestone",
      "percentage": 20,
      "description": "Production cutover, administrative handover, and warranty kickoff",
      "deliverables": "Production release sign-off, handover documentation",
      "timing_hint": "Final Acceptance"
    }
  ],
  "quoteNarrative": "Executive proposal narrative ready for inclusion in client quote..."
}`

      console.log(`[AI Copilot] Requesting commercials recommendations from NVIDIA NIM for project ${projectId}...`)

      const rawResponse = await callNvidiaWithRetry(prompt, {
        systemPrompt:
          "You are an expert commercial director and pricing consultant. Output ONLY a valid JSON object matching the requested schema.",
        temperature: 0.2,
        maxTokens: 4096,
      })

      const cleanJson = extractCleanJson(rawResponse)
      const rawParsed = JSON.parse(cleanJson)

      // Post-process margin percent
      const targetMarginPercent = clampPercent(rawParsed.targetMarginPercent, 20)

      // Deterministic math for pricing
      let marginAmount = 0
      let preTaxTotal = subtotalCost

      if (!commercialsConfig?.rates_include_margin) {
        marginAmount = Math.round(subtotalCost * (targetMarginPercent / 100))
        preTaxTotal = subtotalCost + marginAmount
      }

      const blendedSellRate =
        loadedLaborHours > 0 ? Math.round((preTaxTotal / loadedLaborHours) * 100) / 100 : 0

      // Normalize preliminary milestones so percentages sum to exactly 100%
      const rawMilestones = Array.isArray(rawParsed.preliminaryMilestones)
        ? rawParsed.preliminaryMilestones
        : []

      let rawPercentSum = rawMilestones.reduce((acc: number, m: any) => acc + (Number(m.percentage) || 0), 0)
      if (rawPercentSum <= 0) rawPercentSum = 100

      const validTriggers: TriggerType[] = [
        "contract_signing",
        "milestone",
        "phase_complete",
        "client_approval",
        "date",
      ]

      const preliminaryMilestones: PreliminaryMilestoneRecommendation[] = rawMilestones.map(
        (m: any, idx: number) => {
          const rawPct = Number(m.percentage) || 0
          const normalizedPct = Math.round((rawPct / rawPercentSum) * 100)
          const amount = Math.round(preTaxTotal * (normalizedPct / 100))
          const trigger = validTriggers.includes(m.trigger_type) ? (m.trigger_type as TriggerType) : "milestone"

          return {
            title: String(m.title || `Payment Milestone ${idx + 1}`).trim(),
            trigger_type: trigger,
            percentage: normalizedPct,
            amount,
            description: String(m.description || "").trim(),
            deliverables: m.deliverables ? String(m.deliverables).trim() : undefined,
            timing_hint: String(m.timing_hint || "Schedule-dependent").trim(),
            is_preliminary: true as const,
          }
        }
      )

      // Fine-tune residual percent and amount to ensure exact 100% sum
      const finalPercentSum = preliminaryMilestones.reduce((sum, m) => sum + m.percentage, 0)
      const percentResidual = 100 - finalPercentSum
      if (percentResidual !== 0 && preliminaryMilestones.length > 0) {
        preliminaryMilestones[preliminaryMilestones.length - 1].percentage += percentResidual
        preliminaryMilestones[preliminaryMilestones.length - 1].amount = Math.round(
          preTaxTotal * (preliminaryMilestones[preliminaryMilestones.length - 1].percentage / 100)
        )
      }

      const recommendationData: CommercialsRecommendationData = {
        targetMarginPercent,
        pricingStrategy:
          typeof rawParsed.pricingStrategy === "string"
            ? rawParsed.pricingStrategy
            : "Value-based commercial model aligned with delivery risk profile.",
        pricingRationale:
          typeof rawParsed.pricingRationale === "string"
            ? rawParsed.pricingRationale
            : "Target margin balanced against market competitiveness and delivery efficiency.",
        commercialConsiderations: Array.isArray(rawParsed.commercialConsiderations)
          ? rawParsed.commercialConsiderations.map(String)
          : [],
        quoteNarrative:
          typeof rawParsed.quoteNarrative === "string"
            ? rawParsed.quoteNarrative
            : "Commercial proposal narrative based on accepted project scope and delivery parameters.",
        preliminaryMilestones,
        authoritativeCost: {
          loadedLaborCost,
          loadedLaborHours,
          totalAdditionalCosts,
          subtotalCost,
          resourceBlendedRate,
        },
        authoritativePricing: {
          recommendedMarginPercent: targetMarginPercent,
          marginAmount,
          preTaxTotal,
          blendedSellRate,
        },
      }

      // Save to cache
      const id = crypto.randomUUID()
      db.prepare(`
        INSERT INTO project_ai_recommendations (id, project_id, tab, context_hash, recommendation_json, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id, tab) DO UPDATE SET
          context_hash = excluded.context_hash,
          recommendation_json = excluded.recommendation_json,
          created_at = CURRENT_TIMESTAMP
      `).run(id, projectId, "commercials", contextHash, JSON.stringify(recommendationData))

      console.log(`[AI Copilot] Cached commercials recommendation for project ${projectId}`)

      return Response.json({
        status: "ready",
        cached: false,
        data: recommendationData,
      })
    }

    return Response.json({ success: false, error: "Invalid tab" }, { status: 400 })
  } catch (err: unknown) {
    const classified = classifyNvidiaError(err)
    console.error(`[AI Copilot] Error generating recommendation:`, classified)
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
