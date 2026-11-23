import { getDb } from "@/lib/db"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_TEXT_LENGTH = 25000
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
const NVIDIA_MODEL_ID = "minimaxai/minimax-m3.1-flash"
const NVIDIA_TIMEOUT_MS = 60_000 // 60 seconds initial / stall timeout per attempt
const NVIDIA_MAX_TOTAL_ATTEMPT_MS = 180_000 // 180 seconds hard ceiling per attempt while actively streaming
const NVIDIA_MAX_ATTEMPTS = 2 // Initial attempt + 1 retry
const NVIDIA_RETRY_BACKOFF_MS = 2_000 // 2 seconds backoff before retry
const NVIDIA_MAX_TOKENS = 8192
const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504])

interface LibraryComponentRow {
  id: string
  category: string | null
  component_name: string
  description: string | null
  complexity: "simple" | "medium" | "complex" | "very_complex" | "spike"
  story_points: number
  base_hours: number
}

const VALID_WBS_CATEGORIES = new Set([
  "User Story",
  "Frontend",
  "Backend",
  "Integration",
  "Data/Analytics",
  "Infrastructure",
  "Security",
  "Mobile",
  "Other",
])

const CUSTOM_COMPLEXITY_DEFAULTS: Record<
  "simple" | "medium" | "complex" | "very_complex" | "spike",
  { sp: number; hrs: number }
> = {
  simple:       { sp: 2,  hrs: 8  },
  medium:       { sp: 5,  hrs: 20 },
  complex:      { sp: 13, hrs: 52 },
  very_complex: { sp: 21, hrs: 84 },
  spike:        { sp: 0,  hrs: 0  },
}

const VALID_FIBONACCI_SP = new Set([0.5, 1, 2, 3, 5, 8, 13, 21])
const HRS_PER_SP = 4

// ── PDF extraction via pdfjs-dist (legacy build, no worker) ───────────────────

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js")

  const uint8Array = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  })

  const pdf = await loadingTask.promise
  console.log("[RFP] PDF pages:", pdf.numPages)

  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter((item: any) => "str" in item)
      .map((item: any) => item.str)
      .join(" ")
    parts.push(pageText)
  }

  return parts.join("\n")
}

// ── Gemini prompt ─────────────────────────────────────────────────────────────

