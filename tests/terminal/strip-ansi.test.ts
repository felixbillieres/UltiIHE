import { describe, expect, test } from "bun:test"
import { stripAnsi } from "../../src/terminal/strip-ansi"

describe("stripAnsi", () => {
  test("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world")
    expect(stripAnsi("")).toBe("")
    expect(stripAnsi("line1\nline2")).toBe("line1\nline2")
  })

  test("strips color codes (SGR sequences)", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red")
    expect(stripAnsi("\x1b[1;32mbold green\x1b[0m")).toBe("bold green")
    expect(stripAnsi("\x1b[38;5;196mextended\x1b[0m")).toBe("extended")
  })

  test("strips cursor movement sequences", () => {
    expect(stripAnsi("\x1b[2Jclear")).toBe("clear")
    expect(stripAnsi("\x1b[Hhome")).toBe("home")
    expect(stripAnsi("\x1b[10;20H")).toBe("")
    expect(stripAnsi("\x1b[A\x1b[B\x1b[C\x1b[D")).toBe("")
  })

  test("strips OSC sequences (title changes, hyperlinks)", () => {
    expect(stripAnsi("\x1b]0;terminal title\x07text")).toBe("text")
    expect(stripAnsi("\x1b]0;title\x1b\\text")).toBe("text")
  })

  test("strips BEL and BS control characters", () => {
    expect(stripAnsi("beep\x07")).toBe("beep")
    expect(stripAnsi("back\x08space")).toBe("backspace")
  })

  test("handles mixed ANSI and plain text", () => {
    const input = "\x1b[1m$ \x1b[32mnmap\x1b[0m -sV 10.10.10.1"
    expect(stripAnsi(input)).toBe("$ nmap -sV 10.10.10.1")
  })

  test("handles multiple consecutive escape sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[31m\x1b[4mstyle\x1b[0m")).toBe("style")
  })

  test("preserves newlines and tabs in output", () => {
    expect(stripAnsi("\x1b[32mline1\x1b[0m\n\x1b[31mline2\x1b[0m")).toBe("line1\nline2")
    expect(stripAnsi("col1\tcol2")).toBe("col1\tcol2")
  })

  test("handles real nmap-like output", () => {
    const nmap = "\x1b[1;32m80/tcp\x1b[0m   open  \x1b[1mhttp\x1b[0m    Apache httpd 2.4.41"
    expect(stripAnsi(nmap)).toBe("80/tcp   open  http    Apache httpd 2.4.41")
  })
})
