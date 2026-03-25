import { create } from "zustand"

// ─── Types ───────────────────────────────────────────────────

export type TabType = "terminal" | "file" | "webtool"

export interface WorkspaceTab {
  id: string // "terminal:{terminalId}", "file:{container}:{path}", "tool:{toolId}"
  type: TabType
  title: string
  projectId: string
  container?: string
  // Type-specific references
  terminalId?: string
  fileId?: string // container:path (same as file store key)
  toolId?: string
  // State
  pinned: boolean
  preview: boolean // italic tab, replaced on next preview open
  hasNotification: boolean
}

// ─── Store ───────────────────────────────────────────────────

interface WorkspaceStore {
  tabs: WorkspaceTab[]
  /** Per-project active tab */
  activeTabIdByProject: Record<string, string | null>
  /** Currently active project for tab scoping */
  _currentProjectId: string | null
  filter: TabType | null

  // Tab CRUD
  addTab: (tab: Omit<WorkspaceTab, "pinned" | "preview" | "hasNotification">, opts?: { preview?: boolean }) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  renameTab: (id: string, title: string) => void
  setTabNotification: (id: string, has: boolean) => void
  togglePin: (id: string) => void

  // Reorder
  reorderTab: (fromIndex: number, toIndex: number) => void

  // Filter
  setFilter: (filter: TabType | null) => void
  getVisibleTabs: () => WorkspaceTab[]

  // Convenience creators
  openTerminalTab: (terminalId: string, name: string, container: string, projectId?: string) => void
  openFileTab: (fileId: string, filename: string, container: string, projectId?: string) => void
  openToolTab: (toolId: string, name: string, container?: string, projectId?: string) => void

  // Bulk
  closeTabsByType: (type: TabType) => void
  closeAllUnpinned: () => void

  /** Switch project context — filters visible tabs */
  switchProject: (projectId: string) => void
  /** Get tabs for a specific project */
  getProjectTabs: (projectId: string) => WorkspaceTab[]
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
  activeTabIdByProject: {},
  _currentProjectId: null,
  filter: null,

  addTab: (tab, opts) =>
    set((s) => {
      const isPreview = opts?.preview ?? false
      // Don't add duplicates — just activate (and promote from preview if double-clicked)
      const existing = s.tabs.find((t) => t.id === tab.id)
      if (existing) {
        return {
          // If opening a non-preview version of a preview tab, promote it
          tabs: !isPreview && existing.preview
            ? s.tabs.map((t) => (t.id === tab.id ? { ...t, preview: false } : t))
            : s.tabs,
          filter: s.filter && s.filter !== existing.type ? null : s.filter,
          activeTabIdByProject: {
            ...s.activeTabIdByProject,
            ...(tab.projectId ? { [tab.projectId]: tab.id } : s._currentProjectId ? { [s._currentProjectId]: tab.id } : {}),
          },
        }
      }
      const pid = tab.projectId || s._currentProjectId
      // If opening a preview tab, replace any existing preview tab in this project
      let tabs = s.tabs
      if (isPreview && pid) {
        tabs = tabs.filter((t) => !(t.projectId === pid && t.preview))
      }
      return {
        tabs: [...tabs, { ...tab, pinned: false, preview: isPreview, hasNotification: false }],
        filter: s.filter && s.filter !== tab.type ? null : s.filter,
        activeTabIdByProject: {
          ...s.activeTabIdByProject,
          ...(pid ? { [pid]: tab.id } : {}),
        },
      }
    }),

  removeTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (!tab || tab.pinned) return s
      const projectId = tab.projectId
      const projectTabs = s.tabs.filter((t) => t.projectId === projectId)
      const currentActive = s.activeTabIdByProject[projectId] ?? null
      return {
        tabs: s.tabs.filter((t) => t.id !== id),
        activeTabIdByProject: {
          ...s.activeTabIdByProject,
          [projectId]: nextActiveTab(projectTabs, id, currentActive),
        },
      }
    }),

  setActiveTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      const pid = tab?.projectId || s._currentProjectId
      return {
        activeTabIdByProject: {
          ...s.activeTabIdByProject,
          ...(pid ? { [pid]: id } : {}),
        },
      }
    }),

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

  reorderTab: (fromIndex, toIndex) =>
    set((s) => {
      if (fromIndex === toIndex) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    }),

  setFilter: (filter) => set({ filter }),

  getVisibleTabs: () => {
    const { tabs, filter, _currentProjectId } = get()
    let filtered = _currentProjectId
      ? tabs.filter((t) => t.projectId === _currentProjectId)
      : tabs
    if (filter) filtered = filtered.filter((t) => t.type === filter)
    return filtered
  },

  // ── Convenience creators ──────────────────────────────────

  openTerminalTab: (terminalId, name, container, projectId) => {
    const pid = projectId || get()._currentProjectId || ""
    const id = `terminal:${terminalId}`
    get().addTab({
      id,
      type: "terminal",
      title: name,
      projectId: pid,
      container,
      terminalId,
    })
  },

  openFileTab: (fileId, filename, container, projectId) => {
    const pid = projectId || get()._currentProjectId || ""
    const id = `file:${fileId}`
    get().addTab({
      id,
      type: "file",
      title: filename,
      projectId: pid,
      container,
      fileId,
    })
  },

  openToolTab: (toolId, name, container, projectId) => {
    const pid = projectId || get()._currentProjectId || ""
    const id = container ? `tool:${toolId}:${container}` : `tool:${toolId}`
    get().addTab({
      id,
      type: "webtool",
      title: container ? `${name} (${container.replace(/^exegol-/, "")})` : name,
      projectId: pid,
      container,
      toolId,
    })
  },

  // ── Bulk actions ──────────────────────────────────────────

  closeTabsByType: (type) =>
    set((s) => {
      const pid = s._currentProjectId
      const remaining = s.tabs.filter((t) => t.type !== type || t.pinned || (pid && t.projectId !== pid))
      const currentActive = pid ? s.activeTabIdByProject[pid] : null
      const activeGone = !remaining.find((t) => t.id === currentActive)
      const newActive = activeGone
        ? remaining.filter((t) => !pid || t.projectId === pid).pop()?.id ?? null
        : currentActive
      return {
        tabs: remaining,
        activeTabIdByProject: {
          ...s.activeTabIdByProject,
          ...(pid ? { [pid]: newActive } : {}),
        },
      }
    }),

  closeAllUnpinned: () =>
    set((s) => {
      const pid = s._currentProjectId
      const remaining = s.tabs.filter((t) => t.pinned || (pid && t.projectId !== pid))
      const projectRemaining = remaining.filter((t) => !pid || t.projectId === pid)
      return {
        tabs: remaining,
        activeTabIdByProject: {
          ...s.activeTabIdByProject,
          ...(pid ? { [pid]: projectRemaining[0]?.id ?? null } : {}),
        },
      }
    }),

  switchProject: (projectId) =>
    set((s) => ({
      _currentProjectId: projectId,
    })),

  getProjectTabs: (projectId) =>
    get().tabs.filter((t) => t.projectId === projectId),
}))