const buildPrompt = (text: string, libraryItems: LibraryComponentRow[]) => {
  const libraryCatalogJson = JSON.stringify(
    libraryItems.map((item) => ({
      id: item.id,
      componentName: item.component_name,
      category: item.category || "Other",
      description: item.description || "",
      complexity: item.complexity,
      storyPoints: item.story_points,
      baseHours: item.base_hours,
    })),
    null,
    2
  )

  return `
You are an expert software delivery consultant analyzing an RFP (Request for Proposal) document.

Analyze the following RFP and return a JSON response with this exact structure:

{
  "projectTitle": "string",
  "clientName": "string",
  "projectType": "string",
  "summary": "string (2-3 sentence overview)",
  "timeline": {
    "submissionDeadline": "string or null",
    "projectStartDate": "string or null",
    "projectDuration": "string or null",
    "keyMilestones": ["string"]
  },
  "budget": {
    "estimatedValue": "string or null",
    "budgetRange": "string or null",
    "contractType": "string (Fixed/T&M/Hybrid/Unknown)"
  },
  "requirements": [
    {
      "id": "REQ-001",
      "title": "string",
      "description": "string",
      "type": "functional|non-functional|compliance|technical",
      "priority": "must-have|should-have|nice-to-have",
      "complexity": "simple|medium|complex|very-complex"
    }
  ],
  "technicalRequirements": [
    { "category": "string", "requirement": "string" }
  ],
  "complianceRequirements": [
    { "standard": "string", "description": "string", "mandatory": true }
  ],
  "evaluationCriteria": [
    { "criterion": "string", "weight": "string or null", "description": "string" }
  ],
  "redFlags": [
    { "severity": "high|medium|low", "title": "string", "description": "string", "recommendation": "string" }
  ],
  "opportunities": [
    { "title": "string", "description": "string" }
  ],
  "suggestedWBS": [
    {
      "source": "library|custom",
      "libraryComponentId": "string (exact id from Component Library when source is 'library', or null when source is 'custom')",
      "category": "Frontend|Backend|Integration|Data/Analytics|Infrastructure|Security|Mobile|User Story|Other",
      "componentName": "string",
      "description": "string",
      "complexity": "simple|medium|complex|very_complex|spike",
      "storyPoints": 5,
      "baseHours": 20,
      "confidence": "high|medium|low|spike",
      "rationale": "string"
    }
  ],
  "bidRecommendation": {
    "recommendation": "pursue|caution|no-bid",
    "score": 75,
    "rationale": "string",
    "keyRisks": ["string"],
    "keyStrengths": ["string"]
  },
  "questionsForClient": [
    { "category": "string", "question": "string", "importance": "critical|important|nice-to-know" }
  ]
}

Current Component Library (prefer matching RFP requirements to these entries):
${libraryCatalogJson}

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- If information is not found, use null
- For suggestedWBS:
  1. Prefer matching RFP requirements to existing Component Library entries above rather than inventing new components.
  2. When a Component Library entry reasonably matches an RFP requirement, set "source": "library", set "libraryComponentId" to that entry's exact "id", and preserve the library entry's exact "componentName", "category", "description", "complexity", "storyPoints", and "baseHours" without inventing alternative estimates.
  3. Only create a custom component ("source": "custom", "libraryComponentId": null) when no reasonable Component Library entry matches the requirement.
  4. For custom components ("source": "custom"):
     - Use only allowed categories: Frontend, Backend, Integration, Data/Analytics, Infrastructure, Security, Mobile, User Story, Other (use "Data/Analytics", never "Data").
     - Use only Fibonacci storyPoints: 1, 2, 3, 5, 8, 13, 21 (or 0 for spike).
     - Align complexity, storyPoints, and baseHours with the estimator rules (1 SP = 4 hours): Simple = 2 SP / 8 baseHours, Medium = 5 SP / 20 baseHours, Complex = 13 SP / 52 baseHours, Very Complex (very_complex) = 21 SP / 84 baseHours, Spike = 0 SP / 0 baseHours (with confidence = "spike").
- Identify at least 3 red flags if any exist
- Generate at least 5 clarifying questions

RFP Document:
${text}
`
}

