import { create } from "zustand"
import { useFileEditorStore } from "./fileEditor"

// ── Types ───────────────────────────────────────────────────────

export interface FileEntry {
  name: string
  path: string
  type: "file" | "dir"
  size: number
  modified: number
}

// ── Helpers ─────────────────────────────────────────────────────

function cacheKey(container: string, path: string) {
  return `${container}:${path}`
}

function parentDir(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx <= 0 ? "/" : path.substring(0, idx)
}

// ── Store ───────────────────────────────────────────────────────

interface FilesystemCacheState {
  // Directory cache: key = "container:path"
  dirCache: Record<string, FileEntry[]>
  loadingDirs: Set<string>
  _currentProjectId: string | null

  // Directory actions
  fetchDirectory: (container: string, path: string) => Promise<FileEntry[]>
  invalidateDir: (container: string, path: string) => void

  // CRUD mutations
  createFile: (container: string, path: string) => Promise<boolean>
  createDir: (container: string, path: string) => Promise<boolean>
  deletePath: (container: string, path: string) => Promise<boolean>
  renamePath: (container: string, oldPath: string, newPath: string) => Promise<boolean>
  transfer: (
    srcContainer: string,
    srcPath: string,
    dstContainer: string,
    dstPath: string,
    operation: "copy" | "move",
  ) => Promise<boolean>

  // Host directory operations
  fetchHostDirectory: (path: string) => Promise<FileEntry[]>
  createHostFile: (path: string) => Promise<boolean>
  createHostDir: (path: string) => Promise<boolean>
  deleteHostPath: (path: string) => Promise<boolean>
  renameHostPath: (oldPath: string, newPath: string) => Promise<boolean>
  invalidateHostDir: (path: string) => void

  // Hide/unhide (rename with/without dot prefix)
  hidePath: (container: string, path: string) => Promise<string | null>
  unhidePath: (container: string, path: string) => Promise<string | null>

  // Project scoping
  switchProject: (projectId: string) => void
}

