import { describe, expect, test } from "bun:test"
import { pruneMessages, truncateContent } from "../../../src/ai/context/pruner"

// ── pruneMessages ───────────────────────────────────────────

describe("pruneMessages", () => {
  test("returns empty for empty input", () => {
    const { messages, freedTokens } = pruneMessages([])
    expect(messages).toHaveLength(0)
    expect(freedTokens).toBe(0)
  })

  test("does not touch short conversations", () => {
    const msgs = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]
    const { messages, freedTokens } = pruneMessages(msgs)
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe("hi")
    expect(messages[1].content).toBe("hello")
    expect(freedTokens).toBe(0)
  })

  test("does not mutate input array", () => {
    const msgs = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "x".repeat(10000) },
      { role: "user", content: "another" },
      { role: "assistant", content: "y".repeat(10000) },
    ]
    const original = JSON.parse(JSON.stringify(msgs))
    pruneMessages(msgs)
    expect(msgs).toEqual(original)
  })

  test("prunes old large assistant messages", () => {
    // Build a conversation where early messages are large and recent ones are small
    const msgs: Array<{ role: string; content: string }> = []
    // Old large messages (should be pruned)
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user", content: `question ${i}` })
      msgs.push({ role: "assistant", content: "x".repeat(5000) }) // ~1250 tokens each
    }
    // Recent messages (should be protected)
    msgs.push({ role: "user", content: "recent question" })
    msgs.push({ role: "assistant", content: "recent answer" })

    const { messages, freedTokens } = pruneMessages(msgs)
    expect(freedTokens).toBeGreaterThan(0)

    // Recent messages should be untouched
    const lastMsg = messages[messages.length - 1]
    expect(lastMsg.content).toBe("recent answer")

    // Some old messages should be pruned
    const prunedCount = messages.filter(
      (m) => m.content === "[Previous output cleared to save context]",
    ).length
    expect(prunedCount).toBeGreaterThan(0)
  })

  test("never prunes user messages", () => {
    const msgs: Array<{ role: string; content: string }> = []
    for (let i = 0; i < 20; i++) {
      msgs.push({ role: "user", content: "u".repeat(5000) })
      msgs.push({ role: "assistant", content: "a".repeat(5000) })
    }
    const { messages } = pruneMessages(msgs)
    for (const msg of messages) {
      if (msg.role === "user") {
        expect(msg.content).not.toBe("[Previous output cleared to save context]")
      }
    }
  })

  test("preserves small assistant messages", () => {
    const msgs: Array<{ role: string; content: string }> = []
    for (let i = 0; i < 20; i++) {
      msgs.push({ role: "user", content: "q" })
      msgs.push({ role: "assistant", content: "ok" }) // very small — <= 200 tokens
    }
    const { messages, freedTokens } = pruneMessages(msgs)
    // No pruning because all assistant messages are small
    expect(freedTokens).toBe(0)
    for (const msg of messages) {
      if (msg.role === "assistant") {
        expect(msg.content).toBe("ok")
      }
    }
  })
})

// ── truncateContent ─────────────────────────────────────────

describe("truncateContent", () => {
  test("returns short content unchanged", () => {
    expect(truncateContent("hello", 100)).toBe("hello")
    expect(truncateContent("", 100)).toBe("")
  })

  test("truncates content exceeding token limit", () => {
    const long = "x".repeat(10000) // ~2500 tokens
    const result = truncateContent(long, 100)
    expect(result.length).toBeLessThan(long.length)
    expect(result).toContain("[...")
    expect(result).toContain("characters omitted")
  })

  test("preserves start and end of content", () => {
    const content = "START" + "x".repeat(10000) + "END"
    const result = truncateContent(content, 100)
    expect(result.startsWith("START")).toBe(true)
    expect(result.endsWith("END")).toBe(true)
  })

  test("keeps 30% from start and 60% from end", () => {
    const content = "x".repeat(10000)
    const result = truncateContent(content, 100)
    // maxChars = 100 * 4 = 400
    // headChars = 120, tailChars = 240
    const parts = result.split(/\[\.\.\..*?\]/)
    expect(parts.length).toBe(2)
    expect(parts[0].length).toBeLessThanOrEqual(150) // ~30% + some margin
  })
})
