import { create } from "zustand"

// ─── Types ───────────────────────────────────────────────────

export type TabType = "terminal" | "file" | "webtool"

export interface WorkspaceTab {
  id: string // "terminal:{terminalId}", "file:{container}:{path}", "tool:{toolId}"
  type: TabType
  title: string
  container?: string
  // Type-specific references
  terminalId?: string
  fileId?: string // container:path (same as file store key)
  toolId?: string
  // State
  pinned: boolean
  hasNotification: boolean
}

// ─── Store ───────────────────────────────────────────────────

interface WorkspaceStore {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  filter: TabType | null

  // Tab CRUD
  addTab: (tab: Omit<WorkspaceTab, "pinned" | "hasNotification">) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  renameTab: (id: string, title: string) => void
  setTabNotification: (id: string, has: boolean) => void
  togglePin: (id: string) => void

  // Filter
  setFilter: (filter: TabType | null) => void
  getVisibleTabs: () => WorkspaceTab[]

  // Convenience creators
  openTerminalTab: (terminalId: string, name: string, container: string) => void
  openFileTab: (fileId: string, filename: string, container: string) => void
  openToolTab: (toolId: string, name: string, container?: string) => void

  // Bulk
  closeTabsByType: (type: TabType) => void
  closeAllUnpinned: () => void
}

function nextActiveTab(
  tabs: WorkspaceTab[],
  removedId: string,
  currentActive: string | null,
): string | null {
  if (currentActive !== removedId) return currentActive
  const remaining = tabs.filter((t) => t.id !== removedId)
  if (remaining.length === 0) return null
  // Find the tab that was next to the removed one
  const idx = tabs.findIndex((t) => t.id === removedId)
  const nextIdx = Math.min(idx, remaining.length - 1)
  return remaining[nextIdx].id
}

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  filter: null,

  addTab: (tab) =>
    set((s) => {
      // Don't add duplicates — just activate
      const existing = s.tabs.find((t) => t.id === tab.id)
      if (existing) return { activeTabId: tab.id }
      return {
        tabs: [...s.tabs, { ...tab, pinned: false, hasNotification: false }],
        activeTabId: tab.id,
      }
    }),

  removeTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (!tab || tab.pinned) return s
      return {
        tabs: s.tabs.filter((t) => t.id !== id),
        activeTabId: nextActiveTab(s.tabs, id, s.activeTabId),
      }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  renameTab: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  setTabNotification: (id, has) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, hasNotification: has } : t,
      ),
    })),

  togglePin: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, pinned: !t.pinned } : t,
      ),
    })),

  setFilter: (filter) => set({ filter }),

  getVisibleTabs: () => {
    const { tabs, filter } = get()
    if (!filter) return tabs
    return tabs.filter((t) => t.type === filter)
  },

  // ── Convenience creators ──────────────────────────────────

  openTerminalTab: (terminalId, name, container) => {
    const id = `terminal:${terminalId}`
    get().addTab({
      id,
      type: "terminal",
      title: name,
      container,
      terminalId,
    })
  },

  openFileTab: (fileId, filename, container) => {
    const id = `file:${fileId}`
    get().addTab({
      id,
      type: "file",
      title: filename,
      container,
      fileId,
    })
  },

  openToolTab: (toolId, name, container) => {
    const id = `tool:${toolId}`
    get().addTab({
      id,
      type: "webtool",
      title: name,
      container,
      toolId,
    })
  },

  // ── Bulk actions ──────────────────────────────────────────

  closeTabsByType: (type) =>
    set((s) => {
      const remaining = s.tabs.filter((t) => t.type !== type || t.pinned)
      const activeGone = !remaining.find((t) => t.id === s.activeTabId)
      return {
        tabs: remaining,
        activeTabId: activeGone
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : s.activeTabId,
      }
    }),

  closeAllUnpinned: () =>
    set((s) => {
      const remaining = s.tabs.filter((t) => t.pinned)
      return {
        tabs: remaining,
        activeTabId: remaining.length > 0 ? remaining[0].id : null,
      }
    }),
}))
