/**
 * Zustand store for local AI state.
 * Tracks hardware info, installed models, server status, and download progress.
 */

import { create } from "zustand"

// ─── Types (mirror server types) ─────────────────────────────

export type GpuBackend = "cuda" | "vulkan" | "metal" | "cpu"
export type ModelFit = "ok" | "tight" | "too-large"

export interface GpuInfo {
  backend: GpuBackend
  name: string
  vramMB: number
  vramFreeMB: number
  driverVersion?: string
}

export interface HardwareInfo {
  platform: string
  arch: string
  totalRAM_MB: number
  freeRAM_MB: number
  cpuCores: number
  gpus: GpuInfo[]
  recommendedBackend: GpuBackend
}

export interface LocalModelDef {
  id: string
  name: string
  description: string
  parameterSize: string
  quantization: string
  fileSizeMB: number
  vramRequiredMB: number
  contextWindow: number
  toolCalling: boolean
  reasoning: boolean
  hfRepo: string
  hfFile: string
  tags: string[]
  // Computed by server
  installed: boolean
  downloading: boolean
  fit: ModelFit
}

export interface InstalledModel {
  id: string
  filePath: string
  fileSizeMB: number
}

export interface BinaryStatus {
  installed: boolean
  version: string | null
  path: string | null
  expectedVersion: string
}

export interface ServerStatus {
  running: boolean
  modelId: string | null
  port: number | null
  baseUrl: string | null
}

export interface DownloadProgress {
  modelId: string
  status: "downloading" | "complete" | "error"
  downloadedMB: number
  totalMB: number
  percent: number
  error?: string
}

export interface BinaryInstallProgress {
  status: string
  percent: number
  error?: string
}

// ─── Store ───────────────────────────────────────────────────

interface LocalAIStore {
  // State
  hardware: HardwareInfo | null
  binary: BinaryStatus | null
  catalog: LocalModelDef[]
  installed: InstalledModel[]
  server: ServerStatus
  downloads: Record<string, DownloadProgress>
  binaryProgress: BinaryInstallProgress | null
  loading: boolean
  binaryInstalling: boolean
  serverStarting: string | null  // modelId being started, prevents double-click
  serverError: string | null     // last server error

  // Actions
  fetchHardware: () => Promise<void>
  fetchBinary: () => Promise<void>
  fetchModels: () => Promise<void>
  fetchServerStatus: () => Promise<void>
  fetchAll: () => Promise<void>
  installBinary: () => Promise<void>
  downloadModel: (modelId: string) => Promise<void>
  cancelDownload: (modelId: string) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  startServer: (modelId: string, opts?: { contextSize?: number; gpuLayers?: number }) => Promise<void>
  stopServer: () => Promise<void>
  clearServerError: () => void
}

export const useLocalAIStore = create<LocalAIStore>()((set, get) => ({
  hardware: null,
  binary: null,
  catalog: [],
  installed: [],
  server: { running: false, modelId: null, port: null, baseUrl: null },
  downloads: {},
  binaryProgress: null,
  loading: false,
  binaryInstalling: false,
  serverStarting: null,
  serverError: null,

  fetchHardware: async () => {
    try {
      const res = await fetch("/api/local/hardware")
      const data = await res.json()
      set({ hardware: data })
    } catch {}
  },

  fetchBinary: async () => {
    try {
      const res = await fetch("/api/local/binary")
      const data = await res.json()
      set({ binary: data })
    } catch {}
  },

  fetchModels: async () => {
    try {
      const res = await fetch("/api/local/models")
      const data = await res.json()
      set({ catalog: data.catalog, installed: data.installed })
    } catch {}
  },

  fetchServerStatus: async () => {
    try {
      const res = await fetch("/api/local/server/status")
      const data = await res.json()
      set({ server: data })
    } catch {}
  },

  fetchAll: async () => {
    set({ loading: true })
    await Promise.all([
      get().fetchHardware(),
      get().fetchBinary(),
      get().fetchModels(),
      get().fetchServerStatus(),
    ])
    set({ loading: false })
  },

  installBinary: async () => {
    set({ binaryInstalling: true, binaryProgress: { status: "starting", percent: 0 } })
    try {
      const res = await fetch("/api/local/binary/install", { method: "POST" })
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split("\n\n")
        buffer = events.pop() || ""
        for (const event of events) {
          const dataLine = event.split("\n").find((l) => l.startsWith("data:") || l.startsWith("data: "))
          if (dataLine) {
            try {
              const progress = JSON.parse(dataLine.replace(/^data:\s*/, "")) as BinaryInstallProgress
              set({ binaryProgress: progress })
              if (progress.status === "error") {
                console.error("[Local AI] Binary install error:", progress.error)
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error("[Local AI] Binary install failed:", err)
      set({ binaryProgress: { status: "error", percent: 0, error: (err as Error).message } })
    } finally {
      set({ binaryInstalling: false })
      await get().fetchBinary()
      // Clear progress after a delay
      setTimeout(() => set({ binaryProgress: null }), 3000)
    }
  },

  downloadModel: async (modelId) => {
    set((s) => ({
      downloads: {
        ...s.downloads,
        [modelId]: { modelId, status: "downloading", downloadedMB: 0, totalMB: 0, percent: 0 },
      },
    }))

    try {
      const res = await fetch("/api/local/models/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      })

      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE format: "event: progress\ndata: {...}\n\n"
        // Split on double newlines to get complete events
        const events = buffer.split("\n\n")
        buffer = events.pop() || "" // keep incomplete event in buffer
        for (const event of events) {
          const dataLine = event.split("\n").find((l) => l.startsWith("data:") || l.startsWith("data: "))
          if (dataLine) {
            try {
              const json = dataLine.replace(/^data:\s*/, "")
              const progress = JSON.parse(json) as DownloadProgress
              set((s) => ({
                downloads: { ...s.downloads, [modelId]: progress },
              }))
            } catch {}
          }
        }
      }
    } finally {
      // Refresh model list
      await get().fetchModels()
      // Clean up download state after a short delay
      setTimeout(() => {
        set((s) => {
          const { [modelId]: _, ...rest } = s.downloads
          return { downloads: rest }
        })
      }, 2000)
    }
  },

  cancelDownload: async (modelId) => {
    await fetch("/api/local/models/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    })
    set((s) => {
      const { [modelId]: _, ...rest } = s.downloads
      return { downloads: rest }
    })
  },

  deleteModel: async (modelId) => {
    await fetch(`/api/local/models/${modelId}`, { method: "DELETE" })
    await get().fetchModels()
  },

  startServer: async (modelId, opts) => {
    // Prevent double-click
    if (get().serverStarting) return
    set({ serverStarting: modelId, serverError: null })

    try {
      const res = await fetch("/api/local/server/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, ...opts }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to start server")
      }
      await get().fetchServerStatus()
    } catch (err) {
      set({ serverError: (err as Error).message })
      throw err
    } finally {
      set({ serverStarting: null })
    }
  },

  stopServer: async () => {
    await fetch("/api/local/server/stop", { method: "POST" })
    set({ serverError: null })
    await get().fetchServerStatus()
  },

  clearServerError: () => set({ serverError: null }),
}))
