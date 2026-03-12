import { create } from "zustand"

export interface PendingToolCall {
  id: string
  toolName: string
  description: string
  args: Record<string, unknown>
  /** Unified diff string for file operations */
  diff?: string
  /** container:path key for file operations */
  fileKey?: string
  /** Whether this creates a new file */
  isNewFile?: boolean
}

export interface ResolvedToolCall {
  id: string
  toolName: string
  args: Record<string, unknown>
  diff?: string
  fileKey?: string
  isNewFile?: boolean
  resolution: "approved" | "denied"
  resolvedAt: number
}

interface ToolApprovalStore {
  pending: PendingToolCall[]
  resolved: ResolvedToolCall[]

  addPending: (call: PendingToolCall) => void
  removePending: (id: string) => void
  resolveTool: (id: string, resolution: "approved" | "denied") => void
  clearAll: () => void
  clearResolved: () => void
}

export const useToolApprovalStore = create<ToolApprovalStore>()((set) => ({
  pending: [],
  resolved: [],

  addPending: (call) =>
    set((s) => ({ pending: [...s.pending, call] })),

  removePending: (id) =>
    set((s) => ({ pending: s.pending.filter((c) => c.id !== id) })),

  resolveTool: (id, resolution) =>
    set((s) => {
      const tool = s.pending.find((t) => t.id === id)
      if (!tool) return { pending: s.pending.filter((t) => t.id !== id) }
      return {
        pending: s.pending.filter((t) => t.id !== id),
        resolved: [...s.resolved, { ...tool, resolution, resolvedAt: Date.now() }],
      }
    }),

  clearAll: () => set({ pending: [] }),

  clearResolved: () => set({ resolved: [] }),
}))
