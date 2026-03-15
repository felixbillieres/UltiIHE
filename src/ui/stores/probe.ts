import { create } from "zustand"

// ─── Types ────────────────────────────────────────────────────

export interface ProbeMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

export interface Probe {
  id: string
  source: "terminal" | "file"
  sourceId: string
  sourceName: string
  selection: {
    text: string
    lineCount: number
    startLine?: number
    language?: string
    container?: string
    filePath?: string
  }
  messages: ProbeMessage[]
  createdAt: number
  /** Groups probes by page — e.g. terminal ID or file ID */
  pageKey: string
}

// ─── Store ────────────────────────────────────────────────────

interface ProbeStore {
  probes: Probe[]
  /** Currently open probe modal (null = closed) */
  activeProbeId: string | null
  /** Probe history panel open per pageKey (plain array for React compat) */
  openHistoryKeys: string[]

  createProbe: (probe: Omit<Probe, "id" | "messages" | "createdAt">) => Probe
  addMessage: (probeId: string, msg: Omit<ProbeMessage, "id" | "createdAt">) => void
  updateLastAssistant: (probeId: string, content: string) => void
  removeProbe: (probeId: string) => void
  clearProbes: (pageKey: string) => void
  clearAll: () => void
  setActiveProbe: (probeId: string | null) => void
  toggleHistory: (pageKey: string) => void
  closeHistory: (pageKey: string) => void
  getPageProbes: (pageKey: string) => Probe[]
}

export const useProbeStore = create<ProbeStore>()((set, get) => ({
  probes: [],
  activeProbeId: null,
  openHistoryKeys: [],

  createProbe: (data) => {
    const probe: Probe = {
      ...data,
      id: crypto.randomUUID(),
      messages: [],
      createdAt: Date.now(),
    }
    set((s) => ({
      probes: [...s.probes, probe],
      activeProbeId: probe.id,
    }))
    return probe
  },

  addMessage: (probeId, msg) => {
    const message: ProbeMessage = {
      ...msg,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    set((s) => ({
      probes: s.probes.map((p) =>
        p.id === probeId
          ? { ...p, messages: [...p.messages, message] }
          : p,
      ),
    }))
  },

  updateLastAssistant: (probeId, content) => {
    set((s) => ({
      probes: s.probes.map((p) => {
        if (p.id !== probeId) return p
        const msgs = [...p.messages]
        const lastIdx = msgs.length - 1
        if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
          msgs[lastIdx] = { ...msgs[lastIdx], content }
        }
        return { ...p, messages: msgs }
      }),
    }))
  },

  removeProbe: (probeId) => {
    set((s) => {
      const filtered = s.probes.filter((p) => p.id !== probeId)
      return {
        probes: filtered,
        activeProbeId: s.activeProbeId === probeId ? null : s.activeProbeId,
      }
    })
  },

  clearProbes: (pageKey) => {
    set((s) => {
      const filtered = s.probes.filter((p) => p.pageKey !== pageKey)
      const activePurged =
        s.activeProbeId &&
        !filtered.find((p) => p.id === s.activeProbeId)
      return {
        probes: filtered,
        activeProbeId: activePurged ? null : s.activeProbeId,
        openHistoryKeys: s.openHistoryKeys.filter((k) => k !== pageKey),
      }
    })
  },

  clearAll: () => set({ probes: [], activeProbeId: null, openHistoryKeys: [] }),

  setActiveProbe: (probeId) => set({ activeProbeId: probeId }),

  toggleHistory: (pageKey) => {
    set((s) => {
      const has = s.openHistoryKeys.includes(pageKey)
      return {
        openHistoryKeys: has
          ? s.openHistoryKeys.filter((k) => k !== pageKey)
          : [...s.openHistoryKeys, pageKey],
      }
    })
  },

  closeHistory: (pageKey) => {
    set((s) => ({
      openHistoryKeys: s.openHistoryKeys.filter((k) => k !== pageKey),
    }))
  },

  getPageProbes: (pageKey) =>
    get().probes.filter((p) => p.pageKey === pageKey),
}))
