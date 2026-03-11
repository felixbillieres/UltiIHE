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

interface ToolApprovalStore {
  pending: PendingToolCall[]

  addPending: (call: PendingToolCall) => void
  removePending: (id: string) => void
  clearAll: () => void
}

export const useToolApprovalStore = create<ToolApprovalStore>()((set) => ({
  pending: [],

  addPending: (call) =>
    set((s) => ({ pending: [...s.pending, call] })),

  removePending: (id) =>
    set((s) => ({ pending: s.pending.filter((c) => c.id !== id) })),

  clearAll: () => set({ pending: [] }),
}))
