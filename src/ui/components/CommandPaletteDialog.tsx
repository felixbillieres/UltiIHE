import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import fuzzysort from "fuzzysort"
import { Search } from "lucide-react"
import { useCommandPalette, formatKeybind, type CommandOption } from "../hooks/useCommandPalette"

// ── Grouped commands ─────────────────────────────────────────

interface CommandGroup {
  category: string
  commands: CommandOption[]
}

function groupCommands(commands: CommandOption[]): CommandGroup[] {
  const map = new Map<string, CommandOption[]>()
  for (const cmd of commands) {
    if (cmd.disabled) continue
    const group = map.get(cmd.category) || []
    group.push(cmd)
    map.set(cmd.category, group)
  }
  // Sort categories: General first, then alphabetical
  const PRIORITY = ["General", "Session", "Navigation", "Terminal", "Model & Agent"]
  const entries = [...map.entries()].sort((a, b) => {
    const ai = PRIORITY.indexOf(a[0])
    const bi = PRIORITY.indexOf(b[0])
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a[0].localeCompare(b[0])
  })
  return entries.map(([category, commands]) => ({ category, commands }))
}

// ── Component ────────────────────────────────────────────────

export function CommandPaletteDialog() {
  const { isOpen, close, commands } = useCommandPalette()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter commands with fuzzy search
  const filtered = useMemo(() => {
    if (!query.trim()) return commands.filter((c) => !c.disabled)
    const results = fuzzysort.go(query, commands, {
      keys: ["title", "description", "category"],
      threshold: -500,
    })
    return results.map((r) => r.obj)
  }, [query, commands])

  const groups = useMemo(() => groupCommands(filtered), [filtered])

  // Flat list for keyboard navigation
  const flatList = useMemo(
    () => groups.flatMap((g) => g.commands),
    [groups],
  )

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setSelectedIndex(0)
      // Focus input after render
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Clamp selection when list changes
  useEffect(() => {
    if (selectedIndex >= flatList.length) {
      setSelectedIndex(Math.max(0, flatList.length - 1))
    }
  }, [flatList.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector("[data-selected=true]")
    selected?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const handleSelect = useCallback(
    (cmd: CommandOption) => {
      close()
      // Delay to let dialog close before action
      requestAnimationFrame(() => cmd.onSelect())
    },
    [close],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (flatList[selectedIndex]) {
            handleSelect(flatList[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          close()
          break
      }
    },
    [flatList, selectedIndex, handleSelect, close],
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={close}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div
        className="relative w-[520px] max-h-[60vh] bg-surface-0 border border-border-base rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
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
              setSelectedIndex(0)
            }}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-sm text-text-strong placeholder-text-weaker focus:outline-none font-sans"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Command list */}
        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin py-1">
          {flatList.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-weaker font-sans">
              No matching commands
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.category}>
                {/* Category header */}
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-semibold text-text-weaker uppercase tracking-wider font-sans">
                    {group.category}
                  </span>
                </div>
                {/* Commands */}
                {group.commands.map((cmd) => {
                  const idx = flatList.indexOf(cmd)
                  const isSelected = idx === selectedIndex
                  return (
                    <button
                      key={cmd.id}
                      data-selected={isSelected}
                      className={`w-full flex items-center gap-3 px-4 py-1.5 text-left transition-colors ${
                        isSelected
                          ? "bg-accent/10 text-text-strong"
                          : "text-text-base hover:bg-surface-1"
                      }`}
                      onClick={() => handleSelect(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {/* Icon */}
                      {cmd.icon && (
                        <span className="w-4 h-4 shrink-0 flex items-center justify-center text-text-weaker">
                          {cmd.icon}
                        </span>
                      )}
                      {/* Title + description */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-sans">{cmd.title}</span>
                        {cmd.description && (
                          <span className="ml-2 text-xs text-text-weaker font-sans">
                            {cmd.description}
                          </span>
                        )}
                      </div>
                      {/* Keybind */}
                      {cmd.keybind && (
                        <span className="shrink-0 text-[11px] text-text-weaker font-mono bg-surface-1 px-1.5 py-0.5 rounded border border-border-weak">
                          {formatKeybind(cmd.keybind)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-1.5 border-t border-border-weak flex items-center gap-3 text-[10px] text-text-weaker font-sans">
          <span>
            <kbd className="px-1 py-0.5 bg-surface-1 rounded border border-border-weak text-[10px]">&uarr;&darr;</kbd> navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-surface-1 rounded border border-border-weak text-[10px]">Enter</kbd> select
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-surface-1 rounded border border-border-weak text-[10px]">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
