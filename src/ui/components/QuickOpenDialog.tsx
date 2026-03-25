import { useState, useEffect, useRef, useCallback } from "react"
import { FileText, Search } from "lucide-react"
import { useProjectStore } from "../stores/project"
import { useWorkspaceStore } from "../stores/workspace"
import { useFileStore } from "../stores/files"

const API = import.meta.env.PROD ? "" : "http://localhost:3001"

interface QuickOpenResult {
  path: string
  name: string
  container: string
}

interface QuickOpenDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function QuickOpenDialog({ isOpen, onClose }: QuickOpenDialogProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<QuickOpenResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : null
  })

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [isOpen])

  // Search as user types (debounced)
  useEffect(() => {
    if (!query || query.length < 2 || !activeProject?.containerIds?.length) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)

      try {
        const allResults: QuickOpenResult[] = []
        for (const container of activeProject.containerIds) {
          const res = await fetch(
            `${API}/api/files/${container}/find?query=${encodeURIComponent(query)}`,
            { signal: controller.signal },
          )
          if (!res.ok) continue
          const data = await res.json()
          for (const f of data.files || []) {
            allResults.push({ path: f.path, name: f.name, container })
          }
        }
        if (!controller.signal.aborted) {
          setResults(allResults.slice(0, 50))
          setSelectedIndex(0)
        }
      } catch {
        // Aborted or network error — ignore
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query, activeProject])

  const openFile = useCallback(
    (result: QuickOpenResult) => {
      const fileId = `${result.container}:${result.path}`
      useFileStore.getState().openFile(result.container, result.path)
      useWorkspaceStore.getState().openFileTab(fileId, result.name, result.container)
      onClose()
    },
    [onClose],
  )

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && results[selectedIndex]) {
        openFile(results[selectedIndex])
      }
    },
    [results, selectedIndex, openFile, onClose],
  )

  // Close on backdrop click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("[data-quick-open]")) return
      onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div
        data-quick-open
        className="relative w-full max-w-lg mx-4 bg-surface-1 border border-border-base rounded-lg shadow-2xl overflow-hidden"
        style={{ maxHeight: "60vh" }}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-weak">
          <Search className="w-4 h-4 text-text-weaker shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="flex-1 bg-transparent text-sm text-text-strong font-sans outline-none placeholder:text-text-weaker"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          )}
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(60vh - 44px)" }}>
          {results.length === 0 && query.length >= 2 && !loading && (
            <div className="px-4 py-8 text-center text-text-weaker text-xs font-sans">
              No files found
            </div>
          )}
          {results.map((result, i) => (
            <button
              key={`${result.container}:${result.path}`}
              onClick={() => openFile(result)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                i === selectedIndex ? "bg-accent/10 text-text-strong" : "text-text-base hover:bg-surface-2"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-text-weaker shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-sans truncate">
                  <span className="text-text-strong">{result.name}</span>
                </div>
                <div className="text-[10px] text-text-weaker font-mono truncate">
                  {result.container}:{result.path}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
