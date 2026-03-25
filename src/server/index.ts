import { Hono } from "hono"
import { cors } from "hono/cors"
import { containerRoutes } from "./routes/containers"
import { filesRoutes } from "./routes/files"
import { chatRoutes } from "./routes/chat"
import { probeRoutes } from "./routes/probe"
import { caidoRoutes } from "./routes/caido"
import { webtoolRoutes } from "./routes/webtool"
import { localRoutes } from "./routes/local"
import { providerRoutes } from "./routes/providers"
import { mcpRoutes } from "./routes/mcp"
import { searchRoutes } from "./routes/search"
import { exhRoutes } from "./routes/exh"
import { websocketHandlers } from "./ws"
import { terminalManager } from "../terminal/manager"
import { stopServer as stopLocalServer } from "./services/local/server"
import { reconnectAll } from "../ai/mcp/client"
import { isPrivateUrl } from "../shared/validation"
import crypto from "node:crypto"

// ── WebSocket auth token (generated once at startup) ─────────
const WS_TOKEN = crypto.randomBytes(32).toString("hex")

const app = new Hono()

app.use("*", cors({
  origin: ["http://localhost:3000", "http://localhost:5173"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}))

// ── Security headers ─────────────────────────────────────────
app.use("*", async (c, next) => {
  await next()
  c.header("X-Content-Type-Options", "nosniff")
  c.header("X-Frame-Options", "DENY")
  c.header("Referrer-Policy", "strict-origin-when-cross-origin")
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws://localhost:* http://localhost:* https://*; " +
    "frame-src 'self' http://localhost:*",
  )
})

// ── Rate limiting (in-memory sliding window) ─────────────────
function rateLimit(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now()
    for (const [key, timestamps] of hits) {
      const valid = timestamps.filter((t) => now - t < windowMs)
      if (valid.length === 0) hits.delete(key)
      else hits.set(key, valid)
    }
  }, windowMs)

  return async (c: any, next: any) => {
    const key = c.req.header("x-forwarded-for") || "local"
    const now = Date.now()
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs)
    if (timestamps.length >= maxRequests) {
      return c.json({ error: "Rate limited, try again later" }, 429)
    }
    timestamps.push(now)
    hits.set(key, timestamps)
    return next()
  }
}

// Apply rate limits to expensive endpoints
app.use("/api/chat", rateLimit(5, 10_000))       // 5 req / 10s (AI calls)
app.use("/api/search", rateLimit(10, 10_000))     // 10 req / 10s (grep ops)
app.use("/api/fetch-url", rateLimit(10, 10_000))  // 10 req / 10s (outbound fetch)
app.use("/api/probe", rateLimit(5, 10_000))       // 5 req / 10s (AI calls)

app.route("/api", containerRoutes)
app.route("/api", filesRoutes)
app.route("/api", chatRoutes)
app.route("/api", probeRoutes)
app.route("/api", caidoRoutes)
app.route("/api", webtoolRoutes)
app.route("/api", localRoutes)
app.route("/api", providerRoutes)
app.route("/api/mcp", mcpRoutes)
app.route("/api", searchRoutes)
app.route("/api", exhRoutes)

app.get("/api/health", (c) => c.json({ status: "ok", uptime: process.uptime() }))
app.get("/api/ws-token", (c) => c.json({ token: WS_TOKEN }))

// ── URL fetch proxy (for @url context) ────────────────────────
const MAX_REDIRECTS = 5

app.post("/api/fetch-url", async (c) => {
  const { url } = (await c.req.json()) as { url: string }
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return c.json({ error: "Invalid URL" }, 400)
  }
  if (isPrivateUrl(url)) {
    return c.json({ error: "Blocked: cannot fetch private/internal URLs" }, 403)
  }
  try {
    // Follow redirects manually, checking each hop for SSRF
    let current = url
    let res: Response | undefined
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (isPrivateUrl(current)) {
        return c.json({ error: "Blocked: redirect to private/internal URL" }, 403)
      }
      res = await fetch(current, {
        headers: { "User-Agent": "ExegolIHE/1.0" },
        signal: AbortSignal.timeout(10000),
        redirect: "manual",
      })
      if (res.status < 300 || res.status >= 400) break
      const location = res.headers.get("location")
      if (!location) break
      current = new URL(location, current).toString()
      if (i === MAX_REDIRECTS) {
        return c.json({ error: "Too many redirects" }, 502)
      }
    }
    if (!res || !res.ok) return c.json({ error: `HTTP ${res?.status ?? 0}` }, 502)
    const contentType = res.headers.get("content-type") || ""
    const text = await res.text()
    const truncated = text.length > 100_000 ? text.slice(0, 100_000) + "\n\n[Truncated at 100KB]" : text
    return c.json({ content: truncated, contentType, url: current })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }
})