function reconcileSuggestedWBS(rawWbs: any[], libraryItems: LibraryComponentRow[]) {
  if (!Array.isArray(rawWbs)) return []

  const libById = new Map<string, LibraryComponentRow>()
  const libByName = new Map<string, LibraryComponentRow>()

  for (const item of libraryItems) {
    libById.set(item.id, item)
    libByName.set(item.component_name.trim().toLowerCase(), item)
  }

  return rawWbs.map((raw) => {
    const candidateId = typeof raw?.libraryComponentId === "string" ? raw.libraryComponentId.trim() : ""
    const candidateName = typeof raw?.componentName === "string" ? raw.componentName.trim().toLowerCase() : ""

    const matchedLib =
      (candidateId ? libById.get(candidateId) : undefined) ??
      (candidateName ? libByName.get(candidateName) : undefined)

    const validConfidences = new Set(["high", "medium", "low", "spike"])

    if (matchedLib) {
      const libComplexity = matchedLib.complexity || "medium"
      const confidence =
        libComplexity === "spike"
          ? "spike"
          : validConfidences.has(raw?.confidence) && raw.confidence !== "spike"
          ? raw.confidence
          : "medium"

      return {
        source: "library" as const,
        libraryComponentId: matchedLib.id,
        category: matchedLib.category || "Other",
        componentName: matchedLib.component_name,
        description: matchedLib.description || raw?.description || "",
        complexity: libComplexity,
        storyPoints: matchedLib.story_points,
        baseHours: matchedLib.base_hours,
        confidence,
        rationale: typeof raw?.rationale === "string" ? raw.rationale : "",
      }
    }

    // Custom AI-generated item: align with WBSWorkspace estimator rules
    const normalizedComplexityRaw =
      typeof raw?.complexity === "string" ? raw.complexity.trim().toLowerCase().replace("-", "_") : "medium"
    const complexity = (
      normalizedComplexityRaw in CUSTOM_COMPLEXITY_DEFAULTS ? normalizedComplexityRaw : "medium"
    ) as keyof typeof CUSTOM_COMPLEXITY_DEFAULTS

    const rawCategory = typeof raw?.category === "string" ? raw.category.trim() : "Other"
    const normalizedCategory =
      rawCategory === "Data"
        ? "Data/Analytics"
        : VALID_WBS_CATEGORIES.has(rawCategory)
        ? rawCategory
        : "Other"

    let storyPoints: number
    let baseHours: number

    if (complexity === "spike") {
      storyPoints = 0
      baseHours = 0
    } else {
      const defaults = CUSTOM_COMPLEXITY_DEFAULTS[complexity]
      const parsedSp = Number(raw?.storyPoints)
      storyPoints = VALID_FIBONACCI_SP.has(parsedSp) ? parsedSp : defaults.sp
      // Always follow estimator's 1 SP = 4 hrs rule for custom items (matching defaults: 8, 20, 52, 84)
      baseHours = storyPoints === defaults.sp ? defaults.hrs : storyPoints * HRS_PER_SP
    }

    const confidence =
      complexity === "spike"
        ? "spike"
        : validConfidences.has(raw?.confidence) && raw.confidence !== "spike"
        ? raw.confidence
        : "medium"

    return {
      source: "custom" as const,
      libraryComponentId: null,
      category: normalizedCategory,
      componentName: typeof raw?.componentName === "string" && raw.componentName.trim() ? raw.componentName.trim() : "Custom Component",
      description: typeof raw?.description === "string" ? raw.description : "",
      complexity,
      storyPoints,
      baseHours,
      confidence,
      rationale: typeof raw?.rationale === "string" ? raw.rationale : "",
    }
  })
}

// ── NVIDIA NIM Resilience Helpers ─────────────────────────────────────────────

class NvidiaTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`NVIDIA NIM request timed out after ${timeoutMs}ms`)
    this.name = "NvidiaTimeoutError"
  }
}

class NvidiaHttpError extends Error {
  status: number
  statusText: string

  constructor(status: number, statusText: string, detailMessage: string) {
    super(`NVIDIA NIM HTTP ${status} (${statusText}): ${detailMessage}`)
    this.name = "NvidiaHttpError"
    this.status = status
    this.statusText = statusText
  }
}

function redactSecrets(text: string): string {
  let safe = text
  const nvidiaKey = process.env.NVIDIA_API_KEY
  if (nvidiaKey) {
    safe = safe.split(nvidiaKey).join("[REDACTED]")
  }
  return safe
}

