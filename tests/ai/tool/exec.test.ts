import { describe, expect, test } from "bun:test"
import { shellEscape } from "../../../src/ai/tool/exec"

describe("shellEscape", () => {
  test("wraps simple paths in single quotes", () => {
    expect(shellEscape("/home/user/file.txt")).toBe("'/home/user/file.txt'")
  })

  test("escapes single quotes within the path", () => {
    expect(shellEscape("/tmp/it's a file")).toBe("'/tmp/it'\\''s a file'")
  })

  test("handles multiple single quotes", () => {
    expect(shellEscape("a'b'c")).toBe("'a'\\''b'\\''c'")
  })

  test("handles paths with spaces", () => {
    expect(shellEscape("/home/user/my file")).toBe("'/home/user/my file'")
  })

  test("handles paths with special characters", () => {
    expect(shellEscape("/tmp/$HOME")).toBe("'/tmp/$HOME'")
    expect(shellEscape("/tmp/`cmd`")).toBe("'/tmp/`cmd`'")
    expect(shellEscape("/tmp/test;rm")).toBe("'/tmp/test;rm'")
  })

  test("handles empty string", () => {
    expect(shellEscape("")).toBe("''")
  })

  test("prevents shell injection via single-quote escape", () => {
    // Classic injection: close quote, inject command, reopen quote
    const malicious = "'; rm -rf / '"
    const escaped = shellEscape(malicious)
    // Should NOT produce valid injection — quotes must be properly escaped
    expect(escaped).not.toBe("''; rm -rf / ''")
    // Each ' in input becomes '\'' (close quote, escaped quote, reopen quote)
    expect(escaped).toContain("\\'")
  })
})
