/**
 * Extract a human-readable error message from AI SDK errors.
 */
export function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err)
  const e = err as any

  // AI SDK APICallError — has parsed data from provider
  if (e.data?.error?.message) return e.data.error.message

  // responseBody might contain JSON with error details
  if (e.responseBody) {
    try {
      const body = JSON.parse(e.responseBody)
      if (body?.error?.message) return body.error.message
    } catch {}
  }

  // Fall back to standard message
  return e.message || "Unknown error"
}

/**
 * Extract HTTP status code from an AI SDK error or error message.
 */
export function extractStatusCode(err: unknown, message?: string): 400 | 401 | 402 | 429 | 500 | 502 {
  if (err && typeof err === "object") {
    const e = err as any
    const code = e.statusCode || e.status
    if (code === 400 || code === 401 || code === 402 || code === 429) return code
    if (code === 502) return 502
  }
  if (message) {
    if (message.includes("quota") || message.includes("rate limit") || message.includes("RESOURCE_EXHAUSTED")) return 429
    if (message.includes("credits") || message.includes("billing")) return 402
    if (message.includes("decommissioned") || message.includes("not found") || message.includes("does not exist")) return 400
    if (message.includes("unauthorized") || message.includes("invalid.*key")) return 401
  }
  return 500
}