function classifyNvidiaError(err: unknown): {
  category: "TIMEOUT" | "HTTP_TRANSIENT" | "NETWORK_TRANSIENT" | "NVIDIA_API_ERROR"
  httpStatus: number | null
  statusText: string | null
  isTransient: boolean
  message: string
} {
  const rawMessage = err instanceof Error ? err.message : String(err)
  const safeMessage = redactSecrets(rawMessage)
  const errName = err instanceof Error ? err.name : "UnknownError"

  const isTimeout =
    err instanceof NvidiaTimeoutError ||
    errName === "AbortError" ||
    /timed out|aborted/i.test(safeMessage)

  if (isTimeout) {
    return {
      category: "TIMEOUT",
      httpStatus: null,
      statusText: null,
      isTransient: true,
      message: safeMessage,
    }
  }

  if (err instanceof NvidiaHttpError) {
    const isTransient = TRANSIENT_HTTP_STATUSES.has(err.status)
    return {
      category: isTransient ? "HTTP_TRANSIENT" : "NVIDIA_API_ERROR",
      httpStatus: err.status,
      statusText: err.statusText,
      isTransient,
      message: safeMessage,
    }
  }

  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(safeMessage)) {
    return {
      category: "NETWORK_TRANSIENT",
      httpStatus: null,
      statusText: null,
      isTransient: true,
      message: safeMessage,
    }
  }

  return {
    category: "NVIDIA_API_ERROR",
    httpStatus: null,
    statusText: null,
    isTransient: false,
    message: safeMessage,
  }
}

async function callNvidiaWithTimeout(
  apiKey: string,
  promptText: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController()
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  let hardTimer: ReturnType<typeof setTimeout> | null = null

  let rejectTimeout: ((err: Error) => void) | null = null

  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      controller.abort()
      if (rejectTimeout) rejectTimeout(new NvidiaTimeoutError(timeoutMs))
    }, timeoutMs)
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectTimeout = reject
    resetStallTimer()
    hardTimer = setTimeout(() => {
      controller.abort()
      reject(new NvidiaTimeoutError(NVIDIA_MAX_TOTAL_ATTEMPT_MS))
    }, NVIDIA_MAX_TOTAL_ATTEMPT_MS)
  })

  const requestPromise = (async () => {
    const response = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL_ID,
        messages: [
          {
            role: "system",
            content:
              "You are an expert software delivery consultant. Keep internal reasoning brief and output ONLY valid JSON matching the requested schema.",
          },
          { role: "user", content: promptText },
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: NVIDIA_MAX_TOKENS,
	chat_template_kwargs: {
  		enable_thinking: false,
  		thinking: false,
	},        
	stream: true,
      }),
      signal: controller.signal,
    })

    resetStallTimer()

    if (!response.ok) {
      let detail = response.statusText || "Request failed"
      try {
        const errBody = await response.text()
        if (errBody) {
          try {
            const parsed = JSON.parse(errBody)
            detail =
              parsed?.error?.message ||
              parsed?.detail ||
              parsed?.message ||
              errBody.slice(0, 300)
          } catch {
            detail = errBody.slice(0, 300)
          }
        }
      } catch {
        // Ignore body read error on non-OK response
      }
      throw new NvidiaHttpError(response.status, response.statusText, detail)
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/event-stream") || !response.body) {
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== "string" || !content.trim()) {
        const finishReason = data?.choices?.[0]?.finish_reason ?? "unknown"
        throw new Error(`NVIDIA NIM returned empty message content (finish_reason=${finishReason})`)
      }
      return content
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let contentText = ""
    let finishReason = "unknown"

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      resetStallTimer()

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        try {
          const parsed = JSON.parse(payload)
          const choice = parsed?.choices?.[0]
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason
          }
          const deltaContent = choice?.delta?.content
          if (typeof deltaContent === "string") {
            contentText += deltaContent
          }
        } catch {
          // Ignore partial SSE line parse error
        }
      }
    }

    if (!contentText.trim()) {
      throw new Error(`NVIDIA NIM stream completed with empty content (finish_reason=${finishReason})`)
    }

    return contentText
  })()

  try {
    return await Promise.race([requestPromise, timeoutPromise])
  } finally {
    if (stallTimer) clearTimeout(stallTimer)
    if (hardTimer) clearTimeout(hardTimer)
  }
}

