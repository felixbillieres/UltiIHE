import { create } from "zustand"

export interface PendingCommand {
  id: string
  terminalId: string
  terminalName: string
  command: string
  /** Container name for context in approval banner */
  containerName?: string
}

export type ApprovalMode = "ask" | "auto-run" | "allow-all-session"

interface CommandApprovalStore {
  pending: PendingCommand[]
  mode: ApprovalMode

  addPending: (cmd: PendingCommand) => void
  removePending: (id: string) => void
  setMode: (mode: ApprovalMode) => void
  clearAll: () => void
}

export const useCommandApprovalStore = create<CommandApprovalStore>()((set) => ({
  pending: [],
  mode: "ask",

  addPending: (cmd) =>
    set((s) => ({ pending: [...s.pending, cmd] })),

  removePending: (id) =>
    set((s) => ({ pending: s.pending.filter((c) => c.id !== id) })),

  setMode: (mode) => set({ mode }),

  clearAll: () => set({ pending: [] }),
}))
