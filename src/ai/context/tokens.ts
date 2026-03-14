/**
 * Token estimation and counting.
 *
 * Uses a simple heuristic (4 chars = 1 token) for pre-send estimation.
 * Real token counts come from provider responses via AI SDK `usage`.
 *
 * The 4 chars/token ratio is the same used by OpenCode and is reasonably
 * accurate across English text for most tokenizers (GPT, Claude, Llama).
 * For CJK/code-heavy content it under-counts slightly, but that's safe
 * (we compact earlier rather than later).
 */

const CHARS_PER_TOKEN = 4

/**
 * Estimate token count for a string or array of content parts.
 */
export function estimateTokens(content: string | any[]): number {
  if (!content) return 0
  if (typeof content === "string") return Math.ceil(content.length / CHARS_PER_TOKEN)
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part.type === "text" && typeof part.text === "string") return sum + Math.ceil(part.text.length / CHARS_PER_TOKEN)
      if (part.type === "image") return sum + 1000 // rough estimate for images
      return sum + 50 // fallback for unknown parts
    }, 0)
  }
  return 50
}

/**
 * Estimate total tokens for an array of chat messages.
 * Accounts for role markers and message structure overhead.
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  let total = 0
  for (const msg of messages) {
    // ~4 tokens overhead per message (role, delimiters)
    total += 4
    total += estimateTokens(msg.content)
  }
  return total
}

/**
 * Estimate tokens for tool definitions (JSON schemas).
 * Each tool has a name, description, and parameter schema.
 * Rough estimate: ~80-150 tokens per tool.
 */
export function estimateToolsTokens(toolCount: number): number {
  return toolCount * 120
}

/**
 * Build a complete context budget breakdown.
 */
export interface ContextBreakdown {
  systemPrompt: number
  toolDefinitions: number
  messageHistory: number
  total: number
  limit: number
  free: number
  percentUsed: number
}

export function buildContextBreakdown(
  systemPromptText: string,
  toolCount: number,
  messages: Array<{ role: string; content: string }>,
  contextLimit: number,
): ContextBreakdown {
  const systemPrompt = estimateTokens(systemPromptText)
  const toolDefinitions = estimateToolsTokens(toolCount)
  const messageHistory = estimateMessagesTokens(messages)
  const total = systemPrompt + toolDefinitions + messageHistory
  const free = Math.max(0, contextLimit - total)
  const percentUsed = contextLimit > 0 ? Math.round((total / contextLimit) * 100) : 0

  return {
    systemPrompt,
    toolDefinitions,
    messageHistory,
    total,
    limit: contextLimit,
    free,
    percentUsed,
  }
}
