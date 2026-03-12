import { create } from "zustand"

export interface WebTool {
  id: string
  name: string
  icon: string // lucide icon name
}

export const WEB_TOOLS: WebTool[] = [
  { id: "desktop", name: "Desktop", icon: "Monitor" },
  { id: "caido", name: "Caido", icon: "Radar" },
  { id: "bloodhound", name: "BloodHound", icon: "Network" },
]

/** Composite key: "toolId:container" */
export function toolKey(toolId: string, container: string) {
  return `${toolId}:${container}`
}

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
  // Running tool state keyed by "toolId:container"
  runningTools: Record<string, RunningToolInfo>

  // Launch a tool in a container
  launchTool: (toolId: string, container: string) => Promise<RunningToolInfo>
  // Stop a running tool instance
  stopTool: (toolId: string, container: string) => Promise<void>
  // Get proxy URL for an active tool instance
  getProxyUrl: (toolId: string, container: string) => string
  // Check if a tool is running in a specific container
  isToolRunning: (toolId: string, container: string) => boolean
  // Get running tool info
  getRunningTool: (toolId: string, container: string) => RunningToolInfo | undefined
}

export const useWebToolsStore = create<WebToolsStore>()((set, get) => ({
  runningTools: {},

  launchTool: async (toolId, container) => {
    const key = toolKey(toolId, container)
    const starting: RunningToolInfo = { toolId, container, port: 0, proxyPort: 0, hostNetwork: false, status: "starting" }
    set((s) => ({
      runningTools: { ...s.runningTools, [key]: starting },
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
        runningTools: { ...s.runningTools, [key]: info },
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
        runningTools: { ...s.runningTools, [key]: info },
      }))
      return info
    }
  },

  stopTool: async (toolId, container) => {
    const key = toolKey(toolId, container)
    try {
      await fetch(`${API_BASE}/webtools/${toolId}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ container }),
      })
    } catch {
      // ignore
    }
    set((s) => {
      const { [key]: _, ...rest } = s.runningTools
      return { runningTools: rest }
    })
  },

  getProxyUrl: (toolId, container) => {
    const key = toolKey(toolId, container)
    const tool = get().runningTools[key]
    if (!tool) return `${API_BASE}/webtool/${toolId}/`

    // VNC tools: connect directly to websockify (host network)
    const vncTools = ["desktop"]
    if (vncTools.includes(toolId) && tool.port && tool.hostNetwork) {
      return `http://localhost:${tool.port}/vnc_lite.html?autoconnect=true&scale=true&reconnect=true&reconnect_delay=2000&path=websockify`
    }

    // Web tools (caido, bloodhound): go through reverse proxy
    if (tool.proxyPort) {
      return `http://localhost:${tool.proxyPort}/`
    }
    return `${API_BASE}/webtool/${toolId}/`
  },

  isToolRunning: (toolId, container) => {
    const key = toolKey(toolId, container)
    const tool = get().runningTools[key]
    return tool?.status === "ready"
  },

  getRunningTool: (toolId, container) => {
    const key = toolKey(toolId, container)
    return get().runningTools[key]
  },
}))
