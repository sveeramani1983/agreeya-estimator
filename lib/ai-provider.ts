// Shared NVIDIA NIM AI provider with streaming, timeout, retry, and secret redaction.

export const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
export const NVIDIA_MODEL_ID = "minimaxai/minimax-m3.1-flash"
export const NVIDIA_TIMEOUT_MS = 60_000 // 60 seconds initial / stall timeout per attempt
export const NVIDIA_MAX_TOTAL_ATTEMPT_MS = 180_000 // 180 seconds hard ceiling per attempt while actively streaming
export const NVIDIA_MAX_ATTEMPTS = 2 // Initial attempt + 1 retry
export const NVIDIA_RETRY_BACKOFF_MS = 2_000 // 2 seconds backoff before retry
export const NVIDIA_MAX_TOKENS = 8192
export const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504])

export class NvidiaTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`NVIDIA NIM request timed out after ${timeoutMs}ms`)
    this.name = "NvidiaTimeoutError"
  }
}

export class NvidiaHttpError extends Error {
  status: number
  statusText: string

  constructor(status: number, statusText: string, detailMessage: string) {
    super(`NVIDIA NIM HTTP ${status} (${statusText}): ${detailMessage}`)
    this.name = "NvidiaHttpError"
    this.status = status
    this.statusText = statusText
  }
}

export function redactSecrets(text: string): string {
  let safe = text
  const nvidiaKey = process.env.NVIDIA_API_KEY
  if (nvidiaKey) {
    safe = safe.split(nvidiaKey).join("[REDACTED]")
  }
  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    safe = safe.split(geminiKey).join("[REDACTED]")
  }
  return safe
}

export function classifyNvidiaError(err: unknown): {
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

export async function callNvidiaWithTimeout(
  apiKey: string,
  promptText: string,
  options?:
    | {
        systemPrompt?: string
        timeoutMs?: number
        maxTokens?: number
        temperature?: number
      }
    | number
): Promise<string> {
  const opts = typeof options === "number" ? { timeoutMs: options } : options
  const timeoutMs = opts?.timeoutMs ?? NVIDIA_TIMEOUT_MS
  const maxTokens = opts?.maxTokens ?? NVIDIA_MAX_TOKENS
  const temperature = opts?.temperature ?? 0.2
  const systemPrompt =
    opts?.systemPrompt ??
    "You are an expert software delivery consultant. Keep internal reasoning brief and output ONLY valid JSON matching the requested schema."

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
          { role: "system", content: systemPrompt },
          { role: "user", content: promptText },
        ],
        temperature,
        top_p: 0.95,
        max_tokens: maxTokens,
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

export async function callNvidiaWithRetry(
  promptText: string,
  options?: {
    systemPrompt?: string
    timeoutMs?: number
    maxTokens?: number
    temperature?: number
    maxAttempts?: number
    retryBackoffMs?: number
  }
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY environment variable is not configured.")
  }

  const maxAttempts = options?.maxAttempts ?? NVIDIA_MAX_ATTEMPTS
  const retryBackoffMs = options?.retryBackoffMs ?? NVIDIA_RETRY_BACKOFF_MS

  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[NVIDIA NIM] Attempt ${attempt}/${maxAttempts} starting...`)
      const rawText = await callNvidiaWithTimeout(apiKey, promptText, options)
      console.log(`[NVIDIA NIM] Attempt ${attempt} succeeded (${rawText.length} chars)`)
      return rawText
    } catch (err: unknown) {
      lastError = err
      const classified = classifyNvidiaError(err)
      console.error(
        `[NVIDIA NIM] Attempt ${attempt}/${maxAttempts} failed: [${classified.category}] ${classified.message}`
      )

      if (attempt < maxAttempts && classified.isTransient) {
        console.log(`[NVIDIA NIM] Retrying in ${retryBackoffMs}ms...`)
        await new Promise((resolve) => setTimeout(resolve, retryBackoffMs))
        continue
      }
      break
    }
  }

  const finalClassified = classifyNvidiaError(lastError)
  throw new Error(`NVIDIA NIM call failed after ${maxAttempts} attempts: [${finalClassified.category}] ${finalClassified.message}`)
}

export function extractCleanJson(responseText: string): string {
  const stripped = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  const firstBrace = stripped.indexOf("{")
  const lastBrace = stripped.lastIndexOf("}")

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1)
  }

  return stripped
}
