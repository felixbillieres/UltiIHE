import { useEffect, useCallback } from "react"
import { ChevronUp, ChevronDown, X, Search } from "lucide-react"
import { useSearchStore } from "../../stores/search"

export function SearchMiniPanel() {
  const miniPanel = useSearchStore((s) => s.miniPanel)
  const nextMatch = useSearchStore((s) => s.nextMatch)
  const prevMatch = useSearchStore((s) => s.prevMatch)
  const closeMiniPanel = useSearchStore((s) => s.closeMiniPanel)

  // Keyboard shortcuts while mini panel is open
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!miniPanel) return
      // Escape closes the mini panel
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        closeMiniPanel()
        return
      }
      // F3 or Enter = next, Shift+F3 or Shift+Enter = prev
      if (e.key === "F3" || (e.key === "Enter" && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        if (e.shiftKey) prevMatch()
        else nextMatch()
      }
    },
    [miniPanel, nextMatch, prevMatch, closeMiniPanel],
  )

  useEffect(() => {
    if (!miniPanel) return
    window.addEventListener("keydown", handleGlobalKeyDown, true)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true)
  }, [miniPanel, handleGlobalKeyDown])

  if (!miniPanel) return null

  const { query, currentMatch, totalMatches, type } = miniPanel
  const label = type === "terminal" ? "Terminal" : "File"
  const hasMatches = totalMatches > 0

  return (
    <div className="fixed top-2 right-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-1 border border-border-base shadow-xl text-sm font-sans animate-in slide-in-from-top-2">
      <Search className="w-3.5 h-3.5 text-text-weaker shrink-0" />

      <span className="text-text-strong font-medium max-w-[200px] truncate">
        {query}
      </span>

      <span className="text-text-weaker text-xs mx-1">
        {hasMatches ? (
          <>{currentMatch + 1} of {totalMatches}</>
        ) : (
          "No matches"
        )}
      </span>

      <span className="text-text-weaker text-[10px] px-1.5 py-0.5 rounded bg-surface-3">
        {label}
      </span>

      <div className="flex items-center ml-1">
        <button
          onClick={prevMatch}
          disabled={!hasMatches}
          className="p-0.5 rounded hover:bg-surface-3 text-text-weak hover:text-text-base disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous match (Shift+F3)"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={nextMatch}
          disabled={!hasMatches}
          className="p-0.5 rounded hover:bg-surface-3 text-text-weak hover:text-text-base disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next match (F3)"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={closeMiniPanel}
        className="p-0.5 rounded hover:bg-surface-3 text-text-weak hover:text-text-base transition-colors ml-0.5"
        title="Close search (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
