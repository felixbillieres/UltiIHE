import { create } from "zustand"

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

interface FileStore {
  openFiles: OpenFile[]
  activeFileId: string | null
  openFile: (container: string, path: string) => Promise<void>
  closeFile: (id: string) => void
  setActiveFile: (id: string | null) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>
  savingFiles: Set<string>
}

export const useFileStore = create<FileStore>((set, get) => ({
  openFiles: [],
  activeFileId: null,
  savingFiles: new Set(),

  openFile: async (container, path) => {
    const id = `${container}:${path}`
    const existing = get().openFiles.find((f) => f.id === id)
    if (existing) {
      set({ activeFileId: id })
      return
    }

    const filename = path.split("/").pop() || path
    const language = detectLanguage(filename)

    // Add placeholder while loading
    set((s) => ({
      openFiles: [
        ...s.openFiles,
        {
          id,
          container,
          path,
          filename,
          content: "",
          originalContent: "",
          isDirty: false,
          language,
          loading: true,
        },
      ],
      activeFileId: id,
    }))

    try {
      const res = await fetch(
        `/api/files/${container}/read?path=${encodeURIComponent(path)}`,
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id
            ? {
                ...f,
                content: data.content,
                originalContent: data.content,
                loading: false,
              }
            : f,
        ),
      }))
    } catch (err) {
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id
            ? {
                ...f,
                loading: false,
                error: (err as Error).message,
                content: `Error loading file: ${(err as Error).message}`,
              }
            : f,
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
        // Activate neighbor tab
        if (newFiles.length === 0) {
          newActive = null
        } else {
          newActive = newFiles[Math.min(idx, newFiles.length - 1)].id
        }
      }
      return { openFiles: newFiles, activeFileId: newActive }
    })
  },

  setActiveFile: (id) => set({ activeFileId: id }),

  updateContent: (id, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.id === id
          ? { ...f, content, isDirty: content !== f.originalContent }
          : f,
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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.id === id
            ? { ...f, originalContent: f.content, isDirty: false }
            : f,
        ),
      }))
    } catch (err) {
      console.error("Save failed:", err)
    } finally {
      set((s) => {
        const next = new Set(s.savingFiles)
        next.delete(id)
        return { savingFiles: next }
      })
    }
  },
}))
