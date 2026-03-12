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

  addTab: (tab) =>
    set((s) => {
      // Don't add duplicates — just activate
      const existing = s.tabs.find((t) => t.id === tab.id)
      if (existing) {
        return {
          activeTabIdByProject: {
            ...s.activeTabIdByProject,
            ...(tab.projectId ? { [tab.projectId]: tab.id } : s._currentProjectId ? { [s._currentProjectId]: tab.id } : {}),
          },
        }
      }
      const pid = tab.projectId || s._currentProjectId
      return {
        tabs: [...s.tabs, { ...tab, pinned: false, hasNotification: false }],
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
