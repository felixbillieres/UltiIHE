import { create } from "zustand"

export interface Operation {
  id: string
  command: string
  terminalId: string
  terminalName: string
  status: "running" | "done" | "error" | "cancelled"
  startTime: number
  endTime?: number
}

interface OpsStore {
  operations: Operation[]
  expanded: boolean

  setExpanded: (v: boolean) => void
  upsertOp: (op: Operation) => void
  clearAll: (ops?: Operation[]) => void
  clearCompleted: () => void
}

export const useOpsStore = create<OpsStore>()((set) => ({
  operations: [],
  expanded: false,

  setExpanded: (v) => set({ expanded: v }),

  upsertOp: (op) =>
    set((s) => {
      const idx = s.operations.findIndex((o) => o.id === op.id)
      if (idx >= 0) {
        const updated = [...s.operations]
        updated[idx] = op
        return { operations: updated }
      }
      return { operations: [...s.operations, op] }
    }),

  clearAll: (ops) =>
    set({ operations: ops || [] }),

  clearCompleted: () =>
    set((s) => ({
      operations: s.operations.filter((o) => o.status === "running"),
    })),
}))
