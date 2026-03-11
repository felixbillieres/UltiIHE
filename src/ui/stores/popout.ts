import { create } from "zustand"

// ─── Types ────────────────────────────────────────────────────

export type PopOutType = "terminal" | "file" | "tool" | "chat"

export interface PopOutEntry {
  tabId: string
  type: PopOutType
  /** Reference to the opened window (null if closed externally) */
  windowRef: Window | null
  /** Original tab title for the pop-out header */
  title: string
  /** Additional data needed to render the content */
  terminalId?: string
  fileId?: string
  toolId?: string
  container?: string
}

// ─── Store ────────────────────────────────────────────────────

interface PopOutStore {
  popOuts: PopOutEntry[]

  popOut: (entry: PopOutEntry) => void
  reattach: (tabId: string) => void
  isPopedOut: (tabId: string) => boolean
  getPopOut: (tabId: string) => PopOutEntry | undefined
  updateWindowRef: (tabId: string, win: Window | null) => void
  /** Clean up entries whose windows have been closed */
  pruneClosedWindows: () => void
}

export const usePopOutStore = create<PopOutStore>()((set, get) => ({
  popOuts: [],

  popOut: (entry) =>
    set((s) => {
      // Don't duplicate
      if (s.popOuts.find((p) => p.tabId === entry.tabId)) return s
      return { popOuts: [...s.popOuts, entry] }
    }),

  reattach: (tabId) =>
    set((s) => {
      const entry = s.popOuts.find((p) => p.tabId === tabId)
      if (entry?.windowRef && !entry.windowRef.closed) {
        entry.windowRef.close()
      }
      return { popOuts: s.popOuts.filter((p) => p.tabId !== tabId) }
    }),

  isPopedOut: (tabId) => get().popOuts.some((p) => p.tabId === tabId),

  getPopOut: (tabId) => get().popOuts.find((p) => p.tabId === tabId),

  updateWindowRef: (tabId, win) =>
    set((s) => ({
      popOuts: s.popOuts.map((p) =>
        p.tabId === tabId ? { ...p, windowRef: win } : p,
      ),
    })),

  pruneClosedWindows: () =>
    set((s) => ({
      popOuts: s.popOuts.filter(
        (p) => p.windowRef && !p.windowRef.closed,
      ),
    })),
}))
