/**
 * Shared validation constants and helpers.
 * Single source of truth for container names, paths, etc.
 */

export const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function isValidContainerName(name: string): boolean {
  return CONTAINER_NAME_RE.test(name)
}

export function validatePath(path: string): boolean {
  if (!path.startsWith("/")) return false
  if (path.includes("..")) return false
  if (path.includes("\0")) return false
  return /^\/[a-zA-Z0-9_./ @+:,~#%-]*$/.test(path)
}

export const PROTECTED_ROOTS = new Set([
  "/", "/bin", "/sbin", "/lib", "/lib64", "/usr", "/var",
  "/boot", "/dev", "/proc", "/sys", "/run",
])

/** Check if a URL points to a private/internal network (SSRF protection). */
export function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)
    // Block non-HTTP protocols (file://, gopher://, ftp://, etc.)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true
    const hostname = parsed.hostname
    // Block localhost variants
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") return true
    // Block private IPv4 ranges
    const parts = hostname.split(".").map(Number)
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      if (parts[0] === 10) return true // 10.0.0.0/8
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true // 172.16.0.0/12
      if (parts[0] === 192 && parts[1] === 168) return true // 192.168.0.0/16
      if (parts[0] === 169 && parts[1] === 254) return true // 169.254.0.0/16 (link-local / cloud metadata)
      if (parts[0] === 0) return true // 0.0.0.0/8
    }
    // Block IPv6 private (fc00::/7, fe80::/10, IPv4-mapped)
    // URL.hostname strips brackets: "[::1]" → "::1"
    const h6 = hostname.replace(/^\[|\]$/g, "")
    if (h6.startsWith("fc") || h6.startsWith("fd") || h6.startsWith("fe80") || h6 === "::1") return true
    if (h6.startsWith("::ffff:")) return true
    return false
  } catch {
    return true // Invalid URL → block
  }
}
