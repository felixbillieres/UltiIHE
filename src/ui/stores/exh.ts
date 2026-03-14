/**
 * Exegol-history store — manages credentials and hosts from exh.
 */

import { create } from "zustand"

// ── Types ────────────────────────────────────────────────────

export interface ExhCredential {
  username: string
  password: string
  hash: string
  domain: string
}

export interface ExhHost {
  ip: string
  hostname: string
  role: string
}

export type ExhTab = "creds" | "hosts" | "env"

interface ExhStore {
  // State
  creds: ExhCredential[]
  hosts: ExhHost[]
  env: Record<string, string>
  activeTab: ExhTab
  activeContainer: string | null
  loading: boolean
  error: string | null
  available: boolean | null // null = not checked yet

  // Actions
  setActiveTab: (tab: ExhTab) => void
  setActiveContainer: (container: string) => void
  fetchCreds: (container: string) => Promise<void>
  fetchHosts: (container: string) => Promise<void>
  fetchEnv: (container: string) => Promise<void>
  fetchAll: (container: string) => Promise<void>
  checkAvailable: (container: string) => Promise<void>
  addCred: (container: string, cred: { username?: string; password?: string; hash?: string; domain?: string }) => Promise<boolean>
  addHost: (container: string, host: { ip?: string; hostname?: string; role?: string }) => Promise<boolean>
  deleteCred: (container: string, cred: ExhCredential) => Promise<boolean>
  deleteHost: (container: string, host: ExhHost) => Promise<boolean>
  sync: (container: string) => Promise<boolean>
  clear: () => void
}

// ── Store ────────────────────────────────────────────────────

export const useExhStore = create<ExhStore>()((set, get) => ({
  creds: [],
  hosts: [],
  env: {},
  activeTab: "creds",
  activeContainer: null,
  loading: false,
  error: null,
  available: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveContainer: (container) => {
    set({ activeContainer: container, creds: [], hosts: [], env: {}, available: null })
    get().checkAvailable(container)
  },

  checkAvailable: async (container) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/status`)
      const data = await res.json()
      set({ available: data.available })
    } catch {
      set({ available: false })
    }
  },

  fetchCreds: async (container) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/creds`)
      const data = await res.json()
      // Guard against stale response from a previous container
      if (get().activeContainer === container) set({ creds: data.creds || [] })
    } catch {
      if (get().activeContainer === container) set({ creds: [] })
    }
  },

  fetchHosts: async (container) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/hosts`)
      const data = await res.json()
      if (get().activeContainer === container) set({ hosts: data.hosts || [] })
    } catch {
      if (get().activeContainer === container) set({ hosts: [] })
    }
  },

  fetchEnv: async (container) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/env`)
      const data = await res.json()
      if (get().activeContainer === container) set({ env: data.env || {} })
    } catch {
      if (get().activeContainer === container) set({ env: {} })
    }
  },

  fetchAll: async (container) => {
    set({ loading: true, error: null })
    try {
      await Promise.all([
        get().fetchCreds(container),
        get().fetchHosts(container),
        get().fetchEnv(container),
      ])
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  addCred: async (container, cred) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/creds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cred),
      })
      if (!res.ok) return false
      await get().fetchCreds(container)
      return true
    } catch {
      return false
    }
  },

  addHost: async (container, host) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(host),
      })
      if (!res.ok) return false
      await get().fetchHosts(container)
      return true
    } catch {
      return false
    }
  },

  deleteCred: async (container, cred) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/creds`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cred.username }),
      })
      if (!res.ok) return false
      await get().fetchCreds(container)
      return true
    } catch {
      return false
    }
  },

  deleteHost: async (container, host) => {
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/hosts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: host.ip }),
      })
      if (!res.ok) return false
      await get().fetchHosts(container)
      return true
    } catch {
      return false
    }
  },

  sync: async (container) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/exh/${encodeURIComponent(container)}/sync`, { method: "POST" })
      if (!res.ok) return false
      await get().fetchAll(container)
      return true
    } catch {
      return false
    } finally {
      set({ loading: false })
    }
  },

  clear: () => set({ creds: [], hosts: [], env: {}, error: null, available: null }),
}))
