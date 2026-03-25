import { describe, expect, test } from "bun:test"
import { smartReplace } from "../../../src/ai/tool/fuzzyReplace"

describe("smartReplace", () => {
  // ── Matcher 1: Exact match ────────────────────────────────────

  describe("exact match", () => {
    test("replaces exact unique match", () => {
      const { result, matcherName } = smartReplace("hello world", "hello", "hi")
      expect(result).toBe("hi world")
      expect(matcherName).toBe("exact")
    })

    test("throws NOT_FOUND for non-unique exact match (single replace)", () => {
      // "hello" appears twice — no matcher can guarantee uniqueness
      const content = "hello foo hello"
      expect(() => smartReplace(content, "hello", "hi")).toThrow("NOT_FOUND")
    })

    test("replaces all with replaceAll flag", () => {
      const { result, matcherName } = smartReplace("a b a b a", "a", "x", true)
      expect(result).toBe("x b x b x")
    })
  })

  // ── Matcher 2: Line-trimmed ───────────────────────────────────

  describe("line-trimmed match", () => {
    test("matches ignoring leading/trailing whitespace per line", () => {
      const content = "  function foo() {\n    return 1\n  }"
      const { result } = smartReplace(content, "function foo() {\n  return 1\n}", "function bar() {\n  return 2\n}")
      expect(result).toContain("bar")
      expect(result).toContain("return 2")
    })
  })

  // ── Matcher 4: Whitespace normalized ──────────────────────────

  describe("whitespace-normalized match", () => {
    test("matches with different whitespace", () => {
      const content = "function   foo(  a,  b  ) {}"
      const { result, matcherName } = smartReplace(
        content,
        "function foo( a, b ) {}",
        "function bar(a, b) {}",
      )
      expect(result).toContain("bar")
      expect(matcherName).toBe("whitespace-normalized")
    })
  })

  // ── Matcher 5: Indentation-flexible ───────────────────────────

  describe("indentation-flexible match", () => {
    test("matches same code at different indent level", () => {
      const content = "    if (x) {\n      return true\n    }"
      const { result, matcherName } = smartReplace(
        content,
        "if (x) {\n  return true\n}",
        "if (y) {\n  return false\n}",
      )
      expect(result).toContain("y")
      // line-trimmed matches first since trim() strips leading indent too
      expect(["indentation-flexible", "line-trimmed"]).toContain(matcherName)
    })
  })

  // ── Matcher 6: Escape-normalized ──────────────────────────────

  describe("escape-normalized match", () => {
    test("matches with escaped tab in content", () => {
      // Content has literal tab, find uses \\t
      const content = "col1\tcol2"
      const { result, matcherName } = smartReplace(
        content,
        "col1\\tcol2",
        "replaced",
      )
      expect(result).toBe("replaced")
      expect(matcherName).toBe("escape-normalized")
    })
  })

  // ── Matcher 7: Trimmed boundary ───────────────────────────────

  describe("trimmed-boundary match", () => {
    test("matches when find has extra surrounding whitespace", () => {
      const content = "return value"
      const { result } = smartReplace(content, "  return value  ", "return other")
      expect(result).toContain("other")
    })
  })

  // ── Matcher 3: Block anchor ───────────────────────────────────

  describe("block-anchor match", () => {
    test("matches block by first/last line anchors", () => {
      const content = [
        "function calculate() {",
        "  const a = 1",
        "  const b = 2",
        "  return a + b",
        "}",
      ].join("\n")
      const find = [
        "function calculate() {",
        "  const x = 10",
        "  const y = 20",
        "  return x + y",
        "}",
      ].join("\n")
      const replace = "function fixed() { return 42 }"
      const { result, matcherName } = smartReplace(content, find, replace)
      expect(result).toContain("fixed")
      expect(matcherName).toBe("block-anchor")
    })
  })

  // ── Matcher 8: Context-aware ──────────────────────────────────

  describe("context-aware match", () => {
    test("matches with 50%+ middle line similarity", () => {
      const content = [
        "function test() {",
        "  const a = 1",
        "  const b = 2",
        "  const c = 3",
        "  return a",
        "}",
      ].join("\n")
      const find = [
        "function test() {",
        "  const a = 1",
        "  const b = 999",  // 1 out of 4 middle lines differs
        "  const c = 3",
        "  return a",
        "}",
      ].join("\n")
      const { result } = smartReplace(content, find, "replaced")
      expect(result).toBe("replaced")
    })
  })

  // ── Error case ────────────────────────────────────────────────

  describe("NOT_FOUND", () => {
    test("throws NOT_FOUND when no matcher succeeds", () => {
      expect(() =>
        smartReplace("hello world", "completely different text that doesnt exist anywhere", "x"),
      ).toThrow("NOT_FOUND")
    })
  })

  // ── Multiline content ────────────────────────────────────────

  describe("multiline content", () => {
    test("handles large content without hanging", () => {
      const lines = Array.from({ length: 200 }, (_, i) => `line ${i}: content`)
      const content = lines.join("\n")
      const { result } = smartReplace(content, "line 100: content", "line 100: modified")
      expect(result).toContain("line 100: modified")
      expect(result).toContain("line 99: content")
    })
  })
})
