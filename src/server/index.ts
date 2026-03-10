import { Hono } from "hono"
import { cors } from "hono/cors"
import { containerRoutes } from "./routes/containers"
import { filesRoutes } from "./routes/files"
import { chatRoutes } from "./routes/chat"
import { caidoRoutes } from "./routes/caido"
import { webtoolRoutes } from "./routes/webtool"
import { websocketHandlers } from "./ws"
import { terminalManager } from "../terminal/manager"

const app = new Hono()

app.use("*", cors())
app.route("/api", containerRoutes)
app.route("/api", filesRoutes)
app.route("/api", chatRoutes)
app.route("/api", caidoRoutes)
app.route("/api", webtoolRoutes)

app.get("/api/health", (c) => c.json({ status: "ok", uptime: process.uptime() }))

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

// Graceful shutdown
function shutdown() {
  console.log("\n[Exegol IHE] Shutting down...")
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
