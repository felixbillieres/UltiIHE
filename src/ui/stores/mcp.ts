import { create } from "zustand"

export type MCPTransportType = "stdio" | "sse" | "streamable-http"
export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MCPServerConfig {
  id: string
  name: string
  transport: MCPTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface MCPToolInfo {
  name: string
  description: string
}

export interface MCPServerState {
  config: MCPServerConfig
  status: MCPServerStatus
  error?: string
  tools: MCPToolInfo[]
}

interface MCPStore {
  servers: MCPServerState[]
  loading: boolean

  fetchServers: () => Promise<void>
  addServer: (config: MCPServerConfig) => Promise<MCPServerState | null>
  removeServer: (id: string) => Promise<void>
  reconnectServer: (id: string) => Promise<void>
}

export const useMCPStore = create<MCPStore>((set, get) => ({
  servers: [],
  loading: false,

  fetchServers: async () => {
    set({ loading: true })
    try {
      const res = await fetch("/api/mcp/servers")
      const data = await res.json()
      set({ servers: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  addServer: async (config) => {
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const state = await res.json() as MCPServerState
      set((s) => {
        const idx = s.servers.findIndex((sv) => sv.config.id === config.id)
        if (idx >= 0) {
          const next = [...s.servers]
          next[idx] = state
          return { servers: next }
        }
        return { servers: [...s.servers, state] }
      })
      return state
    } catch {
      return null
    }
  },

  removeServer: async (id) => {
    try {
      await fetch(`/api/mcp/servers/${id}`, { method: "DELETE" })
      set((s) => ({ servers: s.servers.filter((sv) => sv.config.id !== id) }))
    } catch {}
  },

  reconnectServer: async (id) => {
    try {
      const res = await fetch(`/api/mcp/servers/${id}/reconnect`, { method: "POST" })
      const state = await res.json() as MCPServerState
      set((s) => ({
        servers: s.servers.map((sv) => (sv.config.id === id ? state : sv)),
      }))
    } catch {}
  },
}))
