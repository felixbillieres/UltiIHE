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
import { websocketHandlers } from "./ws"
import { terminalManager } from "../terminal/manager"
import { stopServer as stopLocalServer } from "./services/local/server"
import { reconnectAll } from "../ai/mcp/client"

const app = new Hono()

app.use("*", cors())
app.route("/api", containerRoutes)
app.route("/api", filesRoutes)
app.route("/api", chatRoutes)
app.route("/api", probeRoutes)
app.route("/api", caidoRoutes)
app.route("/api", webtoolRoutes)
app.route("/api", localRoutes)
app.route("/api", providerRoutes)
app.route("/api/mcp", mcpRoutes)

app.get("/api/health", (c) => c.json({ status: "ok", uptime: process.uptime() }))

// ── SSRF protection ───────────────────────────────────────────
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)
    const hostname = parsed.hostname
    // Block localhost variants
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") return true
    // Block private IP ranges
    const parts = hostname.split(".").map(Number)
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      if (parts[0] === 10) return true // 10.0.0.0/8
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true // 172.16.0.0/12
      if (parts[0] === 192 && parts[1] === 168) return true // 192.168.0.0/16
      if (parts[0] === 169 && parts[1] === 254) return true // 169.254.0.0/16 (link-local / cloud metadata)
      if (parts[0] === 0) return true // 0.0.0.0/8
    }
    // Block IPv6 private
    if (hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("[fe80")) return true
    return false
  } catch {
    return true // Invalid URL → block
  }
}

// ── URL fetch proxy (for @url context) ────────────────────────
app.post("/api/fetch-url", async (c) => {
  const { url } = (await c.req.json()) as { url: string }
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return c.json({ error: "Invalid URL" }, 400)
  }
  if (isPrivateUrl(url)) {
    return c.json({ error: "Blocked: cannot fetch private/internal URLs" }, 403)
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "UltiIHE/1.0" },
      signal: AbortSignal.timeout(10000),
      redirect: "manual", // Don't follow redirects blindly
    })
    // Check redirects for SSRF bypass
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location")
      if (location && isPrivateUrl(new URL(location, url).toString())) {
        return c.json({ error: "Blocked: redirect to private/internal URL" }, 403)
      }
      // Re-fetch with redirect following (safe now)
      const finalRes = await fetch(url, {
        headers: { "User-Agent": "UltiIHE/1.0" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      })
      if (!finalRes.ok) return c.json({ error: `HTTP ${finalRes.status}` }, 502)
      const contentType = finalRes.headers.get("content-type") || ""
      const text = await finalRes.text()
      const truncated = text.length > 100_000 ? text.slice(0, 100_000) + "\n\n[Truncated at 100KB]" : text
      return c.json({ content: truncated, contentType, url })
    }
    if (!res.ok) return c.json({ error: `HTTP ${res.status}` }, 502)
    const contentType = res.headers.get("content-type") || ""
    const text = await res.text()
    const truncated = text.length > 100_000 ? text.slice(0, 100_000) + "\n\n[Truncated at 100KB]" : text
    return c.json({ content: truncated, contentType, url })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }
})

app.get("/api/terminals", (c) => c.json({ terminals: terminalManager.listTerminals() }))

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

    // Handle WebSocket upgrade at /ws
    if (url.pathname === "/ws") {
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

// Auto-reconnect MCP servers from saved config
import { readFile } from "fs/promises"
import { join } from "path"
;(async () => {
  try {
    const raw = await readFile(join(process.cwd(), ".ultiIHE", "mcp-servers.json"), "utf-8")
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