app.get("/api/terminals", (c) => c.json({ terminals: terminalManager.listTerminals() }))

// Cleanup ghost terminals — frontend sends its known active IDs, server closes the rest
app.post("/api/terminals/cleanup", async (c) => {
  const { activeIds } = (await c.req.json()) as { activeIds: string[] }
  if (!Array.isArray(activeIds)) {
    return c.json({ error: "activeIds must be an array" }, 400)
  }
  const count = terminalManager.closeExcept(new Set(activeIds))
  if (count > 0) {
    console.log(`[Terminal] Cleanup: closed ${count} ghost terminal(s)`)
  }
  return c.json({ closed: count })
})

app.get("/api/terminals/:id/output", (c) => {
  const id = c.req.param("id")
  try {
    const output = terminalManager.getOutput(id)
    return c.json({ output })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404)
  }
})

const port = 3001

const server = Bun.serve({
  port,
  idleTimeout: 255, // max idle timeout (seconds) — prevents timeout on long AI streams
  fetch(req, server) {
    // Bun can pass relative paths — need a base URL to parse
    const url = new URL(req.url, `http://localhost:${port}`)

    // Handle WebSocket upgrade at /ws (requires auth token)
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token")
      if (token !== WS_TOKEN) {
        return new Response("Unauthorized", { status: 401 })
      }
      const upgraded = server.upgrade(req, { data: {} })
      if (upgraded) return undefined
      return new Response("WebSocket upgrade failed", { status: 400 })
    }

    // Delegate all other requests to Hono
    return app.fetch(req, {})
  },
  websocket: websocketHandlers,
})

console.log(`[Exegol IHE] Server running on http://localhost:${server.port}`)
console.log(`[Exegol IHE] WebSocket available at ws://localhost:${server.port}/ws`)

// Check Docker availability at startup
import { spawn as spawnChild } from "child_process"
;(() => {
  const proc = spawnChild("docker", ["info"], { stdio: "ignore" })
  proc.on("error", () => {
    console.warn("[Exegol IHE] WARNING: Docker is not available. Container features will not work.")
  })
  proc.on("close", (code) => {
    if (code !== 0) {
      console.warn("[Exegol IHE] WARNING: Docker daemon is not running. Container features will not work.")
    } else {
      console.log("[Exegol IHE] Docker is available")
    }
  })
})()

// Auto-reconnect MCP servers from saved config
import { readFile } from "fs/promises"
import { join } from "path"
;(async () => {
  try {
    const raw = await readFile(join(process.cwd(), ".exegol-ihe", "mcp-servers.json"), "utf-8")
    const configs = JSON.parse(raw)
    if (configs.length > 0) {
      console.log(`[MCP] Auto-connecting ${configs.length} saved server(s)...`)
      await reconnectAll(configs)
    }
  } catch {
    // No saved config — that's fine
  }
})()

// Graceful shutdown
async function shutdown() {
  console.log("\n[Exegol IHE] Shutting down...")
  await stopLocalServer()
  terminalManager.closeAll()
  server.stop()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

// Suppress AI SDK internal unhandled rejections (errors are already caught in routes)
process.on("unhandledRejection", (reason) => {
  // Only log, don't crash — AI SDK sometimes fires rejections internally
  // even when we properly handle errors via fullStream/onError
  const msg = reason instanceof Error ? reason.message : String(reason)
  console.warn(`[Exegol IHE] Unhandled rejection (suppressed): ${msg.slice(0, 200)}`)
})
