import { create } from "zustand"

export interface TerminalInstance {
  id: string            // server-assigned terminal ID
  name: string
  container: string
  createdAt: number
  hasNotification: boolean
  groupId?: string
}

export type LayoutMode = "tabs" | "split-h" | "split-v" | "grid"

interface TerminalStore {
  terminals: TerminalInstance[]
  activeTerminalId: string | null
  layoutMode: LayoutMode

  addTerminal: (terminal: TerminalInstance) => void
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string) => void
  renameTerminal: (id: string, name: string) => void
  setNotification: (id: string, has: boolean) => void
  setLayoutMode: (mode: LayoutMode) => void
}

export const useTerminalStore = create<TerminalStore>()((set) => ({
  terminals: [],
  activeTerminalId: null,
  layoutMode: "tabs" as LayoutMode,

  addTerminal: (terminal) =>
    set((state) => ({
      terminals: [...state.terminals, terminal],
      activeTerminalId: terminal.id,
    })),

  removeTerminal: (id) =>
    set((state) => {
      const remaining = state.terminals.filter((t) => t.id !== id)
      let nextActive = state.activeTerminalId
      if (nextActive === id) {
        nextActive = remaining.length > 0 ? remaining[remaining.length - 1].id : null
      }
      return { terminals: remaining, activeTerminalId: nextActive }
    }),

  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  renameTerminal: (id, name) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, name } : t
      ),
    })),

  setNotification: (id, has) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, hasNotification: has } : t
      ),
    })),

  setLayoutMode: (mode) => set({ layoutMode: mode }),
}))
