import { create } from "zustand"
import { persist } from "zustand/middleware"

// ── Language detection ──────────────────────────────────────────

const EXT_LANGUAGES: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
  php: "php", sh: "bash", bash: "bash", zsh: "bash",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  xml: "xml", html: "html", css: "css", scss: "scss",
  sql: "sql", md: "markdown", txt: "plaintext",
  conf: "ini", cfg: "ini", ini: "ini",
  dockerfile: "dockerfile", makefile: "makefile",
}

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower === "dockerfile") return "dockerfile"
  if (lower === "makefile") return "makefile"
  const ext = lower.split(".").pop() || ""
  return EXT_LANGUAGES[ext] || "plaintext"
}

// ── Types ───────────────────────────────────────────────────────

export interface FileEntry {
  name: string
  path: string
  type: "file" | "dir"
  size: number
  modified: number
}

export interface OpenFile {
  id: string // "container:path"
  projectId: string
  container: string
  path: string
  filename: string
  content: string
  originalContent: string
  isDirty: boolean
  language: string
  loading: boolean
  error?: string
}

// ── Pinned / Hidden / Visible Roots types ────────────────────────

export interface PinnedPath {
  container: string
  path: string
  type: "file" | "dir"
}

const DEFAULT_VISIBLE_ROOTS = ["/workspace"]
const ALL_ROOTS = ["/workspace", "/opt/tools", "/root", "/etc", "/tmp"]

// ── Store ───────────────────────────────────────────────────────

interface FileStore {
  // Editor state
  openFiles: OpenFile[]
  activeFileIdByProject: Record<string, string | null>
  _currentProjectId: string | null
  savingFiles: Set<string>

  // Directory cache: key = "container:path"
  dirCache: Record<string, FileEntry[]>
  loadingDirs: Set<string>

  // Pinned paths (persisted, cross-session)
  pinnedPaths: PinnedPath[]
  pinPath: (container: string, path: string, type: "file" | "dir") => void
  unpinPath: (container: string, path: string) => void
  isPinned: (container: string, path: string) => boolean

  // Dotfile visibility toggle (persisted)
  showHidden: boolean
  toggleShowHidden: () => void
  // Hide/unhide = rename with/without dot prefix on filesystem
  hidePath: (container: string, path: string) => Promise<string | null>
  unhidePath: (container: string, path: string) => Promise<string | null>

  // Visible roots per container (persisted)
  visibleRootsByContainer: Record<string, string[]>
  getVisibleRoots: (container: string) => string[]
  setVisibleRoots: (container: string, roots: string[]) => void
  addVisibleRoot: (container: string, root: string) => void
  removeVisibleRoot: (container: string, root: string) => void

  // Host directories per project (persisted)
  hostDirectoriesByProject: Record<string, string[]>
  getHostDirectories: () => string[]
  addHostDirectory: (path: string) => void
  removeHostDirectory: (path: string) => void

  // Host file operations
  fetchHostDirectory: (path: string) => Promise<FileEntry[]>
  openHostFile: (path: string, projectId?: string) => Promise<void>
  saveHostFile: (id: string) => Promise<void>
  createHostFile: (path: string) => Promise<boolean>
  createHostDir: (path: string) => Promise<boolean>
  deleteHostPath: (path: string) => Promise<boolean>
  renameHostPath: (oldPath: string, newPath: string) => Promise<boolean>
  invalidateHostDir: (path: string) => void

  // Editor actions
  openFile: (container: string, path: string, projectId?: string) => Promise<void>
  closeFile: (id: string) => void
  setActiveFile: (id: string | null) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>

  // Project scoping
  switchProject: (projectId: string) => void
  getProjectFiles: (projectId: string) => OpenFile[]

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
}

function cacheKey(container: string, path: string) {
  return `${container}:${path}`
}

function parentDir(path: string): string {
  const idx = path.lastIndexOf("/")
  return idx <= 0 ? "/" : path.substring(0, idx)
}

