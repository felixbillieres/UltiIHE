import { Hono } from "hono"
import {
  connectServer,
  disconnectServer,
  listServers,
  getServerState,
  reconnectAll,
  type MCPServerConfig,
} from "../../../ai/mcp/client"
import { readFile, writeFile, mkdir } from "fs/promises"
import { join } from "path"

export const mcpRoutes = new Hono()

// Config file path
const CONFIG_DIR = join(process.cwd(), ".ultiIHE")
const CONFIG_FILE = join(CONFIG_DIR, "mcp-servers.json")

async function loadConfigs(): Promise<MCPServerConfig[]> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8")
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function saveConfigs(configs: MCPServerConfig[]): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(configs, null, 2))
}

// List all MCP servers and their status
mcpRoutes.get("/servers", (c) => {
  return c.json(listServers())
})

// Get single server state
mcpRoutes.get("/servers/:id", (c) => {
  const state = getServerState(c.req.param("id"))
  if (!state) return c.json({ error: "Server not found" }, 404)
  return c.json(state)
})

// Add/update and connect a server
mcpRoutes.post("/servers", async (c) => {
  const config = await c.req.json() as MCPServerConfig
  if (!config.id || !config.name || !config.transport) {
    return c.json({ error: "Missing required fields: id, name, transport" }, 400)
  }

  const state = await connectServer(config)

  // Persist to config file
  const configs = await loadConfigs()
  const idx = configs.findIndex((c) => c.id === config.id)
  if (idx >= 0) configs[idx] = config
  else configs.push(config)
  await saveConfigs(configs)

  return c.json(state)
})

// Disconnect and remove a server
mcpRoutes.delete("/servers/:id", async (c) => {
  const id = c.req.param("id")
  await disconnectServer(id)

  // Remove from config
  const configs = await loadConfigs()
  await saveConfigs(configs.filter((c) => c.id !== id))

  return c.json({ ok: true })
})

// Reconnect a server
mcpRoutes.post("/servers/:id/reconnect", async (c) => {
  const id = c.req.param("id")
  const configs = await loadConfigs()
  const config = configs.find((c) => c.id === id)
  if (!config) return c.json({ error: "Server config not found" }, 404)

  const state = await connectServer(config)
  return c.json(state)
})

// Get saved configs
mcpRoutes.get("/configs", async (c) => {
  const configs = await loadConfigs()
  return c.json(configs)
})

// Reconnect all saved servers (called on startup)
mcpRoutes.post("/reconnect-all", async (c) => {
  const configs = await loadConfigs()
  await reconnectAll(configs)
  return c.json(listServers())
})
