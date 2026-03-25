import { describe, expect, test } from "bun:test"
import {
  estimateTokens,
  estimateMessagesTokens,
  estimateToolsTokens,
  buildContextBreakdown,
} from "../../../src/ai/context/tokens"

// ── estimateTokens ──────────────────────────────────────────

describe("estimateTokens", () => {
  test("estimates string tokens at ~4 chars/token", () => {
    expect(estimateTokens("a")).toBe(1)
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcde")).toBe(2) // ceil(5/4)
    expect(estimateTokens("abcdefgh")).toBe(2) // ceil(8/4)
  })

  test("returns 0 for empty/null input", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens(null as any)).toBe(0)
    expect(estimateTokens(undefined as any)).toBe(0)
  })

  test("handles content parts array", () => {
    const parts = [
      { type: "text", text: "hello world!" }, // 12 chars = 3 tokens
      { type: "text", text: "more text" },     // 9 chars = 3 tokens (ceil)
    ]
    expect(estimateTokens(parts)).toBe(6)
  })

  test("estimates image parts at 1000 tokens", () => {
    const parts = [
      { type: "image", url: "data:..." },
    ]
    expect(estimateTokens(parts)).toBe(1000)
  })

  test("uses 50-token fallback for unknown part types", () => {
    const parts = [
      { type: "custom_thing", data: "..." },
    ]
    expect(estimateTokens(parts)).toBe(50)
  })

  test("handles mixed content parts", () => {
    const parts = [
      { type: "text", text: "1234" },  // 1 token
      { type: "image", url: "..." },    // 1000 tokens
      { type: "unknown" },              // 50 tokens
    ]
    expect(estimateTokens(parts)).toBe(1051)
  })

  test("returns 50 for non-string non-array input", () => {
    expect(estimateTokens(42 as any)).toBe(50)
    expect(estimateTokens({} as any)).toBe(50)
  })
})

// ── estimateMessagesTokens ──────────────────────────────────

describe("estimateMessagesTokens", () => {
  test("adds 4 tokens overhead per message", () => {
    const messages = [{ role: "user", content: "" }]
    expect(estimateMessagesTokens(messages)).toBe(4)
  })

  test("sums message content plus overhead", () => {
    const messages = [
      { role: "user", content: "abcdefgh" },        // 2 tokens + 4 overhead
      { role: "assistant", content: "abcdefghijkl" }, // 3 tokens + 4 overhead
    ]
    expect(estimateMessagesTokens(messages)).toBe(13) // 6 + 8 - 1 = (2+4) + (3+4) = 13
  })

  test("returns 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0)
  })
})

// ── estimateToolsTokens ─────────────────────────────────────

describe("estimateToolsTokens", () => {
  test("estimates 120 tokens per tool", () => {
    expect(estimateToolsTokens(1)).toBe(120)
    expect(estimateToolsTokens(10)).toBe(1200)
    expect(estimateToolsTokens(0)).toBe(0)
  })
})

// ── buildContextBreakdown ───────────────────────────────────

describe("buildContextBreakdown", () => {
  test("calculates complete breakdown", () => {
    const breakdown = buildContextBreakdown(
      "You are an AI assistant.", // 24 chars = 6 tokens
      5,                          // 5 tools = 600 tokens
      [{ role: "user", content: "Hello" }], // 2+4 = 6 tokens
      128000,
    )

    expect(breakdown.systemPrompt).toBe(6)
    expect(breakdown.toolDefinitions).toBe(600)
    expect(breakdown.messageHistory).toBe(6)
    expect(breakdown.total).toBe(612)
    expect(breakdown.limit).toBe(128000)
    expect(breakdown.free).toBe(128000 - 612)
    expect(breakdown.percentUsed).toBe(Math.round((612 / 128000) * 100))
  })

  test("free never goes negative", () => {
    const breakdown = buildContextBreakdown(
      "x".repeat(10000),
      100,
      [{ role: "user", content: "x".repeat(10000) }],
      100, // tiny limit
    )
    expect(breakdown.free).toBe(0)
  })

  test("percentUsed is 0 when limit is 0", () => {
    const breakdown = buildContextBreakdown("", 0, [], 0)
    expect(breakdown.percentUsed).toBe(0)
  })
})
