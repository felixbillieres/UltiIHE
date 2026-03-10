import { create } from "zustand"

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

// ── Store ───────────────────────────────────────────────────────

interface FileStore {
  // Editor state
  openFiles: OpenFile[]
  activeFileId: string | null
  savingFiles: Set<string>

  // Directory cache: key = "container:path"
  dirCache: Record<string, FileEntry[]>
  loadingDirs: Set<string>

  // Editor actions
  openFile: (container: string, path: string) => Promise<void>
  closeFile: (id: string) => void
  setActiveFile: (id: string | null) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>

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

export const useFileStore = create<FileStore>((set, get) => ({
  openFiles: [],
  activeFileId: null,
  savingFiles: new Set(),
  dirCache: {},
  loadingDirs: new Set(),

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

      set((s) => ({
        dirCache: { ...s.dirCache, [key]: entries },
      }))

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

  openFile: async (container, path) => {
    const id = `${container}:${path}`
    const existing = get().openFiles.find((f) => f.id === id)
    if (existing) {
      set({ activeFileId: id })
      return
    }

    const filename = path.split("/").pop() || path
    const language = detectLanguage(filename)

    set((s) => ({
      openFiles: [
        ...s.openFiles,
        { id, container, path, filename, content: "", originalContent: "", isDirty: false, language, loading: true },
      ],
      activeFileId: id,
    }))

    try {
      const res = await fetch(`/api/files/${container}/read?path=${encodeURIComponent(path)}`)
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

  closeFile: (id) => {
    set((s) => {
      const idx = s.openFiles.findIndex((f) => f.id === id)
      const newFiles = s.openFiles.filter((f) => f.id !== id)
      let newActive = s.activeFileId
      if (s.activeFileId === id) {
        newActive = newFiles.length === 0
          ? null
          : newFiles[Math.min(idx, newFiles.length - 1)].id
      }
      return { openFiles: newFiles, activeFileId: newActive }
    })
  },

  setActiveFile: (id) => set({ activeFileId: id }),

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
}))
