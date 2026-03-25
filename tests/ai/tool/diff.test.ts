import { describe, expect, test } from "bun:test"
import { generateDiff } from "../../../src/ai/tool/diff"

describe("generateDiff", () => {
  test("returns no-changes marker for identical content", () => {
    expect(generateDiff("/test.txt", "hello", "hello")).toBe("(no changes)")
  })

  test("shows simple single-line change", () => {
    const diff = generateDiff("/test.txt", "line1\nline2\nline3", "line1\nmodified\nline3")
    expect(diff).toContain("--- a/test.txt")
    expect(diff).toContain("+++ b/test.txt")
    expect(diff).toContain("-line2")
    expect(diff).toContain("+modified")
    expect(diff).toContain(" line1")
    expect(diff).toContain(" line3")
  })

  test("shows added lines", () => {
    const diff = generateDiff("/f.txt", "a\nb", "a\nb\nc")
    expect(diff).toContain("+c")
  })

  test("shows removed lines", () => {
    const diff = generateDiff("/f.txt", "a\nb\nc", "a\nc")
    expect(diff).toContain("-b")
  })

  test("includes context lines around changes", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`)
    const modified = [...lines]
    modified[5] = "CHANGED"
    const diff = generateDiff("/f.txt", lines.join("\n"), modified.join("\n"), 2)
    // Should have context around change at line 5
    expect(diff).toContain(" line3") // 2 lines before
    expect(diff).toContain(" line4")
    expect(diff).toContain("-line5")
    expect(diff).toContain("+CHANGED")
    expect(diff).toContain(" line6") // context after
  })

  test("handles empty original (new file)", () => {
    const diff = generateDiff("/new.txt", "", "hello\nworld")
    expect(diff).toContain("+hello")
    expect(diff).toContain("+world")
  })

  test("handles empty modified (deleted content)", () => {
    const diff = generateDiff("/del.txt", "hello\nworld", "")
    expect(diff).toContain("-hello")
    expect(diff).toContain("-world")
  })

  test("includes @@ hunk header", () => {
    const diff = generateDiff("/f.txt", "a\nb", "a\nc")
    expect(diff).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/)
  })
})
