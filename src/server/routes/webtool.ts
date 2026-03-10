/**
 * Web tool routes — launch/stop tools in containers + reverse proxy.
 */

import { Hono } from "hono"
import {
  launchTool,
  stopTool,
  getRunningTool,
  getAllRunningTools,
  getToolDef,
  getProxyTarget,
  TOOL_DEFS,
} from "../services/webtool"

export const webtoolRoutes = new Hono()

// ── List available tool definitions ──────────────────────────

webtoolRoutes.get("/webtools", (c) => {
  return c.json({
    tools: TOOL_DEFS.map((t) => ({
      id: t.id,
      name: t.name,
      port: t.port,
    })),
  })
})

// ── Status of all running tools ──────────────────────────────

webtoolRoutes.get("/webtools/running", (c) => {
  return c.json({ tools: getAllRunningTools() })
})

// ── Launch a tool inside a container ─────────────────────────

webtoolRoutes.post("/webtools/:toolId/launch", async (c) => {
  const toolId = c.req.param("toolId")
  const body = await c.req.json<{ container: string }>()

  if (!body.container) {
    return c.json({ ok: false, error: "container is required" }, 400)
  }

  const def = getToolDef(toolId)
  if (!def) {
    return c.json({ ok: false, error: `Unknown tool: ${toolId}` }, 404)
  }

  try {
    const tool = await launchTool(toolId, body.container)
    return c.json({ ok: tool.status !== "error", tool })
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 500)
  }
})

// ── Stop a running tool ──────────────────────────────────────

webtoolRoutes.post("/webtools/:toolId/stop", async (c) => {
  const toolId = c.req.param("toolId")
  await stopTool(toolId)
  return c.json({ ok: true })
})

// ── Status of a single tool ─────────────────────────────────

webtoolRoutes.get("/webtools/:toolId/status", (c) => {
  const toolId = c.req.param("toolId")
  const tool = getRunningTool(toolId)
  if (!tool) return c.json({ running: false })
  return c.json({ running: true, tool })
})

// ── Reverse proxy ────────────────────────────────────────────

/**
 * Single proxy handler shared by both /webtool/:toolId and /webtool/:toolId/*.
 * - Strips the proxy prefix from the path
 * - Rewrites Location headers on redirects so they stay within the proxy
 * - Removes X-Frame-Options and CSP to allow iframe embedding
 */
async function proxyHandler(c: any) {
  const toolId = c.req.param("toolId")
  const target = getProxyTarget(toolId)

  if (!target) {
    return c.json({ error: `Tool ${toolId} is not running` }, 503)
  }

  const originalUrl = new URL(c.req.url)
  const proxyPrefix = `/api/webtool/${toolId}`
  const path = originalUrl.pathname.startsWith(proxyPrefix)
    ? originalUrl.pathname.slice(proxyPrefix.length) || "/"
    : "/"
  const targetUrl = `${target}${path}${originalUrl.search}`

  try {
    const headers = new Headers(c.req.raw.headers)
    headers.delete("host")
    headers.set("host", new URL(target).host)

    const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD"
    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      // @ts-ignore - Bun supports duplex
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    })

    const respHeaders = new Headers(resp.headers)

    // Strip iframe-blocking headers
    respHeaders.delete("x-frame-options")
    respHeaders.delete("content-security-policy")

    // Rewrite Location headers on redirects to stay within proxy
    const location = respHeaders.get("location")
    if (location && resp.status >= 300 && resp.status < 400) {
      // Location can be absolute (http://...) or relative (/path)
      let newLocation: string
      if (location.startsWith("http://") || location.startsWith("https://")) {
        // Absolute URL: extract path and rewrite
        const locUrl = new URL(location)
        newLocation = `${proxyPrefix}${locUrl.pathname}${locUrl.search}`
      } else if (location.startsWith("/")) {
        // Absolute path: prepend proxy prefix
        newLocation = `${proxyPrefix}${location}`
      } else {
        // Relative path: keep as-is
        newLocation = location
      }
      respHeaders.set("location", newLocation)
    }

    // Avoid encoding issues
    respHeaders.delete("content-encoding")
    respHeaders.delete("content-length")
    // CORS
    respHeaders.set("access-control-allow-origin", "*")

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    })
  } catch (e) {
    return c.json({ error: `Proxy error: ${(e as Error).message}` }, 502)
  }
}

webtoolRoutes.all("/webtool/:toolId/*", proxyHandler)
webtoolRoutes.all("/webtool/:toolId", proxyHandler)
