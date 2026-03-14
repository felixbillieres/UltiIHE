import { useEffect, useRef, useCallback, useMemo } from "react"
import { Search, Terminal, FileText, Loader2, X } from "lucide-react"
import { useSearchStore, type SearchScope, type TerminalSearchResult, type FileSearchResult } from "../../stores/search"
import { useTerminalStore } from "../../stores/terminal"
import { useFileStore } from "../../stores/files"
import { useWorkspaceStore } from "../../stores/workspace"
import { useProjectStore } from "../../stores/project"

// ── Helpers ──────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const qLower = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let last = 0
  let idx = lower.indexOf(qLower)
  let key = 0
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx))
    parts.push(
      <mark key={key++} className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>,
    )
    last = idx + query.length
    idx = lower.indexOf(qLower, last)
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function truncateLine(line: string, column: number, maxLen = 120): string {
  if (line.length <= maxLen) return line
  const start = Math.max(0, column - 40)
  const end = Math.min(line.length, start + maxLen)
  let result = line.slice(start, end)
  if (start > 0) result = "..." + result
  if (end < line.length) result = result + "..."
  return result
}

// ── Flattened result item for keyboard navigation ────────────────

type FlatItem =
  | { type: "terminal"; result: TerminalSearchResult }
  | { type: "file"; result: FileSearchResult }

// ── Component ───────────────────────────────────────────────────