export const useFileStore = create<FileStore>()(
  persist(
  (set, get) => ({
  openFiles: [],
  activeFileIdByProject: {},
  _currentProjectId: null,
  savingFiles: new Set(),
  dirCache: {},
  loadingDirs: new Set(),

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

  // Hide = rename to .name, unhide = rename to name (without dot)
  // After rename, re-fetch parent so the tree updates immediately.
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

  // ── Directory loading ───────────────────────────────────────

  fetchDirectory: async (container, path) => {
    const key = cacheKey(container, path)

    // Return cache if fresh
    const cached = get().dirCache[key]
    if (cached) return cached

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

  // ── Editor actions ──────────────────────────────────────────

  openFile: async (container, path, projectId) => {
    const id = `${container}:${path}`
    const pid = projectId || get()._currentProjectId || ""
    const existing = get().openFiles.find((f) => f.id === id)
    if (existing) {
      set((s) => ({
        activeFileIdByProject: { ...s.activeFileIdByProject, [pid]: id },
      }))
      return
    }

    const filename = path.split("/").pop() || path
    const language = detectLanguage(filename)
    const ext = filename.split(".").pop()?.toLowerCase() || ""
    const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"])
    const isImage = IMAGE_EXTS.has(ext)

    set((s) => ({
      openFiles: [
        ...s.openFiles,
        { id, projectId: pid, container, path, filename, content: "", originalContent: "", isDirty: false, language, loading: true },
      ],
      activeFileIdByProject: { ...s.activeFileIdByProject, [pid]: id },
    }))

    try {
      if (isImage) {
        // Fetch as base64 for image preview
        const res = await fetch(`/api/files/${container}/read?path=${encodeURIComponent(path)}&base64=true`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        const dataUrl = `data:${data.mime};base64,${data.base64}`
        set((s) => ({
          openFiles: s.openFiles.map((f) =>
            f.id === id ? { ...f, content: dataUrl, originalContent: dataUrl, language: "image", loading: false } : f,
          ),
        }))
      } else {
        const res = await fetch(`/api/files/${container}/read?path=${encodeURIComponent(path)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        set((s) => ({
          openFiles: s.openFiles.map((f) =>
            f.id === id ? { ...f, content: data.content, originalContent: data.content, loading: false } : f,
          ),
        }))
      }
    } catch (err) {
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id ? { ...f, loading: false, error: (err as Error).message } : f,
        ),
      }))
    }
  },

  closeFile: (id) => {
    set((s) => {
      const file = s.openFiles.find((f) => f.id === id)
      const pid = file?.projectId || s._currentProjectId || ""
      const projectFiles = s.openFiles.filter((f) => f.projectId === pid)
      const idx = projectFiles.findIndex((f) => f.id === id)
      const newFiles = s.openFiles.filter((f) => f.id !== id)
      const currentActive = s.activeFileIdByProject[pid] ?? null
      let newActive = currentActive
      if (currentActive === id) {
        const remaining = projectFiles.filter((f) => f.id !== id)
        newActive = remaining.length === 0
          ? null
          : remaining[Math.min(idx, remaining.length - 1)].id
      }
      return {
        openFiles: newFiles,
        activeFileIdByProject: { ...s.activeFileIdByProject, [pid]: newActive },
      }
    })
  },

  setActiveFile: (id) =>
    set((s) => {
      const file = s.openFiles.find((f) => f.id === id)
      const pid = file?.projectId || s._currentProjectId || ""
      return {
        activeFileIdByProject: { ...s.activeFileIdByProject, [pid]: id },
      }
    }),

  updateContent: (id, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.id === id ? { ...f, content, isDirty: content !== f.originalContent } : f,
      ),
    }))
  },

  saveFile: async (id) => {
    const file = get().openFiles.find((f) => f.id === id)
    if (!file || !file.isDirty || get().savingFiles.has(id)) return

    // Host files use a different endpoint
    if (file.container === "__host__") {
      return get().saveHostFile(id)
    }

    set((s) => ({ savingFiles: new Set(s.savingFiles).add(id) }))
    try {
      const res = await fetch(`/api/files/${file.container}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, content: file.content }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id ? { ...f, originalContent: f.content, isDirty: false } : f,
        ),
      }))
    } finally {
      set((s) => {
        const next = new Set(s.savingFiles)
        next.delete(id)
        return { savingFiles: next }
      })
    }
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
      const openFile = get().openFiles.find((f) => f.id === id)
      if (openFile) get().closeFile(id)
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

  // ── Host directories (per project) ──────────────────────────────
  hostDirectoriesByProject: {},
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

  openHostFile: async (path, projectId) => {
    const id = `host:${path}`
    const pid = projectId || get()._currentProjectId || ""
    const existing = get().openFiles.find((f) => f.id === id)
    if (existing) {
      set((s) => ({ activeFileIdByProject: { ...s.activeFileIdByProject, [pid]: id } }))
      return
    }

    const filename = path.split("/").pop() || path
    const language = detectLanguage(filename)

    set((s) => ({
      openFiles: [
        ...s.openFiles,
        { id, projectId: pid, container: "__host__", path, filename, content: "", originalContent: "", isDirty: false, language, loading: true },
      ],
      activeFileIdByProject: { ...s.activeFileIdByProject, [pid]: id },
    }))

    try {
      const res = await fetch(`/api/files/host/read?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id ? { ...f, content: data.content, originalContent: data.content, loading: false } : f,
        ),
      }))
    } catch (err) {
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id ? { ...f, loading: false, error: (err as Error).message } : f,
        ),
      }))
    }
  },

  saveHostFile: async (id) => {
    const file = get().openFiles.find((f) => f.id === id)
    if (!file || !file.isDirty || file.container !== "__host__" || get().savingFiles.has(id)) return
    set((s) => ({ savingFiles: new Set(s.savingFiles).add(id) }))
    try {
      const res = await fetch("/api/files/host/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, content: file.content }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id ? { ...f, originalContent: f.content, isDirty: false } : f,
        ),
      }))
    } finally {
      set((s) => {
        const next = new Set(s.savingFiles)
        next.delete(id)
        return { savingFiles: next }
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
      // Invalidate parent
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
      if (get().openFiles.find((f) => f.id === id)) get().closeFile(id)
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

  switchProject: (projectId) =>
    set({ _currentProjectId: projectId }),

  getProjectFiles: (projectId) =>
    get().openFiles.filter((f) => f.projectId === projectId),
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
))
