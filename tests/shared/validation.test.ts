import { describe, expect, test } from "bun:test"
import {
  CONTAINER_NAME_RE,
  isValidContainerName,
  validatePath,
  PROTECTED_ROOTS,
} from "../../src/shared/validation"

// ── isValidContainerName ──────────────────────────────────────

describe("isValidContainerName", () => {
  test("accepts simple alphanumeric names", () => {
    expect(isValidContainerName("exegol")).toBe(true)
    expect(isValidContainerName("mylab01")).toBe(true)
  })

  test("accepts names with dots, dashes, underscores", () => {
    expect(isValidContainerName("exegol-htb")).toBe(true)
    expect(isValidContainerName("lab.test")).toBe(true)
    expect(isValidContainerName("my_container")).toBe(true)
    expect(isValidContainerName("a.b-c_d")).toBe(true)
  })

  test("rejects names starting with special chars", () => {
    expect(isValidContainerName(".hidden")).toBe(false)
    expect(isValidContainerName("-dash")).toBe(false)
    expect(isValidContainerName("_under")).toBe(false)
  })

  test("rejects empty string", () => {
    expect(isValidContainerName("")).toBe(false)
  })

  test("rejects names with spaces", () => {
    expect(isValidContainerName("my container")).toBe(false)
  })

  test("rejects names with shell metacharacters", () => {
    expect(isValidContainerName("test;rm -rf")).toBe(false)
    expect(isValidContainerName("test$(cmd)")).toBe(false)
    expect(isValidContainerName("test`cmd`")).toBe(false)
    expect(isValidContainerName("test&bg")).toBe(false)
    expect(isValidContainerName("test|pipe")).toBe(false)
    expect(isValidContainerName("test>redir")).toBe(false)
  })

  test("rejects names with path traversal", () => {
    expect(isValidContainerName("../etc")).toBe(false)
    expect(isValidContainerName("test/../../")).toBe(false)
  })

  test("regex matches function behavior", () => {
    const cases = ["valid", ".nope", "ok-1", "", "a b"]
    for (const c of cases) {
      expect(CONTAINER_NAME_RE.test(c)).toBe(isValidContainerName(c))
    }
  })
})

// ── validatePath ──────────────────────────────────────────────

describe("validatePath", () => {
  test("accepts absolute unix paths", () => {
    expect(validatePath("/home/user/file.txt")).toBe(true)
    expect(validatePath("/etc/passwd")).toBe(true)
    expect(validatePath("/tmp/test")).toBe(true)
    expect(validatePath("/")).toBe(true)
  })

  test("accepts paths with spaces", () => {
    expect(validatePath("/home/user/my file.txt")).toBe(true)
  })

  test("accepts paths with common special chars", () => {
    expect(validatePath("/opt/tools/nmap_results.xml")).toBe(true)
    expect(validatePath("/home/user/.config")).toBe(true)
    expect(validatePath("/tmp/scan-2024-01-01")).toBe(true)
    expect(validatePath("/tmp/file@host")).toBe(true)
    expect(validatePath("/tmp/file+extra")).toBe(true)
    expect(validatePath("/tmp/file:port")).toBe(true)
    expect(validatePath("/tmp/file,list")).toBe(true)
    expect(validatePath("/tmp/file~bak")).toBe(true)
    expect(validatePath("/tmp/file#tag")).toBe(true)
    expect(validatePath("/tmp/100%done")).toBe(true)
  })

  test("rejects relative paths", () => {
    expect(validatePath("relative/path")).toBe(false)
    expect(validatePath("./file")).toBe(false)
  })

  test("rejects path traversal", () => {
    expect(validatePath("/home/../etc/shadow")).toBe(false)
    expect(validatePath("/tmp/../../root")).toBe(false)
  })

  test("rejects null bytes", () => {
    expect(validatePath("/tmp/file\0injected")).toBe(false)
  })

  test("rejects shell metacharacters in paths", () => {
    expect(validatePath("/tmp/$(whoami)")).toBe(false)
    expect(validatePath("/tmp/`id`")).toBe(false)
    expect(validatePath("/tmp/;rm -rf")).toBe(false)
    expect(validatePath("/tmp/test|cat")).toBe(false)
    expect(validatePath("/tmp/test&bg")).toBe(false)
  })
})

// ── PROTECTED_ROOTS ───────────────────────────────────────────

describe("PROTECTED_ROOTS", () => {
  test("contains critical system directories", () => {
    expect(PROTECTED_ROOTS.has("/")).toBe(true)
    expect(PROTECTED_ROOTS.has("/bin")).toBe(true)
    expect(PROTECTED_ROOTS.has("/sbin")).toBe(true)
    expect(PROTECTED_ROOTS.has("/usr")).toBe(true)
    expect(PROTECTED_ROOTS.has("/dev")).toBe(true)
    expect(PROTECTED_ROOTS.has("/proc")).toBe(true)
    expect(PROTECTED_ROOTS.has("/sys")).toBe(true)
  })

  test("does not contain user/data directories", () => {
    expect(PROTECTED_ROOTS.has("/home")).toBe(false)
    expect(PROTECTED_ROOTS.has("/tmp")).toBe(false)
    expect(PROTECTED_ROOTS.has("/opt")).toBe(false)
    expect(PROTECTED_ROOTS.has("/root")).toBe(false)
  })
})
