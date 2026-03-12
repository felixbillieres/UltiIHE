import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Tool } from "ai"
import { jsonSchemaToZod } from "./convert"

export type MCPTransportType = "stdio" | "sse" | "streamable-http"

export interface MCPServerConfig {
  id: string
  name: string
  transport: MCPTransportType
  // stdio
  command?: string
  args?: string[]
  env?: Record<string, string>
  // sse / streamable-http
  url?: string
}

export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MCPServerState {
  config: MCPServerConfig
  status: MCPServerStatus
  error?: string
  tools: MCPToolInfo[]
}

export interface MCPToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const servers = new Map<string, { client: Client; transport: any; state: MCPServerState }>()

function createTransport(config: MCPServerConfig) {
  switch (config.transport) {
    case "stdio": {
      if (!config.command) throw new Error("stdio transport requires command")
      return new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
      })
    }
    case "sse": {
      if (!config.url) throw new Error("sse transport requires url")
      return new SSEClientTransport(new URL(config.url))
    }
    case "streamable-http": {
      if (!config.url) throw new Error("streamable-http transport requires url")
      return new StreamableHTTPClientTransport(new URL(config.url))
    }
    default:
      throw new Error(`Unknown transport: ${config.transport}`)
  }
}

export async function connectServer(config: MCPServerConfig): Promise<MCPServerState> {
  // Disconnect existing if any
  await disconnectServer(config.id)

  const state: MCPServerState = {
    config,
    status: "connecting",
    tools: [],
  }

  try {
    const transport = createTransport(config)
    const client = new Client(
      { name: "ultiIHE", version: "0.1.0" },
      { capabilities: {} },
    )

    await client.connect(transport)
    state.status = "connected"

    // Discover tools
    try {
      const result = await client.listTools()
      state.tools = (result.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: (t.inputSchema || { type: "object", properties: {} }) as Record<string, unknown>,
      }))
    } catch {
      // Server might not support tools
      state.tools = []
    }

    servers.set(config.id, { client, transport, state })
    console.log(`[MCP] Connected: ${config.name} (${state.tools.length} tools)`)
    return state
  } catch (err) {
    state.status = "error"
    state.error = (err as Error).message
    servers.set(config.id, { client: null as any, transport: null, state })
    console.error(`[MCP] Failed to connect ${config.name}:`, (err as Error).message)
    return state
  }
}

export async function disconnectServer(id: string): Promise<void> {
  const entry = servers.get(id)
  if (!entry) return

  try {
    if (entry.client) {
      await entry.client.close()
    }
  } catch {
    // Ignore close errors
  }
  servers.delete(id)
  console.log(`[MCP] Disconnected: ${entry.state.config.name}`)
}

export function getServerState(id: string): MCPServerState | undefined {
  return servers.get(id)?.state
}

export function listServers(): MCPServerState[] {
  return Array.from(servers.values()).map((e) => e.state)
}

/** Convert all connected MCP tools into AI SDK tools */
export function getMCPTools(): Record<string, Tool<any, any>> {
  const tools: Record<string, Tool<any, any>> = {}

  for (const [_id, entry] of servers) {
    if (entry.state.status !== "connected" || !entry.client) continue

    for (const mcpTool of entry.state.tools) {
      const toolName = `mcp_${entry.state.config.id}_${mcpTool.name}`
      const zodSchema = jsonSchemaToZod(mcpTool.inputSchema)
      const client = entry.client
      const mcpToolName = mcpTool.name

      tools[toolName] = {
        description: `[MCP:${entry.state.config.name}] ${mcpTool.description}`,
        inputSchema: zodSchema,
        execute: async (args: any) => {
          try {
            const result = await client.callTool({
              name: mcpToolName,
              arguments: args as Record<string, unknown>,
            })
            if (Array.isArray(result.content)) {
              return result.content
                .map((c: any) => {
                  if (c.type === "text") return c.text
                  if (c.type === "image") return `[Image: ${c.mimeType}]`
                  return JSON.stringify(c)
                })
                .join("\n")
            }
            return String(result.content ?? "")
          } catch (err) {
            return `MCP tool error: ${(err as Error).message}`
          }
        },
      }
    }
  }

  return tools
}

/** Reconnect all servers from config list */
export async function reconnectAll(configs: MCPServerConfig[]): Promise<void> {
  // Disconnect removed servers
  for (const id of servers.keys()) {
    if (!configs.find((c) => c.id === id)) {
      await disconnectServer(id)
    }
  }
  // Connect new/updated servers
  for (const config of configs) {
    const existing = servers.get(config.id)
    if (existing?.state.status === "connected") continue
    await connectServer(config)
  }
}
