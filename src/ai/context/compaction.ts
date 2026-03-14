/**
 * LLM-based context compaction.
 *
 * When message history exceeds the compact threshold (85% of input budget),
 * this module generates a structured summary of the conversation so far,
 * then replaces old messages with the summary.
 *
 * The summary preserves:
 * - What the user's goal is
 * - What has been accomplished
 * - Key discoveries (IPs, ports, credentials, vulnerabilities)
 * - What to do next
 * - Relevant file paths and terminal IDs
 *
 * This is inspired by OpenCode's compaction agent but simplified:
 * instead of spawning a hidden agent, we build the compaction prompt
 * directly and let the caller run it through streamText().
 */

import { estimateTokens } from "./tokens"

// ── Compaction prompt template ───────────────────────────────────

const COMPACTION_PROMPT = `You are a context compaction assistant. Your job is to summarize the conversation history into a structured prompt that can be used to continue the conversation without losing important context.

Analyze ALL messages in the conversation and produce a summary in EXACTLY this format:

## Goal
What the user is trying to accomplish (1-2 sentences).

## Instructions
Any specific instructions or preferences the user has expressed (bullet points).

## Discoveries
Key technical findings so far (bullet points). Include:
- IP addresses, hostnames, ports discovered
- Credentials found
- Vulnerabilities identified (with severity if known)
- Services/technologies identified
- File paths of interest

## Accomplished
What has been done so far (bullet points, in chronological order).

## Active Context
- Terminal IDs and what each is being used for
- Container names in use
- File paths being worked on
- Any pending tasks or next steps

Be thorough but concise. Include ALL technical details (IPs, ports, credentials, paths) — these are critical and cannot be recovered if lost. Do NOT include tool call details or message metadata.`

// ── Public API ───────────────────────────────────────────────────

/**
 * Build the messages array for a compaction request.
 *
 * The caller should pass these to streamText() with a small model
 * (or the same model) to generate the summary.
 *
 * @param conversationMessages - The full conversation history to summarize
 * @returns System prompt and messages for the compaction LLM call
 */
export function buildCompactionRequest(
  conversationMessages: Array<{ role: string; content: string | any[] }>,
): {
  system: string
  messages: Array<{ role: string; content: string }>
} {
  // Build a condensed version of the conversation for the compaction model
  const condensed = conversationMessages
    .map((msg) => {
      const role = msg.role === "assistant" ? "Assistant" : msg.role === "user" ? "User" : "System"
      // Flatten array content to text for compaction
      let text: string
      if (typeof msg.content === "string") {
        text = msg.content
      } else if (Array.isArray(msg.content)) {
        text = msg.content
          .map((part: any) => {
            if (part.type === "text" && typeof part.text === "string") return part.text
            if (part.type === "image") return "[image]"
            return ""
          })
          .filter(Boolean)
          .join("\n")
      } else {
        text = String(msg.content ?? "")
      }
      // Truncate very long messages for the compaction input
      const content = text.length > 2000
        ? text.slice(0, 1000) + "\n[...truncated...]\n" + text.slice(-800)
        : text
      return `### ${role}\n${content}`
    })
    .join("\n\n---\n\n")

  return {
    system: COMPACTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the conversation to summarize:\n\n${condensed}\n\nProduce the structured summary now.`,
      },
    ],
  }
}

/**
 * Apply compaction: replace old messages with a summary message.
 *
 * @param messages - Full conversation history
 * @param summary - LLM-generated summary text
 * @param protectLast - Number of recent messages to keep as-is
 * @returns New message array with summary replacing old messages
 */
export function applyCompaction(
  messages: Array<{ role: string; content: string }>,
  summary: string,
  protectLast: number = 4,
): Array<{ role: string; content: string }> {
  if (messages.length <= protectLast + 1) {
    // Not enough messages to compact
    return messages
  }

  // Keep the last N messages as-is
  const kept = messages.slice(-protectLast)

  // Create summary message that replaces old history
  const summaryMessage = {
    role: "user" as const,
    content: `[Context Summary — previous conversation was compacted to save space]\n\n${summary}\n\n[End of summary — conversation continues below]`,
  }

  return [summaryMessage, ...kept]
}

/**
 * Estimate how much context a compaction would save.
 */
export function estimateCompactionSavings(
  messages: Array<{ role: string; content: string }>,
  protectLast: number = 4,
): { currentTokens: number; estimatedAfter: number; savings: number } {
  const currentTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)

  const keptMessages = messages.slice(-protectLast)
  const keptTokens = keptMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0)

  // Summary is typically ~500-1000 tokens
  const estimatedSummaryTokens = 800
  const estimatedAfter = keptTokens + estimatedSummaryTokens

  return {
    currentTokens,
    estimatedAfter,
    savings: currentTokens - estimatedAfter,
  }
}
