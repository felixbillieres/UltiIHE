import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface WebTool {
  id: string
  name: string
  icon: string // lucide icon name
}

export const WEB_TOOLS: WebTool[] = [
  { id: "caido", name: "Caido", icon: "Radar" },
  { id: "bloodhound", name: "BloodHound", icon: "Network" },
]

export interface RunningToolInfo {
  toolId: string
  container: string
  port: number
  proxyPort: number
  hostNetwork: boolean
  status: "starting" | "ready" | "error"
  error?: string
}

const API_BASE = "http://localhost:3001/api"

interface WebToolsStore {
  // Running tool state
  runningTools: Record<string, RunningToolInfo>

  // Launch a tool in a container (calls backend)
  launchTool: (toolId: string, container: string) => Promise<RunningToolInfo>
  // Stop a running tool
  stopTool: (toolId: string) => Promise<void>
  // Get proxy URL for an active tool
  getProxyUrl: (toolId: string) => string
  // Check if tool is running
  isToolRunning: (toolId: string) => boolean
  // Get running tool info
  getRunningTool: (toolId: string) => RunningToolInfo | undefined
}

export const useWebToolsStore = create<WebToolsStore>()((set, get) => ({
  runningTools: {},

  launchTool: async (toolId, container) => {
    // Set starting state immediately
    const starting: RunningToolInfo = { toolId, container, port: 0, proxyPort: 0, hostNetwork: false, status: "starting" }
    set((s) => ({
      runningTools: { ...s.runningTools, [toolId]: starting },
    }))

    try {
      const resp = await fetch(`${API_BASE}/webtools/${toolId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ container }),
      })
      const data = await resp.json()

      const info: RunningToolInfo = {
        toolId,
        container,
        port: data.tool?.port || 0,
        proxyPort: data.tool?.proxyPort || 0,
        hostNetwork: data.tool?.hostNetwork || false,
        status: data.ok ? "ready" : "error",
        error: data.tool?.error || data.error,
      }
      set((s) => ({
        runningTools: { ...s.runningTools, [toolId]: info },
      }))
      return info
    } catch (e) {
      const info: RunningToolInfo = {
        toolId,
        container,
        port: 0,
        proxyPort: 0,
        hostNetwork: false,
        status: "error",
        error: (e as Error).message,
      }
      set((s) => ({
        runningTools: { ...s.runningTools, [toolId]: info },
      }))
      return info
    }
  },

  stopTool: async (toolId) => {
    try {
      await fetch(`${API_BASE}/webtools/${toolId}/stop`, { method: "POST" })
    } catch {
      // ignore
    }
    set((s) => {
      const { [toolId]: _, ...rest } = s.runningTools
      return { runningTools: rest }
    })
  },

  getProxyUrl: (toolId) => {
    const tool = get().runningTools[toolId]
    if (tool?.proxyPort) {
      // Each tool has a dedicated proxy port — no path-prefix issues
      return `http://localhost:${tool.proxyPort}/`
    }
    // Fallback
    return `${API_BASE}/webtool/${toolId}/`
  },

  isToolRunning: (toolId) => {
    const tool = get().runningTools[toolId]
    return tool?.status === "ready"
  },

  getRunningTool: (toolId) => {
    return get().runningTools[toolId]
  },
}))
