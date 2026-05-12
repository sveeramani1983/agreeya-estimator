const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_TEXT_LENGTH = 25000

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

const buildPrompt = (text: string) => `
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
      "category": "Frontend|Backend|Integration|Infrastructure|Security|Data|Mobile|Other",
      "componentName": "string",
      "description": "string",
      "complexity": "simple|medium|complex|very_complex|spike",
      "storyPoints": 5,
      "baseHours": 20,
      "confidence": "high|medium|low",
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

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- If information is not found, use null
- For suggestedWBS, generate realistic components based on the requirements — be specific, not generic
- For storyPoints use only Fibonacci numbers: 1,2,3,5,8,13,21
- For baseHours: Simple=8, Medium=20, Complex=52, VeryComplex=120
- Identify at least 3 red flags if any exist
- Generate at least 5 clarifying questions

RFP Document:
${text}
`

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Step 1 — Verify API key
  console.log("[RFP] GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY)
  console.log("[RFP] GEMINI_API_KEY prefix:", process.env.GEMINI_API_KEY?.slice(0, 8))

  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { success: false, error: "Gemini API key not configured. Add GEMINI_API_KEY to .env.local" },
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

  // Step 4 — Call Gemini
  const truncated = extractedText.length > MAX_TEXT_LENGTH
  const truncatedText = extractedText.slice(0, MAX_TEXT_LENGTH)

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai")
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

    console.log("[RFP] Sending to Gemini, text length:", truncatedText.length)

    const result = await model.generateContent([{ text: buildPrompt(truncatedText) }])
    const responseText = result.response.text()

    console.log("[RFP] Gemini response length:", responseText.length)
    console.log("[RFP] Gemini response preview:", responseText.slice(0, 200))

    // Strip markdown fences if present
    const cleanJson = responseText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()

    let analysis
    try {
      analysis = JSON.parse(cleanJson)
    } catch (parseErr) {
      console.error("[RFP] JSON parse error:", parseErr)
      console.error("[RFP] Raw response:", responseText.slice(0, 500))
      return Response.json(
        {
          success: false,
          error: "AI returned an invalid response format. Please try again.",
          rawResponse: responseText.slice(0, 500),
        },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      analysis,
      truncated,
      filename,
      fileSize,
    })
  } catch (geminiErr) {
    console.error("[RFP] Gemini API error:", geminiErr)
    return Response.json(
      {
        success: false,
        error: "AI analysis failed: " + (geminiErr instanceof Error ? geminiErr.message : "Unknown error"),
      },
      { status: 500 }
    )
  }
}
