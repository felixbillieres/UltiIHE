import { create } from "zustand"
import {
  newGroupId,
  removeGroupFromLayout,
  replaceLeaf,
  updateSizesAtPath,
  type LayoutNode,
} from "../utils/layoutHelpers"

// ─── Persistence keys ─────────────────────────────────────────
const FOLLOW_KEY = "exegol-ihe-follow-assistant"
const AI_TERM_MODE_KEY = "exegol-ihe-ai-terminal-mode"

export type AITerminalMode = "tabs" | "split"

// ─── Data types ───────────────────────────────────────────────

export interface TerminalInstance {
  id: string
  name: string
  container: string
  projectId: string
  createdAt: number
  hasNotification: boolean
}

/** A group is a pane that holds tabs — like a VSCode editor group */
export interface TerminalGroup {
  id: string
  terminalIds: string[]
  activeTerminalId: string | null
}

export type SplitDirection = "horizontal" | "vertical"

// LayoutNode re-exported from shared helpers
export type { LayoutNode } from "../utils/layoutHelpers"

// ─── Store ────────────────────────────────────────────────────

/** Snapshot of layout state for a project */
interface ProjectTerminalState {
  groups: TerminalGroup[]
  layout: LayoutNode | null
  focusedGroupId: string | null
  activeTerminalId: string | null
}

interface TerminalStore {
  terminals: TerminalInstance[]
  groups: TerminalGroup[]
  layout: LayoutNode | null
  focusedGroupId: string | null
  activeTerminalId: string | null
  /** Per-project layout snapshots (saved on switch, restored on return) */
  _projectState: Record<string, ProjectTerminalState>
  /** Currently active project for layout scoping */
  _currentProjectId: string | null

  /** Follow assistant mode — auto-focus terminal when AI writes to it */
  followAssistant: boolean
  toggleFollowAssistant: () => void

  /** How AI-created terminals appear: as tabs or as splits */
  aiTerminalMode: AITerminalMode
  setAITerminalMode: (mode: AITerminalMode) => void

  // Terminal CRUD
  addTerminal: (terminal: TerminalInstance, groupId?: string) => void
  /** Add a terminal in split grid mode (2x2 max, then tabs in smallest group) */
  addTerminalInSplit: (terminal: TerminalInstance) => void
  removeTerminal: (id: string) => void
  renameTerminal: (id: string, name: string) => void
  setNotification: (id: string, has: boolean) => void

  /** Focus the terminal the AI is writing to (if follow mode is on) */
  focusTerminalById: (terminalId: string) => void

  // Group/layout actions
  focusGroup: (groupId: string) => void
  setActiveInGroup: (groupId: string, terminalId: string) => void
  splitTerminal: (terminalId: string, direction: SplitDirection) => void
  moveTerminalToGroup: (terminalId: string, targetGroupId: string) => void
  reorderTerminal: (groupId: string, fromIndex: number, toIndex: number) => void
  unsplitAll: () => void
  setGroupSizes: (parentPath: number[], sizes: number[]) => void

  // Project scoping — returns terminals for a given project
  getProjectTerminals: (projectId: string) => TerminalInstance[]
  getProjectGroups: (projectId: string) => TerminalGroup[]

  /** Switch project: save current layout, restore target project's layout */
  switchProject: (projectId: string) => void
}

function findGroupForTerminal(
  groups: TerminalGroup[],
  terminalId: string,
): TerminalGroup | undefined {
  return groups.find((g) => g.terminalIds.includes(terminalId))
}

