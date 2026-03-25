/**
 * Exegol-history (exh) API routes.
 * Wraps `docker exec <container> exegol-history ...` commands.
 */

import { Hono } from "hono"
import { z } from "zod"
import { dockerExec, shellEscape } from "../../ai/tool/exec"
import { isValidContainerName } from "../../shared/validation"

export const exhRoutes = new Hono()

// ── Helpers ───────────────────────────────────────────────────

/** Parse exh JSON export output. Returns empty array on failure. */
function parseJsonOutput(stdout: string): any[] {
  try {
    // exh export --format json outputs a JSON array
    const trimmed = stdout.trim()
    if (!trimmed || trimmed === "[]") return []
    return JSON.parse(trimmed)
  } catch {
    return []
  }
}

// The actual exh binary path in Exegol containers (it's a zsh function, not in PATH for sh)
const EXH_CMD = "/opt/tools/Exegol-history/venv/bin/python3 /opt/tools/Exegol-history/exegol-history.py"

/** Run exh command and return parsed result */
async function exhExec(container: string, args: string): Promise<{ data?: any; error?: string; exitCode: number }> {
  try {
    const result = await dockerExec(container, `${EXH_CMD} ${args}`, { timeout: 15_000 })
    if (result.exitCode !== 0) {
      return { error: result.stderr.trim() || `exh exited with code ${result.exitCode}`, exitCode: result.exitCode }
    }
    return { data: result.stdout, exitCode: 0 }
  } catch (e) {
    return { error: (e as Error).message, exitCode: -1 }
  }
}

// ── Credentials ──────────────────────────────────────────────

exhRoutes.get("/exh/:container/creds", async (c) => {
  const container = c.req.param("container")
  const result = await exhExec(container, "export creds --json")
  if (result.error && result.exitCode === -1) return c.json({ error: result.error, creds: [] }, 500)
  const creds = parseJsonOutput(result.data || "")
  return c.json({ creds })
})

exhRoutes.post("/exh/:container/creds", async (c) => {
  const container = c.req.param("container")
  if (!isValidContainerName(container)) return c.json({ error: "Invalid container" }, 400)
  const parsed = z.object({
    username: z.string().optional(),
    password: z.string().optional(),
    hash: z.string().optional(),
    domain: z.string().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400)
  const body = parsed.data

  const args: string[] = ["add", "creds"]
  if (body.username) args.push("-u", shellEscape(body.username))
  if (body.password) args.push("-p", shellEscape(body.password))
  if (body.hash) args.push("-H", shellEscape(body.hash))
  if (body.domain) args.push("-d", shellEscape(body.domain))

  const result = await exhExec(container, args.join(" "))
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
})

exhRoutes.delete("/exh/:container/creds", async (c) => {
  const container = c.req.param("container")
  if (!isValidContainerName(container)) return c.json({ error: "Invalid container" }, 400)
  const parsed = z.object({ username: z.string().min(1) }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: "username required" }, 400)
  const { username } = parsed.data
  const result = await exhExec(container, `rm creds -u ${shellEscape(username)}`)
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
})

// ── Hosts ────────────────────────────────────────────────────

exhRoutes.get("/exh/:container/hosts", async (c) => {
  const container = c.req.param("container")
  const result = await exhExec(container, "export hosts --json")
  if (result.error && result.exitCode === -1) return c.json({ error: result.error, hosts: [] }, 500)
  const hosts = parseJsonOutput(result.data || "")
  return c.json({ hosts })
})

exhRoutes.post("/exh/:container/hosts", async (c) => {
  const container = c.req.param("container")
  if (!isValidContainerName(container)) return c.json({ error: "Invalid container" }, 400)
  const parsed = z.object({
    ip: z.string().optional(),
    hostname: z.string().optional(),
    role: z.string().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400)
  const body = parsed.data

  const args: string[] = ["add", "hosts"]
  if (body.ip) args.push("--ip", shellEscape(body.ip))
  if (body.hostname) args.push("-n", shellEscape(body.hostname))
  if (body.role) args.push("-r", shellEscape(body.role))

  const result = await exhExec(container, args.join(" "))
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
})

exhRoutes.delete("/exh/:container/hosts", async (c) => {
  const container = c.req.param("container")
  if (!isValidContainerName(container)) return c.json({ error: "Invalid container" }, 400)
  const parsed = z.object({ ip: z.string().min(1) }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: "ip required" }, 400)
  const { ip } = parsed.data
  const result = await exhExec(container, `rm hosts --ip ${shellEscape(ip)}`)
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
})

// ── Environment variables ────────────────────────────────────

exhRoutes.get("/exh/:container/env", async (c) => {
  const container = c.req.param("container")
  const result = await exhExec(container, "show")
  if (result.error && result.exitCode === -1) return c.json({ error: result.error, env: {} }, 200)

  // Parse output: supports multiple formats
  // - "exh show": "$USER = admin" or "USER: admin"
  // - profile.sh: "export USER='admin'" or "#export USER=''"
  const env: Record<string, string> = {}
  for (const line of (result.data || "").split("\n")) {
    // Match: export VAR='value' (uncommented, non-empty)
    const exportMatch = line.match(/^export\s+(\w+)='([^']*)'/)
    if (exportMatch && exportMatch[2]) {
      env[exportMatch[1]] = exportMatch[2]
      continue
    }
    // Match: $VAR = value, VAR = value, VAR: value
    const kvMatch = line.match(/^\$?(\w+)\s*[=:]\s*(.+)$/)
    if (kvMatch) env[kvMatch[1]] = kvMatch[2].trim()
  }
  return c.json({ env })
})

// ── Sync (NetExec, Metasploit) ───────────────────────────────

exhRoutes.post("/exh/:container/sync", async (c) => {
  const container = c.req.param("container")
  const result = await exhExec(container, "sync")
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true, output: result.data })
})

// ── Check if exh is available in container ───────────────────

exhRoutes.get("/exh/:container/status", async (c) => {
  const container = c.req.param("container")
  // Use --help instead of version — older exh versions don't have a version command
  const result = await exhExec(container, "--help")
  return c.json({
    available: result.exitCode === 0,
    version: null,
    error: result.error || null,
  })
})