export function UnifiedSearchDialog() {
  const isOpen = useSearchStore((s) => s.isOpen)
  const query = useSearchStore((s) => s.query)
  const scopes = useSearchStore((s) => s.scopes)
  const terminalResults = useSearchStore((s) => s.terminalResults)
  const fileResults = useSearchStore((s) => s.fileResults)
  const loading = useSearchStore((s) => s.loading)
  const selectedIndex = useSearchStore((s) => s.selectedIndex)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const close = useSearchStore((s) => s.close)
  const setQuery = useSearchStore((s) => s.setQuery)
  const toggleScope = useSearchStore((s) => s.toggleScope)
  const search = useSearchStore((s) => s.search)
  const setSelectedIndex = useSearchStore((s) => s.setSelectedIndex)

  // Get containers from active project
  const activeProject = useProjectStore((s) => {
    const active = s.projects.find((p) => p.id === s.activeProjectId)
    return active
  })
  const containers = activeProject?.containerIds || []

  // Flatten results for keyboard nav
  const flatItems = useMemo((): FlatItem[] => {
    const items: FlatItem[] = []
    if (scopes.includes("terminals")) {
      for (const r of terminalResults) {
        items.push({ type: "terminal", result: r })
      }
    }
    if (scopes.includes("files")) {
      for (const r of fileResults) {
        items.push({ type: "file", result: r })
      }
    }
    return items
  }, [terminalResults, fileResults, scopes])

  // Debounced search
  const doSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        search(q, containers)
      }, 250)
    },
    [search, containers],
  )

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [isOpen])

  const openMiniPanel = useSearchStore((s) => s.openMiniPanel)
  const setPendingFileSearch = useSearchStore((s) => s.setPendingFileSearch)

  // Navigate to terminal result — close dialog, switch terminal, open mini panel
  const navigateToTerminal = useCallback(
    (terminalId: string, searchQuery: string, _terminalName: string, container: string) => {
      const store = useTerminalStore.getState()
      const group = store.groups.find((g) => g.terminalIds.includes(terminalId))
      if (group) {
        store.setActiveInGroup(group.id, terminalId)
        store.focusGroup(group.id)
      }
      useWorkspaceStore.getState().setActiveTab(`terminal:${terminalId}`)
      close()
      openMiniPanel({ type: "terminal", query: searchQuery, terminalId, container })
    },
    [close, openMiniPanel],
  )

  // Navigate to file result — close dialog, open file, trigger Monaco find on mount
  const navigateToFile = useCallback(
    (container: string, filePath: string) => {
      const filename = filePath.split("/").pop() || filePath
      const fileId = `${container}:${filePath}`
      // Set pending search BEFORE opening the file — FileEditorPane will pick it up on mount
      setPendingFileSearch(fileId, query)
      useFileStore.getState().openFile(container, filePath)
      useWorkspaceStore.getState().openFileTab(fileId, filename, container)
      close()
    },
    [close, setPendingFileSearch, query],
  )

  // Activate selected item
  const activateItem = useCallback(
    (item: FlatItem) => {
      if (item.type === "terminal") {
        navigateToTerminal(item.result.terminalId, query, item.result.terminalName, item.result.container)
      } else {
        navigateToFile(item.result.container, item.result.filePath)
      }
    },
    [query, navigateToTerminal, navigateToFile],
  )

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const next = Math.min(selectedIndex + 1, flatItems.length - 1)
        setSelectedIndex(next)
        // Scroll into view
        const el = resultsRef.current?.querySelector(`[data-index="${next}"]`)
        el?.scrollIntoView({ block: "nearest" })
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        const prev = Math.max(selectedIndex - 1, 0)
        setSelectedIndex(prev)
        const el = resultsRef.current?.querySelector(`[data-index="${prev}"]`)
        el?.scrollIntoView({ block: "nearest" })
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        const item = flatItems[selectedIndex]
        if (item) activateItem(item)
        return
      }
    },
    [close, selectedIndex, flatItems, setSelectedIndex, activateItem],
  )

  if (!isOpen) return null

  const terminalCount = terminalResults.reduce((a, r) => a + r.matchCount, 0)
  const fileCount = fileResults.reduce((a, r) => a + r.matchCount, 0)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={close} />

      {/* Dialog */}
      <div
        className="fixed z-50 left-1/2 -translate-x-1/2 top-[15vh] w-[600px] max-h-[60vh] flex flex-col bg-surface-1 border border-border-base rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-weak">
          <Search className="w-4 h-4 text-text-weaker shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              doSearch(e.target.value)
            }}
            placeholder="Search terminals, files..."
            className="flex-1 bg-transparent text-sm text-text-strong placeholder:text-text-weaker outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          {loading && <Loader2 className="w-4 h-4 text-text-weaker animate-spin shrink-0" />}
          <button onClick={close} className="text-text-weaker hover:text-text-base transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scope toggles */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-weak/50">
          <ScopeToggle
            label="Terminals"
            icon={<Terminal className="w-3 h-3" />}
            active={scopes.includes("terminals")}
            count={query ? terminalCount : undefined}
            onClick={() => toggleScope("terminals")}
          />
          <ScopeToggle
            label="Files"
            icon={<FileText className="w-3 h-3" />}
            active={scopes.includes("files")}
            count={query ? fileCount : undefined}
            loading={loading && scopes.includes("files")}
            onClick={() => toggleScope("files")}
          />
        </div>

        {/* Results */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
          {!query && (
            <div className="flex items-center justify-center py-12 text-text-weaker text-sm">
              Type to search across terminals and container files
            </div>
          )}

          {query && flatItems.length === 0 && !loading && (
            <div className="flex items-center justify-center py-12 text-text-weaker text-sm">
              No results found
            </div>
          )}

          {/* Terminal results */}
          {scopes.includes("terminals") && terminalResults.length > 0 && (
            <ResultSection
              title={`TERMINALS (${terminalCount} match${terminalCount !== 1 ? "es" : ""} in ${terminalResults.length} terminal${terminalResults.length !== 1 ? "s" : ""})`}
            >
              {terminalResults.map((r) => {
                const itemIndex = flatItems.findIndex(
                  (fi) => fi.type === "terminal" && fi.result.terminalId === r.terminalId,
                )
                return (
                  <ResultItem
                    key={r.terminalId}
                    index={itemIndex}
                    selected={selectedIndex === itemIndex}
                    icon={<Terminal className="w-3.5 h-3.5 text-text-weaker shrink-0" />}
                    title={r.terminalName}
                    subtitle={`${r.matchCount} match${r.matchCount !== 1 ? "es" : ""}`}
                    onClick={() => {
                      setSelectedIndex(itemIndex)
                      navigateToTerminal(r.terminalId, query, r.terminalName, r.container)
                    }}
                  >
                    {r.matches.slice(0, 3).map((m, i) => (
                      <div key={i} className="text-xs text-text-weak font-mono truncate pl-6 py-0.5">
                        {highlightMatch(truncateLine(m.line, m.column), query)}
                      </div>
                    ))}
                    {r.matches.length > 3 && (
                      <div className="text-[10px] text-text-weaker pl-6 py-0.5">
                        +{r.matches.length - 3} more
                      </div>
                    )}
                  </ResultItem>
                )
              })}
            </ResultSection>
          )}

          {/* File results */}
          {scopes.includes("files") && fileResults.length > 0 && (
            <ResultSection
              title={`FILES (${fileCount} match${fileCount !== 1 ? "es" : ""} in ${fileResults.length} file${fileResults.length !== 1 ? "s" : ""})`}
            >
              {fileResults.map((r) => {
                const itemIndex = flatItems.findIndex(
                  (fi) => fi.type === "file" && fi.result.filePath === r.filePath && fi.result.container === r.container,
                )
                return (
                  <ResultItem
                    key={`${r.container}:${r.filePath}`}
                    index={itemIndex}
                    selected={selectedIndex === itemIndex}
                    icon={<FileText className="w-3.5 h-3.5 text-text-weaker shrink-0" />}
                    title={r.filePath.split("/").pop() || r.filePath}
                    subtitle={r.filePath}
                    onClick={() => {
                      setSelectedIndex(itemIndex)
                      navigateToFile(r.container, r.filePath)
                    }}
                  >
                    {r.matches.slice(0, 3).map((m, i) => (
                      <div key={i} className="text-xs text-text-weak font-mono truncate pl-6 py-0.5">
                        <span className="text-text-weaker mr-2">{m.lineNumber}:</span>
                        {highlightMatch(truncateLine(m.line, m.column), query)}
                      </div>
                    ))}
                    {r.matches.length > 3 && (
                      <div className="text-[10px] text-text-weaker pl-6 py-0.5">
                        +{r.matches.length - 3} more
                      </div>
                    )}
                  </ResultItem>
                )
              })}
            </ResultSection>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border-weak/50 text-[10px] text-text-weaker">
          <span><kbd className="px-1 py-0.5 rounded bg-surface-3 text-text-weak">Up/Down</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 rounded bg-surface-3 text-text-weak">Enter</kbd> select</span>
          <span><kbd className="px-1 py-0.5 rounded bg-surface-3 text-text-weak">Esc</kbd> close</span>
        </div>
      </div>
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function ScopeToggle({
  label,
  icon,
  active,
  count,
  loading,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  count?: number
  loading?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
        active
          ? "bg-accent/15 text-accent border border-accent/30"
          : "bg-surface-2 text-text-weaker border border-transparent hover:text-text-weak"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && <span className="text-[10px] opacity-70">({count})</span>}
      {loading && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
    </button>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 py-1.5 text-[10px] font-semibold text-text-weaker uppercase tracking-wider">
        {title}
      </div>
      {children}
    </div>
  )
}

function ResultItem({
  index,
  selected,
  icon,
  title,
  subtitle,
  onClick,
  children,
}: {
  index: number
  selected: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      data-index={index}
      onClick={onClick}
      className={`cursor-pointer px-4 py-1.5 transition-colors ${
        selected ? "bg-accent/10" : "hover:bg-surface-2"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-text-strong font-medium truncate">{title}</span>
        <span className="text-xs text-text-weaker truncate ml-auto">{subtitle}</span>
      </div>
      {children}
    </div>
  )
}