// ─── Store implementation ─────────────────────────────────────

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  terminals: [],
  groups: [],
  layout: null,
  focusedGroupId: null,
  activeTerminalId: null,
  _projectState: {},
  _currentProjectId: null,

  followAssistant: (() => {
    try { return localStorage.getItem(FOLLOW_KEY) !== "false" } catch { return true }
  })(),
  toggleFollowAssistant: () =>
    set((state) => {
      const next = !state.followAssistant
      try { localStorage.setItem(FOLLOW_KEY, String(next)) } catch { /* ignore */ }
      return { followAssistant: next }
    }),

  aiTerminalMode: (() => {
    try { return (localStorage.getItem(AI_TERM_MODE_KEY) as AITerminalMode) || "tabs" } catch { return "tabs" as AITerminalMode }
  })(),
  setAITerminalMode: (mode) => {
    try { localStorage.setItem(AI_TERM_MODE_KEY, mode) } catch { /* ignore */ }
    set({ aiTerminalMode: mode })
  },

  addTerminal: (terminal, groupId) =>
    set((state) => {
      const targetGroupId = groupId || state.focusedGroupId
      const targetGroup = targetGroupId
        ? state.groups.find((g) => g.id === targetGroupId)
        : null

      if (targetGroup) {
        return {
          terminals: [...state.terminals, terminal],
          groups: state.groups.map((g) =>
            g.id === targetGroup.id
              ? {
                  ...g,
                  terminalIds: [...g.terminalIds, terminal.id],
                  activeTerminalId: terminal.id,
                }
              : g,
          ),
          activeTerminalId: terminal.id,
          focusedGroupId: targetGroup.id,
        }
      }

      const gId = newGroupId()
      const group: TerminalGroup = {
        id: gId,
        terminalIds: [terminal.id],
        activeTerminalId: terminal.id,
      }

      return {
        terminals: [...state.terminals, terminal],
        groups: [...state.groups, group],
        layout: state.layout
          ? state.layout
          : { type: "leaf" as const, groupId: gId },
        focusedGroupId: gId,
        activeTerminalId: terminal.id,
      }
    }),

  addTerminalInSplit: (terminal) =>
    set((state) => {
      const panelCount = state.groups.length

      // 4+ panels already → add as tab in the group with fewest terminals
      if (panelCount >= 4) {
        const smallest = [...state.groups].sort(
          (a, b) => a.terminalIds.length - b.terminalIds.length,
        )[0]
        return {
          terminals: [...state.terminals, terminal],
          groups: state.groups.map((g) =>
            g.id === smallest.id
              ? {
                  ...g,
                  terminalIds: [...g.terminalIds, terminal.id],
                  activeTerminalId: terminal.id,
                }
              : g,
          ),
          activeTerminalId: terminal.id,
          focusedGroupId: smallest.id,
        }
      }

      // Create a new group for the new terminal
      const gId = newGroupId()
      const newGroup: TerminalGroup = {
        id: gId,
        terminalIds: [terminal.id],
        activeTerminalId: terminal.id,
      }
      const newTerminals = [...state.terminals, terminal]
      const newGroups = [...state.groups, newGroup]
      const leaf: LayoutNode = { type: "leaf" as const, groupId: gId }

      let newLayout: LayoutNode

      if (panelCount === 0 || !state.layout) {
        // 0 panels → single leaf
        newLayout = leaf
      } else if (panelCount === 1) {
        // 1 panel → split horizontal: [existing, new] side by side
        newLayout = {
          type: "split",
          direction: "horizontal",
          children: [state.layout, leaf],
          sizes: [50, 50],
        }
      } else if (panelCount === 2) {
        // 2 panels (horizontal split) → split left child vertically
        // Before: H[left, right]
        // After:  H[V[left, new], right]
        if (state.layout.type === "split") {
          newLayout = {
            ...state.layout,
            children: [
              {
                type: "split",
                direction: "vertical",
                children: [state.layout.children[0], leaf],
                sizes: [50, 50],
              },
              state.layout.children[1],
            ],
          }
        } else {
          newLayout = { type: "split", direction: "horizontal", children: [state.layout, leaf], sizes: [50, 50] }
        }
      } else {
        // 3 panels → split right child vertically to get 2x2 grid
        // Before: H[V[TL, BL], right]
        // After:  H[V[TL, BL], V[right, new]]
        if (state.layout.type === "split") {
          newLayout = {
            ...state.layout,
            children: [
              state.layout.children[0],
              {
                type: "split",
                direction: "vertical",
                children: [state.layout.children[1], leaf],
                sizes: [50, 50],
              },
            ],
          }
        } else {
          newLayout = { type: "split", direction: "horizontal", children: [state.layout, leaf], sizes: [50, 50] }
        }
      }

      return {
        terminals: newTerminals,
        groups: newGroups,
        layout: newLayout,
        focusedGroupId: gId,
        activeTerminalId: terminal.id,
      }
    }),

  focusTerminalById: (terminalId) => {
    const state = get()
    const group = findGroupForTerminal(state.groups, terminalId)
    if (!group) return
    // Switch tab + group focus to this terminal
    set({
      groups: state.groups.map((g) =>
        g.id === group.id ? { ...g, activeTerminalId: terminalId } : g,
      ),
      focusedGroupId: group.id,
      activeTerminalId: terminalId,
    })
  },

  removeTerminal: (id) =>
    set((state) => {
      const remaining = state.terminals.filter((t) => t.id !== id)
      const group = findGroupForTerminal(state.groups, id)
      if (!group) return { terminals: remaining }

      const newTerminalIds = group.terminalIds.filter((tid) => tid !== id)
      let newActive = group.activeTerminalId
      if (newActive === id) {
        newActive =
          newTerminalIds.length > 0
            ? newTerminalIds[newTerminalIds.length - 1]
            : null
      }

      if (newTerminalIds.length === 0) {
        const newGroups = state.groups.filter((g) => g.id !== group.id)
        const newLayout = removeGroupFromLayout(state.layout, group.id)
        let newFocused = state.focusedGroupId
        if (newFocused === group.id) {
          newFocused = newGroups.length > 0 ? newGroups[0].id : null
        }
        const focusedGroup = newGroups.find((g) => g.id === newFocused)
        const globalActive = focusedGroup?.activeTerminalId || null
        return {
          terminals: remaining,
          groups: newGroups,
          layout: newLayout,
          focusedGroupId: newFocused,
          activeTerminalId: globalActive,
        }
      }

      const newGroups = state.groups.map((g) =>
        g.id === group.id
          ? { ...g, terminalIds: newTerminalIds, activeTerminalId: newActive }
          : g,
      )

      let globalActive = state.activeTerminalId
      if (globalActive === id) globalActive = newActive

      return {
        terminals: remaining,
        groups: newGroups,
        activeTerminalId: globalActive,
      }
    }),

  renameTerminal: (id, name) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, name } : t,
      ),
    })),

  setNotification: (id, has) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, hasNotification: has } : t,
      ),
    })),

  focusGroup: (groupId) =>
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId)
      return {
        focusedGroupId: groupId,
        activeTerminalId: group?.activeTerminalId || state.activeTerminalId,
      }
    }),

  setActiveInGroup: (groupId, terminalId) =>
    set(() => ({
      groups: get().groups.map((g) =>
        g.id === groupId ? { ...g, activeTerminalId: terminalId } : g,
      ),
      activeTerminalId: terminalId,
      focusedGroupId: groupId,
    })),

  splitTerminal: (terminalId, direction) =>
    set((state) => {
      const sourceGroup = findGroupForTerminal(state.groups, terminalId)
      if (!sourceGroup || !state.layout) return state

      const newGId = newGroupId()
      const newGroup: TerminalGroup = {
        id: newGId,
        terminalIds: [terminalId],
        activeTerminalId: terminalId,
      }

      const newSourceIds = sourceGroup.terminalIds.filter(
        (t) => t !== terminalId,
      )
      if (newSourceIds.length === 0) return state

      let newSourceActive = sourceGroup.activeTerminalId
      if (newSourceActive === terminalId) {
        newSourceActive = newSourceIds[0] || null
      }

      const updatedGroups = state.groups.map((g) =>
        g.id === sourceGroup.id
          ? {
              ...g,
              terminalIds: newSourceIds,
              activeTerminalId: newSourceActive,
            }
          : g,
      )

      const splitNode: LayoutNode = {
        type: "split",
        direction,
        children: [
          { type: "leaf", groupId: sourceGroup.id },
          { type: "leaf", groupId: newGId },
        ],
        sizes: [50, 50],
      }

      const newLayout = replaceLeaf(state.layout, sourceGroup.id, splitNode)

      return {
        groups: [...updatedGroups, newGroup],
        layout: newLayout,
        focusedGroupId: newGId,
        activeTerminalId: terminalId,
      }
    }),

  reorderTerminal: (groupId, fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex === toIndex) return state
      return {
        groups: state.groups.map((g) => {
          if (g.id !== groupId) return g
          const ids = [...g.terminalIds]
          const [moved] = ids.splice(fromIndex, 1)
          ids.splice(toIndex, 0, moved)
          return { ...g, terminalIds: ids }
        }),
      }
    }),

  moveTerminalToGroup: (terminalId, targetGroupId) =>
    set((state) => {
      const sourceGroup = findGroupForTerminal(state.groups, terminalId)
      if (!sourceGroup || sourceGroup.id === targetGroupId) return state
      const targetGroup = state.groups.find((g) => g.id === targetGroupId)
      if (!targetGroup) return state

      const newSourceIds = sourceGroup.terminalIds.filter(
        (t) => t !== terminalId,
      )
      let newSourceActive = sourceGroup.activeTerminalId
      if (newSourceActive === terminalId) {
        newSourceActive = newSourceIds.length > 0 ? newSourceIds[0] : null
      }

      let newGroups = state.groups.map((g) => {
        if (g.id === sourceGroup.id) {
          return {
            ...g,
            terminalIds: newSourceIds,
            activeTerminalId: newSourceActive,
          }
        }
        if (g.id === targetGroupId) {
          return {
            ...g,
            terminalIds: [...g.terminalIds, terminalId],
            activeTerminalId: terminalId,
          }
        }
        return g
      })

      let newLayout = state.layout
      if (newSourceIds.length === 0) {
        newGroups = newGroups.filter((g) => g.id !== sourceGroup.id)
        newLayout = removeGroupFromLayout(newLayout, sourceGroup.id)
      }

      return {
        groups: newGroups,
        layout: newLayout,
        focusedGroupId: targetGroupId,
        activeTerminalId: terminalId,
      }
    }),

  unsplitAll: () =>
    set((state) => {
      if (state.groups.length <= 1) return state
      const allTerminalIds = state.groups.flatMap((g) => g.terminalIds)
      const activeId =
        state.activeTerminalId ||
        (allTerminalIds.length > 0 ? allTerminalIds[0] : null)
      const gId = state.groups[0].id
      const merged: TerminalGroup = {
        id: gId,
        terminalIds: allTerminalIds,
        activeTerminalId: activeId,
      }
      return {
        groups: [merged],
        layout: { type: "leaf" as const, groupId: gId },
        focusedGroupId: gId,
        activeTerminalId: activeId,
      }
    }),

  setGroupSizes: (parentPath, sizes) =>
    set((state) => ({
      layout: state.layout
        ? updateSizesAtPath(state.layout, parentPath, sizes)
        : state.layout,
    })),

  getProjectTerminals: (projectId) =>
    get().terminals.filter((t) => t.projectId === projectId),

  getProjectGroups: (projectId) => {
    const projectTerminalIds = new Set(
      get()
        .terminals.filter((t) => t.projectId === projectId)
        .map((t) => t.id),
    )
    return get()
      .groups.filter((g) =>
        g.terminalIds.some((tid) => projectTerminalIds.has(tid)),
      )
  },

  switchProject: (projectId) =>
    set((state) => {
      // Already on this project
      if (state._currentProjectId === projectId) return state

      // Save current project's layout state
      const saved = { ...state._projectState }
      if (state._currentProjectId) {
        saved[state._currentProjectId] = {
          groups: state.groups,
          layout: state.layout,
          focusedGroupId: state.focusedGroupId,
          activeTerminalId: state.activeTerminalId,
        }
      }

      // Restore target project's state if it exists
      const restored = saved[projectId]
      if (restored) {
        return {
          _projectState: saved,
          _currentProjectId: projectId,
          groups: restored.groups,
          layout: restored.layout,
          focusedGroupId: restored.focusedGroupId,
          activeTerminalId: restored.activeTerminalId,
        }
      }

      // No saved state — build from project's terminals
      const projectTerminals = state.terminals.filter((t) => t.projectId === projectId)
      if (projectTerminals.length === 0) {
        return {
          _projectState: saved,
          _currentProjectId: projectId,
          groups: [],
          layout: null,
          focusedGroupId: null,
          activeTerminalId: null,
        }
      }

      // Create a single group for all project terminals
      const gId = newGroupId()
      const group: TerminalGroup = {
        id: gId,
        terminalIds: projectTerminals.map((t) => t.id),
        activeTerminalId: projectTerminals[0].id,
      }
      return {
        _projectState: saved,
        _currentProjectId: projectId,
        groups: [group],
        layout: { type: "leaf" as const, groupId: gId },
        focusedGroupId: gId,
        activeTerminalId: projectTerminals[0].id,
      }
    }),
}))
