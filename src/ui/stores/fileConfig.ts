import { create } from "zustand"
import { persist } from "zustand/middleware"

// ── Types ───────────────────────────────────────────────────────

export interface PinnedPath {
  container: string
  path: string
  type: "file" | "dir"
}

const DEFAULT_VISIBLE_ROOTS = ["/workspace"]

// ── Store ───────────────────────────────────────────────────────

interface FileConfigState {
  // Pinned paths (persisted, cross-session)
  pinnedPaths: PinnedPath[]
  pinPath: (container: string, path: string, type: "file" | "dir") => void
  unpinPath: (container: string, path: string) => void
  isPinned: (container: string, path: string) => boolean

  // Dotfile visibility toggle (persisted)
  showHidden: boolean
  toggleShowHidden: () => void

  // Visible roots per container (persisted)
  visibleRootsByContainer: Record<string, string[]>
  getVisibleRoots: (container: string) => string[]
  setVisibleRoots: (container: string, roots: string[]) => void
  addVisibleRoot: (container: string, root: string) => void
  removeVisibleRoot: (container: string, root: string) => void

  // Host directories per project (persisted)
  hostDirectoriesByProject: Record<string, string[]>
  _currentProjectId: string | null
  getHostDirectories: () => string[]
  addHostDirectory: (path: string) => void
  removeHostDirectory: (path: string) => void

  // Project scoping
  switchProject: (projectId: string) => void
}

export const useFileConfigStore = create<FileConfigState>()(
  persist(
    (set, get) => ({
      // ── Pinned paths ────────────────────────────────────────────
      pinnedPaths: [],
      pinPath: (container, path, type) =>
        set((s) => {
          if (s.pinnedPaths.some((p) => p.container === container && p.path === path)) return s
          return { pinnedPaths: [...s.pinnedPaths, { container, path, type }] }
        }),
      unpinPath: (container, path) =>
        set((s) => ({
          pinnedPaths: s.pinnedPaths.filter((p) => !(p.container === container && p.path === path)),
        })),
      isPinned: (container, path) =>
        get().pinnedPaths.some((p) => p.container === container && p.path === path),

      // ── Dotfile visibility ──────────────────────────────────────
      showHidden: false,
      toggleShowHidden: () => set((s) => ({ showHidden: !s.showHidden })),

      // ── Visible roots per container ─────────────────────────────
      visibleRootsByContainer: {},
      getVisibleRoots: (container) =>
        get().visibleRootsByContainer[container] ?? DEFAULT_VISIBLE_ROOTS,
      setVisibleRoots: (container, roots) =>
        set((s) => ({
          visibleRootsByContainer: { ...s.visibleRootsByContainer, [container]: roots },
        })),
      addVisibleRoot: (container, root) =>
        set((s) => {
          const current = s.visibleRootsByContainer[container] ?? DEFAULT_VISIBLE_ROOTS
          if (current.includes(root)) return s
          return { visibleRootsByContainer: { ...s.visibleRootsByContainer, [container]: [...current, root] } }
        }),
      removeVisibleRoot: (container, root) =>
        set((s) => {
          const current = s.visibleRootsByContainer[container] ?? DEFAULT_VISIBLE_ROOTS
          const next = current.filter((r) => r !== root)
          if (next.length === 0) return s // keep at least one
          return { visibleRootsByContainer: { ...s.visibleRootsByContainer, [container]: next } }
        }),

      // ── Host directories (per project) ──────────────────────────
      hostDirectoriesByProject: {},
      _currentProjectId: null,
      getHostDirectories: () => {
        const pid = get()._currentProjectId || ""
        return get().hostDirectoriesByProject[pid] ?? []
      },
      addHostDirectory: (path) =>
        set((s) => {
          const pid = s._currentProjectId || ""
          const current = s.hostDirectoriesByProject[pid] ?? []
          if (current.includes(path)) return s
          return { hostDirectoriesByProject: { ...s.hostDirectoriesByProject, [pid]: [...current, path] } }
        }),
      removeHostDirectory: (path) =>
        set((s) => {
          const pid = s._currentProjectId || ""
          const current = s.hostDirectoriesByProject[pid] ?? []
          return { hostDirectoriesByProject: { ...s.hostDirectoriesByProject, [pid]: current.filter((d) => d !== path) } }
        }),

      // ── Project scoping ─────────────────────────────────────────
      switchProject: (projectId) =>
        set({ _currentProjectId: projectId }),
    }),
    {
      name: "ultiIHE-files",
      partialize: (state) => ({
        pinnedPaths: state.pinnedPaths,
        showHidden: state.showHidden,
        visibleRootsByContainer: state.visibleRootsByContainer,
        hostDirectoriesByProject: state.hostDirectoriesByProject,
      }),
    },
  ),
)
