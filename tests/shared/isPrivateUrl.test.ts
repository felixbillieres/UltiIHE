import { describe, expect, test } from "bun:test"
import { isPrivateUrl } from "../../src/shared/validation"

describe("isPrivateUrl", () => {
  // ── Should BLOCK (return true) ─────────────────────────────

  test("blocks localhost variants", () => {
    expect(isPrivateUrl("http://localhost")).toBe(true)
    expect(isPrivateUrl("http://localhost:8080")).toBe(true)
    expect(isPrivateUrl("http://127.0.0.1")).toBe(true)
    expect(isPrivateUrl("http://127.0.0.1:3000")).toBe(true)
    expect(isPrivateUrl("http://0.0.0.0")).toBe(true)
    expect(isPrivateUrl("http://[::1]")).toBe(true)
  })

  test("blocks 10.x.x.x (RFC 1918)", () => {
    expect(isPrivateUrl("http://10.0.0.1")).toBe(true)
    expect(isPrivateUrl("http://10.255.255.255")).toBe(true)
    expect(isPrivateUrl("http://10.0.0.1:8080/path")).toBe(true)
  })

  test("blocks 172.16-31.x.x (RFC 1918)", () => {
    expect(isPrivateUrl("http://172.16.0.1")).toBe(true)
    expect(isPrivateUrl("http://172.31.255.255")).toBe(true)
    expect(isPrivateUrl("http://172.20.0.1")).toBe(true)
  })

  test("blocks 192.168.x.x (RFC 1918)", () => {
    expect(isPrivateUrl("http://192.168.0.1")).toBe(true)
    expect(isPrivateUrl("http://192.168.1.100:443")).toBe(true)
  })

  test("blocks link-local / cloud metadata (169.254.x.x)", () => {
    expect(isPrivateUrl("http://169.254.169.254")).toBe(true)
    expect(isPrivateUrl("http://169.254.169.254/latest/meta-data/")).toBe(true)
  })

  test("blocks 0.0.0.0/8", () => {
    expect(isPrivateUrl("http://0.0.0.1")).toBe(true)
    expect(isPrivateUrl("http://0.255.255.255")).toBe(true)
  })

  test("blocks IPv6 private ranges", () => {
    expect(isPrivateUrl("http://[fc00::1]")).toBe(true)
    expect(isPrivateUrl("http://[fd12:3456::1]")).toBe(true)
    expect(isPrivateUrl("http://[fe80::1]")).toBe(true)
  })

  test("blocks IPv4-mapped IPv6", () => {
    expect(isPrivateUrl("http://[::ffff:192.168.0.1]")).toBe(true)
    expect(isPrivateUrl("http://[::ffff:127.0.0.1]")).toBe(true)
  })

  test("blocks non-HTTP protocols", () => {
    expect(isPrivateUrl("file:///etc/passwd")).toBe(true)
    expect(isPrivateUrl("ftp://example.com")).toBe(true)
    expect(isPrivateUrl("gopher://example.com")).toBe(true)
    expect(isPrivateUrl("javascript:alert(1)")).toBe(true)
  })

  test("blocks invalid URLs", () => {
    expect(isPrivateUrl("not-a-url")).toBe(true)
    expect(isPrivateUrl("")).toBe(true)
  })

  // ── Should ALLOW (return false) ────────────────────────────

  test("allows public HTTP(S) URLs", () => {
    expect(isPrivateUrl("https://example.com")).toBe(false)
    expect(isPrivateUrl("https://google.com")).toBe(false)
    expect(isPrivateUrl("http://8.8.8.8")).toBe(false)
    expect(isPrivateUrl("https://exploit-db.com/exploits/12345")).toBe(false)
  })

  test("allows non-private IP ranges", () => {
    expect(isPrivateUrl("http://1.1.1.1")).toBe(false)
    expect(isPrivateUrl("http://172.15.0.1")).toBe(false) // 172.15 is NOT private
    expect(isPrivateUrl("http://172.32.0.1")).toBe(false) // 172.32 is NOT private
    expect(isPrivateUrl("http://192.167.0.1")).toBe(false) // 192.167 is NOT private
    expect(isPrivateUrl("http://11.0.0.1")).toBe(false) // 11.x is NOT private
  })
})
