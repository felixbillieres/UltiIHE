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