function extractCleanJson(responseText: string): string {
  const stripped = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  const firstBrace = stripped.indexOf("{")
  const lastBrace = stripped.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1)
  }
  return stripped
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Step 1 — Verify API key (never log the key or its prefix)
  const nvidiaApiKey = process.env.NVIDIA_API_KEY?.trim()
  console.log("[RFP] NVIDIA_API_KEY configured:", !!nvidiaApiKey)

  if (!nvidiaApiKey) {
    return Response.json(
      { success: false, error: "NVIDIA API key not configured. Add NVIDIA_API_KEY to .env.local" },
      { status: 500 }
    )
  }

  // Step 2 — Parse form data
  let extractedText = ""
  let filename = "pasted-text.txt"
  let fileSize = 0

  try {
    const formData = await request.formData()
    console.log("[RFP] Form data keys:", [...formData.keys()])

    const file = formData.get("file") as File | null
    const pastedText = formData.get("text") as string | null

    console.log("[RFP] File received:", file?.name, file?.size)
    console.log("[RFP] Text received length:", pastedText?.length)

    if (pastedText && pastedText.trim().length > 10) {
      extractedText = pastedText.trim()
      filename = "pasted-text.txt"
      fileSize = new TextEncoder().encode(extractedText).length
      console.log("[RFP] Using pasted text, length:", extractedText.length)
    } else if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          { success: false, error: "File exceeds 10 MB limit" },
          { status: 413 }
        )
      }

      filename = file.name
      fileSize = file.size
      const buffer = Buffer.from(await file.arrayBuffer())
      console.log("[RFP] File buffer size:", buffer.length)

      const lowerName = file.name.toLowerCase()

      if (lowerName.endsWith(".txt")) {
        extractedText = buffer.toString("utf-8")
      } else if (lowerName.endsWith(".pdf")) {
        try {
          extractedText = await extractTextFromPDF(buffer)
        } catch (pdfErr) {
          console.error("[RFP] PDF extraction error:", pdfErr)
          return Response.json(
            {
              success: false,
              error: "PDF text extraction failed. Please copy and paste the RFP text instead.",
              suggestion: "paste",
            },
            { status: 422 }
          )
        }
      } else if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
        try {
          const mammoth = await import("mammoth")
          const result = await mammoth.extractRawText({ buffer })
          extractedText = result.value
        } catch (docxErr) {
          console.error("[RFP] DOCX extraction error:", docxErr)
          return Response.json(
            {
              success: false,
              error: "DOCX extraction failed. Please copy and paste the text instead.",
              suggestion: "paste",
            },
            { status: 422 }
          )
        }
      } else {
        return Response.json(
          { success: false, error: "Unsupported file type. Use PDF, DOCX, or TXT." },
          { status: 400 }
        )
      }
    } else {
      return Response.json(
        { success: false, error: "No content provided. Please upload a file or paste text." },
        { status: 400 }
      )
    }
  } catch (formErr) {
    console.error("[RFP] Form parsing error:", formErr)
    return Response.json(
      {
        success: false,
        error: "Failed to read form data: " + (formErr instanceof Error ? formErr.message : "Unknown"),
      },
      { status: 400 }
    )
  }

  // Step 3 — Validate extracted text
  if (!extractedText || extractedText.trim().length < 20) {
    return Response.json(
      {
        success: false,
        error: "No readable text found. Please paste the RFP content directly.",
        suggestion: "paste",
      },
      { status: 422 }
    )
  }

  console.log("[RFP] Extracted text length:", extractedText.length)

  // Step 4 — Load current Component Library & Call NVIDIA NIM
  const truncated = extractedText.length > MAX_TEXT_LENGTH
  const truncatedText = extractedText.slice(0, MAX_TEXT_LENGTH)

  let libraryItems: LibraryComponentRow[] = []
  try {
    const db = getDb()
    libraryItems = db
      .prepare(
        "SELECT id, category, component_name, description, complexity, story_points, base_hours FROM component_library ORDER BY category, component_name"
      )
      .all() as LibraryComponentRow[]
  } catch (dbErr) {
    console.warn("[RFP] Failed to load component_library:", dbErr)
  }

  try {
    const promptText = buildPrompt(truncatedText, libraryItems)
    let responseText = ""

    for (let attempt = 1; attempt <= NVIDIA_MAX_ATTEMPTS; attempt++) {
      const attemptStart = Date.now()
      console.log(
        `[RFP] Sending to NVIDIA NIM (${NVIDIA_MODEL_ID}, attempt ${attempt}/${NVIDIA_MAX_ATTEMPTS}, timeout ${NVIDIA_TIMEOUT_MS}ms), text length: ${truncatedText.length}, library items: ${libraryItems.length}`
      )

      try {
        responseText = await callNvidiaWithTimeout(nvidiaApiKey, promptText, NVIDIA_TIMEOUT_MS)
        const elapsedMs = Date.now() - attemptStart
        console.log(
          `[RFP] NVIDIA NIM response received on attempt ${attempt}/${NVIDIA_MAX_ATTEMPTS} in ${elapsedMs}ms, length: ${responseText.length}`
        )
        console.log("[RFP] NVIDIA NIM response preview:", responseText.slice(0, 200))
        break
      } catch (attemptErr) {
        const elapsedMs = Date.now() - attemptStart
        const info = classifyNvidiaError(attemptErr)

        console.error(
          `[RFP] NVIDIA NIM attempt ${attempt}/${NVIDIA_MAX_ATTEMPTS} failed after ${elapsedMs}ms | category=${info.category} | status=${info.httpStatus ?? "N/A"} | transient=${info.isTransient} | message=${info.message}`
        )

        if (info.isTransient && attempt < NVIDIA_MAX_ATTEMPTS) {
          console.warn(
            `[RFP] Transient NVIDIA NIM failure (${info.category}${info.httpStatus ? ` HTTP ${info.httpStatus}` : ""}); retrying in ${NVIDIA_RETRY_BACKOFF_MS}ms...`
          )
          await sleep(NVIDIA_RETRY_BACKOFF_MS)
          continue
        }

        if (info.isTransient) {
          return Response.json(
            {
              success: false,
              error: "AI service is temporarily unavailable or busy. Please try again shortly.",
            },
            { status: info.category === "TIMEOUT" ? 504 : info.httpStatus ?? 503 }
          )
        }

        return Response.json(
          {
            success: false,
            error: "AI analysis failed: " + info.message,
          },
          { status: info.httpStatus && info.httpStatus >= 400 && info.httpStatus < 600 ? info.httpStatus : 500 }
        )
      }
    }

    const cleanJson = extractCleanJson(responseText)

    let analysis
    try {
      analysis = JSON.parse(cleanJson)
    } catch (parseErr) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      console.error(
        `[RFP] NVIDIA NIM failure | category=JSON_PARSE_ERROR | responseLength=${responseText.length} | message=${parseMsg}`
      )
      console.error("[RFP] Raw response preview:", responseText.slice(0, 500))
      return Response.json(
        {
          success: false,
          error: "AI returned an invalid response format. Please try again.",
          rawResponse: responseText.slice(0, 500),
        },
        { status: 500 }
      )
    }

    if (analysis && Array.isArray(analysis.suggestedWBS)) {
      analysis.suggestedWBS = reconcileSuggestedWBS(analysis.suggestedWBS, libraryItems)
    }

    return Response.json({
      success: true,
      analysis,
      truncated,
      filename,
      fileSize,
    })
  } catch (nvidiaErr) {
    const info = classifyNvidiaError(nvidiaErr)
    console.error(
      `[RFP] Unexpected NVIDIA NIM failure | category=${info.category} | status=${info.httpStatus ?? "N/A"} | message=${info.message}`
    )
    return Response.json(
      {
        success: false,
        error: info.isTransient
          ? "AI service is temporarily unavailable or busy. Please try again shortly."
          : "AI analysis failed: " + info.message,
      },
      { status: 500 }
    )
  }
}
