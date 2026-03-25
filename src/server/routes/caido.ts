/**
 * Caido proxy routes — server proxies GraphQL calls to Caido
 * so the browser avoids CORS and the AI tools share the same client.
 */

import { Hono } from "hono"
import { getCaidoClient, setCaidoClient, clearCaidoClient } from "../services/caido"

export const caidoRoutes = new Hono()

// ── Connect ──────────────────────────────────────────────────

caidoRoutes.post("/caido/connect", async (c) => {
  const { url, token } = await c.req.json<{ url: string; token: string }>()

  if (!url || !token) {
    return c.json({ error: "url and token are required" }, 400)
  }

  // Validate Caido URL: must be HTTP(S), typically localhost
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return c.json({ error: "Caido URL must use HTTP or HTTPS" }, 400)
    }
  } catch {
    return c.json({ error: "Invalid Caido URL" }, 400)
  }

  const client = setCaidoClient(url, token)
  const ok = await client.testConnection()

  if (!ok) {
    clearCaidoClient()
    return c.json({ error: "Could not connect to Caido at " + url }, 502)
  }

  console.log(`[Caido] Connected to ${url}`)
  return c.json({ connected: true })
})

caidoRoutes.post("/caido/disconnect", (c) => {
  clearCaidoClient()
  console.log("[Caido] Disconnected")
  return c.json({ connected: false })
})

caidoRoutes.get("/caido/status", (c) => {
  return c.json({ connected: getCaidoClient() !== null })
})

// ── Requests ─────────────────────────────────────────────────

caidoRoutes.get("/caido/requests", async (c) => {
  const client = getCaidoClient()
  if (!client) return c.json({ error: "Not connected to Caido" }, 503)

  const first = parseInt(c.req.query("first") || "50", 10)
  const after = c.req.query("after") || undefined
  const filter = c.req.query("filter") || undefined

  try {
    const page = await client.getRequests({ first, after, filter })
    return c.json(page)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

caidoRoutes.get("/caido/requests/:id", async (c) => {
  const client = getCaidoClient()
  if (!client) return c.json({ error: "Not connected to Caido" }, 503)

  try {
    const detail = await client.getRequestById(c.req.param("id"))
    return c.json(detail)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

// ── Scope ────────────────────────────────────────────────────

caidoRoutes.get("/caido/scope", async (c) => {
  const client = getCaidoClient()
  if (!client) return c.json({ error: "Not connected to Caido" }, 503)

  try {
    const scopes = await client.getScopes()
    return c.json({ scopes })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

// ── Sitemap ──────────────────────────────────────────────────

caidoRoutes.get("/caido/sitemap", async (c) => {
  const client = getCaidoClient()
  if (!client) return c.json({ error: "Not connected to Caido" }, 503)

  const parentId = c.req.query("parentId") || undefined

  try {
    const entries = await client.getSitemap(parentId)
    return c.json({ entries })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})
