import { create } from "zustand"

// ── Types (match backend ExegolInfo) ─────────────────────────

export interface ExegolContainer {
  name: string // Short exegol tag (e.g. "HTBLabs")
  dockerName: string // Full docker name (e.g. "exegol-HTBLabs")
  state: string // "Running" | "Stopped"
  image: string
  config: string
  vpn: string
  network: string
}

export interface ExegolImage {
  name: string
  size: string
  status: string // "Up to date" | "Update available" | "Not installed"
}

export interface ExegolContainerDetail {
  name: string
  fields: Record<string, string>
}

export interface CreateContainerRequest {
  name: string
  image: string
  workspace_path?: string
  network?: string
  ports?: string[]
  vpn_path?: string
  vpn_auth_path?: string
  volumes?: string[]
  desktop?: boolean
  enable_logging?: boolean
  log_method?: string
  env_vars?: string[]
  hostname?: string
  shell?: string
  privileged?: boolean
  capabilities?: string[]
  devices?: string[]
  comment?: string
  disable_x11?: boolean
  disable_my_resources?: boolean
  disable_exegol_resources?: boolean
  disable_shared_timezones?: boolean
}

// ── Store ────────────────────────────────────────────────────

interface ExegolStore {
  containers: ExegolContainer[]
  images: ExegolImage[]
  version: string
  loading: boolean
  error: string | null

  // Per-action loading: "containerName-action"
  actionLoading: string | null

  // Container detail
  containerDetail: ExegolContainerDetail | null
  detailLoading: boolean

  // Actions
  fetchInfo: () => Promise<void>
  fetchContainerDetail: (name: string) => Promise<void>
  clearDetail: () => void

  startContainer: (name: string) => Promise<boolean>
  stopContainer: (name: string) => Promise<boolean>
  restartContainer: (name: string) => Promise<boolean>
  removeContainer: (name: string, force?: boolean) => Promise<boolean>
  createContainer: (req: CreateContainerRequest) => Promise<boolean>
  uninstallImage: (name: string, force?: boolean) => Promise<boolean>
}

const enc = (n: string) => encodeURIComponent(n)

export const useExegolStore = create<ExegolStore>()((set, get) => ({
  containers: [],
  images: [],
  version: "",
  loading: false,
  error: null,
  actionLoading: null,
  containerDetail: null,
  detailLoading: false,

  fetchInfo: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch("/api/exegol/info")
      const data = await res.json()
      if (data.ok) {
        set({
          containers: data.data.containers,
          images: data.data.images,
          version: data.data.version,
          loading: false,
        })
      } else {
        set({ error: data.error, loading: false })
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  fetchContainerDetail: async (name) => {
    set({ detailLoading: true, containerDetail: null })
    try {
      const res = await fetch(`/api/exegol/containers/${enc(name)}`)
      const data = await res.json()
      set({
        containerDetail: data.ok ? data.data : null,
        detailLoading: false,
      })
    } catch {
      set({ detailLoading: false })
    }
  },

  clearDetail: () => set({ containerDetail: null }),

  startContainer: async (name) => {
    set({ actionLoading: `${name}-start` })
    try {
      const res = await fetch(`/api/exegol/containers/${enc(name)}/start`, {
        method: "POST",
      })
      const data = await res.json()
      if (!data.ok) set({ error: data.error })
      await get().fetchInfo()
      return data.ok
    } catch (e) {
      set({ error: (e as Error).message })
      return false
    } finally {
      set({ actionLoading: null })
    }
  },

  stopContainer: async (name) => {
    set({ actionLoading: `${name}-stop` })
    try {
      const res = await fetch(`/api/exegol/containers/${enc(name)}/stop`, {
        method: "POST",
      })
      const data = await res.json()
      if (!data.ok) set({ error: data.error })
      await get().fetchInfo()
      return data.ok
    } catch (e) {
      set({ error: (e as Error).message })
      return false
    } finally {
      set({ actionLoading: null })
    }
  },

  restartContainer: async (name) => {
    set({ actionLoading: `${name}-restart` })
    try {
      const res = await fetch(`/api/exegol/containers/${enc(name)}/restart`, {
        method: "POST",
      })
      const data = await res.json()
      if (!data.ok) set({ error: data.error })
      await get().fetchInfo()
      return data.ok
    } catch (e) {
      set({ error: (e as Error).message })
      return false
    } finally {
      set({ actionLoading: null })
    }
  },

  removeContainer: async (name, force = false) => {
    set({ actionLoading: `${name}-remove` })
    try {
      const res = await fetch(`/api/exegol/containers/${enc(name)}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = await res.json()
      if (!data.ok) set({ error: data.error })
      await get().fetchInfo()
      return data.ok
    } catch (e) {
      set({ error: (e as Error).message })
      return false
    } finally {
      set({ actionLoading: null })
    }
  },

  createContainer: async (req) => {
    set({ actionLoading: "create" })
    try {
      const res = await fetch("/api/exegol/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      })
      const data = await res.json()
      if (!data.ok) set({ error: data.error })
      await get().fetchInfo()
      return data.ok
    } catch (e) {
      set({ error: (e as Error).message })
      return false
    } finally {
      set({ actionLoading: null })
    }
  },

  uninstallImage: async (name, force = false) => {
    set({ actionLoading: `${name}-uninstall` })
    try {
      const res = await fetch(`/api/exegol/images/${enc(name)}/uninstall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = await res.json()
      if (!data.ok) set({ error: data.error })
      await get().fetchInfo()
      return data.ok
    } catch (e) {
      set({ error: (e as Error).message })
      return false
    } finally {
      set({ actionLoading: null })
    }
  },
}))
