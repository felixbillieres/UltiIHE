/**
 * Message pruning — clears old tool outputs to free context space.
 *
 * Follows the OpenCode pattern:
 * 1. Walk backwards through message history
 * 2. For messages older than PRUNE_PROTECT tokens from the end, replace
 *    long assistant messages with truncated versions
 * 3. Always protect the last N user turns
 *
 * This is a non-destructive operation — it modifies message content
 * but preserves the conversation structure. The UI still has the
 * full content (stored separately in the session store).
 */

import { estimateTokens } from "./tokens"

/** Don't touch messages within the last 40K tokens of conversation */
const PRUNE_PROTECT_TOKENS = 40_000

/** Minimum tokens to free per prune pass */
const PRUNE_MIN_FREE = 20_000

/** Always protect the last N user messages */
const PRUNE_PROTECT_USER_TURNS = 2

/** Marker for pruned content */
const PRUNED_MARKER = "[Previous output cleared to save context]"

/**
 * Prune old, large messages to free context space.
 *
 * Returns a new array of messages with old content replaced.
 * Does NOT mutate the input array.
 *
 * @param messages - Chat messages (role + content)
 * @param targetFree - How many tokens we want to free (default: PRUNE_MIN_FREE)
 * @returns Pruned messages array and how many tokens were freed
 */
export function pruneMessages(
  messages: Array<{ role: string; content: string }>,
  targetFree: number = PRUNE_MIN_FREE,
): { messages: Array<{ role: string; content: string }>; freedTokens: number } {
  if (messages.length === 0) {
    return { messages: [], freedTokens: 0 }
  }

  // Calculate total tokens from the end to find the protection boundary
  let tokensFromEnd = 0
  let protectFromIndex = messages.length // Start protecting from this index

  for (let i = messages.length - 1; i >= 0; i--) {
    tokensFromEnd += estimateTokens(messages[i].content) + 4 // +4 for message overhead
    if (tokensFromEnd >= PRUNE_PROTECT_TOKENS) {
      protectFromIndex = i + 1
      break
    }
  }

  // Also protect the last N user turns
  let userTurnsSeen = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userTurnsSeen++
      if (userTurnsSeen >= PRUNE_PROTECT_USER_TURNS) {
        protectFromIndex = Math.min(protectFromIndex, i)
        break
      }
    }
  }

  // Walk through unprotected messages and prune large ones
  let freedTokens = 0
  const pruned = messages.map((msg, i) => {
    // Don't touch protected messages
    if (i >= protectFromIndex) return msg

    // Only prune large assistant messages (likely tool outputs or long responses)
    if (msg.role !== "assistant") return msg

    const tokens = estimateTokens(msg.content)
    // Only prune messages > 200 tokens (keep short responses)
    if (tokens <= 200) return msg

    // We've freed enough
    if (freedTokens >= targetFree) return msg

    const freed = tokens - estimateTokens(PRUNED_MARKER)
    freedTokens += freed

    return { ...msg, content: PRUNED_MARKER }
  })

  return { messages: pruned, freedTokens }
}

/**
 * Smart truncation for individual content strings.
 * Keeps the first and last portions, replacing the middle with an indicator.
 *
 * Useful for tool outputs that are too large.
 */
export function truncateContent(
  content: string,
  maxTokens: number,
): string {
  const currentTokens = estimateTokens(content)
  if (currentTokens <= maxTokens) return content

  // Keep roughly 30% from start, 60% from end (end is usually more relevant)
  const maxChars = maxTokens * 4
  const headChars = Math.floor(maxChars * 0.3)
  const tailChars = Math.floor(maxChars * 0.6)
  const omitted = content.length - headChars - tailChars

  return (
    content.slice(0, headChars) +
    `\n\n[... ${omitted} characters omitted ...]\n\n` +
    content.slice(-tailChars)
  )
}
