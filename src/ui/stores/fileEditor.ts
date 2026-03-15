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

// ── Store ───────────────────────────────────────────────────────

interface FileEditorState {
  openFiles: OpenFile[]
  activeFileIdByProject: Record<string, string | null>
  _currentProjectId: string | null
  savingFiles: Set<string>

  // Editor actions
  openFile: (container: string, path: string, projectId?: string) => Promise<void>
  openHostFile: (path: string, projectId?: string) => Promise<void>
  closeFile: (id: string) => void
  setActiveFile: (id: string | null) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>
  saveHostFile: (id: string) => Promise<void>

  // Project scoping
  switchProject: (projectId: string) => void
  getProjectFiles: (projectId: string) => OpenFile[]
}

export const useFileEditorStore = create<FileEditorState>()(
  (set, get) => ({
    openFiles: [],
    activeFileIdByProject: {},
    _currentProjectId: null,
    savingFiles: new Set(),

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

    // ── Project scoping ─────────────────────────────────────────

    switchProject: (projectId) =>
      set({ _currentProjectId: projectId }),

    getProjectFiles: (projectId) =>
      get().openFiles.filter((f) => f.projectId === projectId),
  }),
)
