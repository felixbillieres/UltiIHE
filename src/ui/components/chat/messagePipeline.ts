import type { Message, ToolCallPart } from "../../stores/session"

// ── Display item types ────────────────────────────────────

export type DisplayItem =
  | { type: "message"; message: Message }
  | { type: "compaction"; content: string }
  | { type: "tool-summary"; messages: Message[]; toolCount: number; errorCount: number; totalDuration: number }

// ── Helpers ───────────────────────────────────────────────

/** A message is "tool-only" if it's an assistant message with parts that are ALL tool-calls (zero text parts). */
function isToolOnlyMessage(msg: Message): boolean {
  if (msg.role !== "assistant") return false
  if (msg.parts.length === 0) return false
  return msg.parts.every((p) => p.type === "tool-call")
}

/** Check if a message is a compaction summary (starts with "[Context Summary"). */
function isCompactionMessage(msg: Message): boolean {
  return msg.content.trimStart().startsWith("[Context Summary")
}

/** Compute aggregated stats from a list of tool-only messages. */
function computeToolStats(messages: Message[]): { toolCount: number; errorCount: number; totalDuration: number } {
  let toolCount = 0
  let errorCount = 0
  let totalDuration = 0

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "tool-call") {
        const tc = part as ToolCallPart
        toolCount++
        if (tc.status === "error" || tc.isError) errorCount++
        if (tc.endTime && tc.startTime) totalDuration += tc.endTime - tc.startTime
      }
    }
  }

  return { toolCount, errorCount, totalDuration }
}

// ── Main pipeline ─────────────────────────────────────────

/**
 * Pure function that transforms a list of messages into display items.
 *
 * - Compaction messages → `{ type: "compaction" }`
 * - Consecutive assistant messages that are ALL tool-calls → grouped into `{ type: "tool-summary" }`
 * - Everything else → `{ type: "message" }`
 */
export function processMessages(messages: Message[]): DisplayItem[] {
  const result: DisplayItem[] = []
  let i = 0

  while (i < messages.length) {
    const msg = messages[i]

    // Step 1: Compaction messages
    if (isCompactionMessage(msg)) {
      result.push({ type: "compaction", content: msg.content })
      i++
      continue
    }

    // Step 2: Consecutive tool-only assistant messages → tool-summary
    if (isToolOnlyMessage(msg)) {
      const group: Message[] = [msg]
      let j = i + 1
      while (j < messages.length && isToolOnlyMessage(messages[j]) && !isCompactionMessage(messages[j])) {
        group.push(messages[j])
        j++
      }

      // Only create a summary if there are 2+ consecutive tool-only messages
      if (group.length >= 2) {
        const stats = computeToolStats(group)
        result.push({
          type: "tool-summary",
          messages: group,
          ...stats,
        })
        i = j
        continue
      }
    }

    // Step 3: Normal message
    result.push({ type: "message", message: msg })
    i++
  }

  return result
}
