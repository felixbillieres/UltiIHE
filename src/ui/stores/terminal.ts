import { create } from "zustand"

// ─── Data types ───────────────────────────────────────────────

export interface TerminalInstance {
  id: string
  name: string
  container: string
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

/** Recursive layout tree — either a leaf (single group) or a split */
export type LayoutNode =
  | { type: "leaf"; groupId: string }
  | {
      type: "split"
      direction: SplitDirection
      children: LayoutNode[]
      sizes: number[] // percentages, always sum to 100
    }

// ─── Store ────────────────────────────────────────────────────

interface TerminalStore {
  terminals: TerminalInstance[]
  groups: TerminalGroup[]
  layout: LayoutNode | null
  focusedGroupId: string | null

  // The "global" active terminal — used by chat panel for AI context
  activeTerminalId: string | null

  // Terminal CRUD
  addTerminal: (terminal: TerminalInstance, groupId?: string) => void
  removeTerminal: (id: string) => void
  renameTerminal: (id: string, name: string) => void
  setNotification: (id: string, has: boolean) => void

  // Group/layout actions
  focusGroup: (groupId: string) => void
  setActiveInGroup: (groupId: string, terminalId: string) => void
  splitTerminal: (terminalId: string, direction: SplitDirection) => void
  moveTerminalToGroup: (terminalId: string, targetGroupId: string) => void
  unsplitAll: () => void
  setGroupSizes: (parentPath: number[], sizes: number[]) => void
}

let groupCounter = 0
function newGroupId() {
  return `group-${++groupCounter}`
}

// ─── Layout tree helpers ──────────────────────────────────────

/** Find which group a terminal belongs to */
function findGroupForTerminal(
  groups: TerminalGroup[],
  terminalId: string,
): TerminalGroup | undefined {
  return groups.find((g) => g.terminalIds.includes(terminalId))
}

/** Remove a group from the layout tree and simplify */
function removeGroupFromLayout(
  node: LayoutNode | null,
  groupId: string,
): LayoutNode | null {
  if (!node) return null
  if (node.type === "leaf") {
    return node.groupId === groupId ? null : node
  }

  const newChildren: LayoutNode[] = []
  const newSizes: number[] = []

  for (let i = 0; i < node.children.length; i++) {
    const result = removeGroupFromLayout(node.children[i], groupId)
    if (result) {
      newChildren.push(result)
      newSizes.push(node.sizes[i])
    }
  }

  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]

  // Re-normalize sizes
  const total = newSizes.reduce((a, b) => a + b, 0)
  const normalizedSizes = newSizes.map((s) => (s / total) * 100)

  return { ...node, children: newChildren, sizes: normalizedSizes }
}

/** Replace a leaf groupId with a new node */
function replaceLeaf(
  node: LayoutNode,
  groupId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (node.type === "leaf") {
    return node.groupId === groupId ? replacement : node
  }
  return {
    ...node,
    children: node.children.map((c) => replaceLeaf(c, groupId, replacement)),
  }
}

/** Update sizes at a specific path in the layout tree */
function updateSizesAtPath(
  node: LayoutNode,
  path: number[],
  sizes: number[],
): LayoutNode {
  if (path.length === 0 && node.type === "split") {
    return { ...node, sizes }
  }
  if (node.type === "split" && path.length > 0) {
    const [head, ...rest] = path
    return {
      ...node,
      children: node.children.map((c, i) =>
        i === head ? updateSizesAtPath(c, rest, sizes) : c,
      ),
    }
  }
  return node
}

// ─── Store implementation ─────────────────────────────────────

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  terminals: [],
  groups: [],
  layout: null,
  focusedGroupId: null,
  activeTerminalId: null,

  addTerminal: (terminal, groupId) =>
    set((state) => {
      const targetGroupId = groupId || state.focusedGroupId
      const targetGroup = targetGroupId
        ? state.groups.find((g) => g.id === targetGroupId)
        : null

      if (targetGroup) {
        // Add to existing group
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

      // No group exists — create first group
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

  removeTerminal: (id) =>
    set((state) => {
      const remaining = state.terminals.filter((t) => t.id !== id)
      const group = findGroupForTerminal(state.groups, id)
      if (!group) return { terminals: remaining }

      const newTerminalIds = group.terminalIds.filter((tid) => tid !== id)
      let newActive = group.activeTerminalId
      if (newActive === id) {
        newActive = newTerminalIds.length > 0 ? newTerminalIds[newTerminalIds.length - 1] : null
      }

      // Group is now empty — remove it
      if (newTerminalIds.length === 0) {
        const newGroups = state.groups.filter((g) => g.id !== group.id)
        const newLayout = removeGroupFromLayout(state.layout, group.id)

        // Update focused group
        let newFocused = state.focusedGroupId
        if (newFocused === group.id) {
          newFocused = newGroups.length > 0 ? newGroups[0].id : null
        }

        // Update global active terminal
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

      // Update group with terminal removed
      const newGroups = state.groups.map((g) =>
        g.id === group.id
          ? { ...g, terminalIds: newTerminalIds, activeTerminalId: newActive }
          : g,
      )

      // If removed terminal was global active, update
      let globalActive = state.activeTerminalId
      if (globalActive === id) {
        globalActive = newActive
      }

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
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, activeTerminalId: terminalId } : g,
      ),
      activeTerminalId: terminalId,
      focusedGroupId: groupId,
    })),

  splitTerminal: (terminalId, direction) =>
    set((state) => {
      const sourceGroup = findGroupForTerminal(state.groups, terminalId)
      if (!sourceGroup || !state.layout) return state

      // Create new group with the terminal moved there
      const newGId = newGroupId()
      const newGroup: TerminalGroup = {
        id: newGId,
        terminalIds: [terminalId],
        activeTerminalId: terminalId,
      }

      // Remove terminal from source group
      const newSourceIds = sourceGroup.terminalIds.filter((t) => t !== terminalId)
      let newSourceActive = sourceGroup.activeTerminalId
      if (newSourceActive === terminalId) {
        newSourceActive = newSourceIds.length > 0 ? newSourceIds[0] : null
      }

      // If source group would be empty, replace it entirely
      if (newSourceIds.length === 0) {
        // Can't split the only terminal in the only group into... itself
        // Instead, just create an empty split with the terminal in the new group
        // Actually this is a no-op — you can't split away the last terminal
        return state
      }

      const updatedGroups = state.groups.map((g) =>
        g.id === sourceGroup.id
          ? { ...g, terminalIds: newSourceIds, activeTerminalId: newSourceActive }
          : g,
      )

      // Replace the source leaf with a split containing source + new
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

  moveTerminalToGroup: (terminalId, targetGroupId) =>
    set((state) => {
      const sourceGroup = findGroupForTerminal(state.groups, terminalId)
      if (!sourceGroup || sourceGroup.id === targetGroupId) return state

      const targetGroup = state.groups.find((g) => g.id === targetGroupId)
      if (!targetGroup) return state

      // Remove from source
      const newSourceIds = sourceGroup.terminalIds.filter((t) => t !== terminalId)
      let newSourceActive = sourceGroup.activeTerminalId
      if (newSourceActive === terminalId) {
        newSourceActive = newSourceIds.length > 0 ? newSourceIds[0] : null
      }

      let newGroups = state.groups.map((g) => {
        if (g.id === sourceGroup.id) {
          return { ...g, terminalIds: newSourceIds, activeTerminalId: newSourceActive }
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

      // If source group is now empty, remove it from layout
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

      // Merge all terminals into one group
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
}))
