import { Hono } from "hono"
import * as exegol from "../services/exegol"

export const containerRoutes = new Hono()

// ── Exegol info (containers + images + version) ──────────────

containerRoutes.get("/exegol/info", async (c) => {
  try {
    const info = await exegol.getExegolInfo()
    return c.json({ ok: true, data: info })
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 500)
  }
})

// ── Container detail ─────────────────────────────────────────

containerRoutes.get("/exegol/containers/:name", async (c) => {
  const name = c.req.param("name")
  try {
    const detail = await exegol.getContainerDetail(name)
    if (!detail) return c.json({ ok: false, error: "Not found" }, 404)
    return c.json({ ok: true, data: detail })
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 500)
  }
})

// ── Container lifecycle ──────────────────────────────────────

containerRoutes.post("/exegol/containers", async (c) => {
  const body = await c.req.json()
  const result = await exegol.createContainer(body)
  return c.json(result, result.ok ? 200 : 400)
})

containerRoutes.post("/exegol/containers/:name/start", async (c) => {
  const name = c.req.param("name")
  const result = await exegol.startContainer(name)
  return c.json(result, result.ok ? 200 : 500)
})

containerRoutes.post("/exegol/containers/:name/stop", async (c) => {
  const name = c.req.param("name")
  const result = await exegol.stopContainer(name)
  return c.json(result, result.ok ? 200 : 500)
})

containerRoutes.post("/exegol/containers/:name/restart", async (c) => {
  const name = c.req.param("name")
  const result = await exegol.restartContainer(name)
  return c.json(result, result.ok ? 200 : 500)
})

containerRoutes.post("/exegol/containers/:name/remove", async (c) => {
  const name = c.req.param("name")
  const body = await c.req.json().catch(() => ({}))
  const result = await exegol.removeContainer(name, body.force ?? false)
  return c.json(result, result.ok ? 200 : 500)
})

// ── Image lifecycle ──────────────────────────────────────────

containerRoutes.post("/exegol/images/:name/install", async (c) => {
  const name = c.req.param("name")
  const result = await exegol.installImage(name)
  return c.json(result, result.ok ? 200 : 500)
})

containerRoutes.post("/exegol/images/:name/update", async (c) => {
  const name = c.req.param("name")
  const result = await exegol.updateImage(name)
  return c.json(result, result.ok ? 200 : 500)
})

containerRoutes.post("/exegol/images/:name/uninstall", async (c) => {
  const name = c.req.param("name")
  const body = await c.req.json().catch(() => ({}))
  const result = await exegol.uninstallImage(name, body.force ?? false)
  return c.json(result, result.ok ? 200 : 500)
})

// ── Container upgrade ───────────────────────────────────────

containerRoutes.post("/exegol/containers/:name/upgrade", async (c) => {
  const name = c.req.param("name")
  const body = await c.req.json().catch(() => ({}))
  const result = await exegol.upgradeContainer(name, body.imageTag, body.force ?? false)
  return c.json(result, result.ok ? 200 : 500)
})

// ── Legacy compat: /containers endpoint (used by old store) ──

containerRoutes.get("/containers", async (c) => {
  try {
    const info = await exegol.getExegolInfo()
    // Map to old format for backward compat
    const containers = info.containers.map((ct) => ({
      id: ct.dockerName,
      name: ct.dockerName,
      image: ct.image,
      state: ct.state.toLowerCase() === "running" ? "running" : "exited",
      status: ct.state,
      ports: [] as string[],
    }))
    return c.json({ containers })
  } catch (e) {
    return c.json({ containers: [], error: (e as Error).message }, 500)
  }
})
