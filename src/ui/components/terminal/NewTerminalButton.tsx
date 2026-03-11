import { useState, useRef, useEffect } from "react"
import { Plus, ChevronDown, Terminal } from "lucide-react"

interface NewTerminalButtonProps {
  containerIds: string[]
  connected: boolean
  onAdd: (containerName?: string) => void
  compact?: boolean
}

export function NewTerminalButton({
  containerIds,
  connected,
  onAdd,
  compact,
}: NewTerminalButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showDropdown) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [showDropdown])

  const disabled = containerIds.length === 0 || !connected

  // Single container: just a button
  if (containerIds.length <= 1) {
    if (compact) {
      return (
        <button
          onClick={() => onAdd()}
          disabled={disabled}
          className="p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          title="New terminal"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
        </button>
      )
    }
    return (
      <button
        onClick={() => onAdd()}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-weak hover:text-text-base rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="font-sans">New terminal</span>
      </button>
    )
  }

  // Multiple containers: dropdown
  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled}
          className="flex items-center gap-0.5 p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          title="New terminal"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
          <ChevronDown className="w-2.5 h-2.5 text-text-weaker" />
        </button>
      ) : (
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-weak hover:text-text-base rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="font-sans">New terminal</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans">
          {containerIds.map((name) => (
            <button
              key={name}
              onClick={() => {
                onAdd(name)
                setShowDropdown(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
            >
              <Terminal className="w-3 h-3 text-text-weaker shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