export const useFilesystemStore = create<FilesystemCacheState>()(
  (set, get) => ({
    dirCache: {},
    loadingDirs: new Set(),
    _currentProjectId: null,

    // ── Directory loading ───────────────────────────────────────

    fetchDirectory: async (container, path) => {
      const key = cacheKey(container, path)

      // Return cache if fresh
      const cached = get().dirCache[key]
      if (cached) {
        // Start auto-refresh on first cache hit (lazy init)
        startAutoRefresh()
        return cached
      }

      set((s) => ({ loadingDirs: new Set(s.loadingDirs).add(key) }))

      try {
        const res = await fetch(
          `/api/files/${container}/list?path=${encodeURIComponent(path)}`,
        )
        const data = await res.json()
        const entries: FileEntry[] = data.entries || []

        set((s) => {
          const newCache = { ...s.dirCache, [key]: entries }
          // LRU eviction: if cache exceeds 100 entries, drop 20 oldest
          const keys = Object.keys(newCache)
          if (keys.length > 100) {
            for (const k of keys.slice(0, 20)) {
              delete newCache[k]
            }
          }
          return { dirCache: newCache }
        })

        // Start auto-refresh on first directory fetch
        startAutoRefresh()

        return entries
      } catch {
        return []
      } finally {
        set((s) => {
          const next = new Set(s.loadingDirs)
          next.delete(key)
          return { loadingDirs: next }
        })
      }
    },

    invalidateDir: (container, path) => {
      const key = cacheKey(container, path)
      set((s) => {
        const next = { ...s.dirCache }
        delete next[key]
        return { dirCache: next }
      })
    },

    // ── CRUD mutations ──────────────────────────────────────────

    createFile: async (container, path) => {
      try {
        const res = await fetch(`/api/files/${container}/create-file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        })
        if (!res.ok) return false

        get().invalidateDir(container, parentDir(path))
        return true
      } catch {
        return false
      }
    },

    createDir: async (container, path) => {
      try {
        const res = await fetch(`/api/files/${container}/create-dir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        })
        if (!res.ok) return false

        get().invalidateDir(container, parentDir(path))
        return true
      } catch {
        return false
      }
    },

    deletePath: async (container, path) => {
      try {
        const res = await fetch(`/api/files/${container}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        })
        if (!res.ok) return false

        get().invalidateDir(container, parentDir(path))
        // Close if open in editor
        const id = `${container}:${path}`
        const editorStore = useFileEditorStore.getState()
        const openFile = editorStore.openFiles.find((f) => f.id === id)
        if (openFile) editorStore.closeFile(id)
        return true
      } catch {
        return false
      }
    },

    renamePath: async (container, oldPath, newPath) => {
      try {
        const res = await fetch(`/api/files/${container}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPath, newPath }),
        })
        if (!res.ok) return false

        get().invalidateDir(container, parentDir(oldPath))
        if (parentDir(oldPath) !== parentDir(newPath)) {
          get().invalidateDir(container, parentDir(newPath))
        }
        return true
      } catch {
        return false
      }
    },

    transfer: async (srcContainer, srcPath, dstContainer, dstPath, operation) => {
      try {
        const res = await fetch("/api/files/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ srcContainer, srcPath, dstContainer, dstPath, operation }),
        })
        if (!res.ok) return false

        get().invalidateDir(dstContainer, parentDir(dstPath))
        if (operation === "move") {
          get().invalidateDir(srcContainer, parentDir(srcPath))
        }
        return true
      } catch {
        return false
      }
    },

    // ── Host directory operations ───────────────────────────────

    fetchHostDirectory: async (path) => {
      const key = `host:${path}`
      const cached = get().dirCache[key]
      if (cached) return cached

      set((s) => ({ loadingDirs: new Set(s.loadingDirs).add(key) }))
      try {
        const res = await fetch(`/api/files/host/list?path=${encodeURIComponent(path)}`)
        const data = await res.json()
        const entries: FileEntry[] = data.entries || []
        set((s) => {
          const newCache = { ...s.dirCache, [key]: entries }
          const keys = Object.keys(newCache)
          if (keys.length > 100) {
            for (const k of keys.slice(0, 20)) {
              delete newCache[k]
            }
          }
          return { dirCache: newCache }
        })
        return entries
      } catch {
        return []
      } finally {
        set((s) => {
          const next = new Set(s.loadingDirs)
          next.delete(key)
          return { loadingDirs: next }
        })
      }
    },

    createHostFile: async (path) => {
      try {
        const res = await fetch("/api/files/host/create-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        })
        if (!res.ok) return false
        const parent = path.substring(0, path.lastIndexOf("/")) || "/"
        const key = `host:${parent}`
        set((s) => { const next = { ...s.dirCache }; delete next[key]; return { dirCache: next } })
        return true
      } catch { return false }
    },

    createHostDir: async (path) => {
      try {
        const res = await fetch("/api/files/host/create-dir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        })
        if (!res.ok) return false
        const parent = path.substring(0, path.lastIndexOf("/")) || "/"
        const key = `host:${parent}`
        set((s) => { const next = { ...s.dirCache }; delete next[key]; return { dirCache: next } })
        return true
      } catch { return false }
    },

    deleteHostPath: async (path) => {
      try {
        const res = await fetch("/api/files/host/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        })
        if (!res.ok) return false
        const parent = path.substring(0, path.lastIndexOf("/")) || "/"
        const key = `host:${parent}`
        set((s) => { const next = { ...s.dirCache }; delete next[key]; return { dirCache: next } })
        // Close if open
        const id = `host:${path}`
        const editorStore = useFileEditorStore.getState()
        if (editorStore.openFiles.find((f) => f.id === id)) editorStore.closeFile(id)
        return true
      } catch { return false }
    },

    renameHostPath: async (oldPath, newPath) => {
      try {
        const res = await fetch("/api/files/host/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPath, newPath }),
        })
        if (!res.ok) return false
        const oldParent = oldPath.substring(0, oldPath.lastIndexOf("/")) || "/"
        const newParent = newPath.substring(0, newPath.lastIndexOf("/")) || "/"
        set((s) => {
          const next = { ...s.dirCache }
          delete next[`host:${oldParent}`]
          if (oldParent !== newParent) delete next[`host:${newParent}`]
          return { dirCache: next }
        })
        return true
      } catch { return false }
    },

    invalidateHostDir: (path) => {
      const key = `host:${path}`
      set((s) => { const next = { ...s.dirCache }; delete next[key]; return { dirCache: next } })
    },

    // ── Hide/unhide ─────────────────────────────────────────────

    hidePath: async (container, path) => {
      const name = path.split("/").pop() || ""
      if (name.startsWith(".")) return null // already hidden
      const parent = path.substring(0, path.lastIndexOf("/")) || "/"
      const newPath = `${parent}/.${name}`
      let ok: boolean
      if (container === "__host__") {
        ok = await get().renameHostPath(path, newPath)
        if (ok) await get().fetchHostDirectory(parent)
      } else {
        ok = await get().renamePath(container, path, newPath)
        if (ok) await get().fetchDirectory(container, parent)
      }
      return ok ? newPath : null
    },

    unhidePath: async (container, path) => {
      const name = path.split("/").pop() || ""
      if (!name.startsWith(".")) return null // not hidden
      const parent = path.substring(0, path.lastIndexOf("/")) || "/"
      const newPath = `${parent}/${name.slice(1)}`
      let ok: boolean
      if (container === "__host__") {
        ok = await get().renameHostPath(path, newPath)
        if (ok) await get().fetchHostDirectory(parent)
      } else {
        ok = await get().renamePath(container, path, newPath)
        if (ok) await get().fetchDirectory(container, parent)
      }
      return ok ? newPath : null
    },

    // ── Project scoping ─────────────────────────────────────────

    switchProject: (projectId) =>
      set({ _currentProjectId: projectId }),
  }),
)

// ── Auto-refresh: re-fetch all cached directories every 5s ──────
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

function cacheKeyParts(key: string): { container: string; path: string } | null {
  const colonIdx = key.indexOf(":")
  if (colonIdx === -1) return null
  const container = key.substring(0, colonIdx)
  const path = key.substring(colonIdx + 1)
  if (!container || !path) return null
  return { container, path }
}

async function refreshCachedDir(container: string, path: string) {
  const key = cacheKey(container, path)
  try {
    const res = await fetch(
      `/api/files/${container}/list?path=${encodeURIComponent(path)}`,
    )
    const data = await res.json()
    const entries: FileEntry[] = data.entries || []
    useFilesystemStore.setState((s) => ({
      dirCache: { ...s.dirCache, [key]: entries },
    }))
  } catch {
    // Silently ignore -- dir may have been removed
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) return
  autoRefreshTimer = setInterval(() => {
    const cache = useFilesystemStore.getState().dirCache
    for (const key of Object.keys(cache)) {
      const parts = cacheKeyParts(key)
      if (!parts) continue
      const { container, path } = parts
      if (container === "host") {
        // Host dirs: re-fetch directly to avoid the cache guard
        fetch(`/api/files/host/list?path=${encodeURIComponent(path)}`)
          .then((r) => r.json())
          .then((data) => {
            const entries: FileEntry[] = data.entries || []
            useFilesystemStore.setState((s) => ({
              dirCache: { ...s.dirCache, [key]: entries },
            }))
          })
          .catch(() => {})
      } else {
        refreshCachedDir(container, path)
      }
    }
  }, 5_000)
}
