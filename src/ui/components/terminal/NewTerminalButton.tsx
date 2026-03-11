import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
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
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Position dropdown below the button
  useEffect(() => {
    if (!showDropdown || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - 180), // align right edge, clamp to viewport
    })
  }, [showDropdown])

  // Close on outside click
  useEffect(() => {
    if (!showDropdown) return
    const close = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return
      setShowDropdown(false)
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

  // Multiple containers: dropdown via portal
  return (
    <>
      {compact ? (
        <button
          ref={buttonRef}
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
          ref={buttonRef}
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-weak hover:text-text-base rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="font-sans">New terminal</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {showDropdown &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] min-w-[180px] bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans"
            style={{ top: pos.top, left: pos.left }}
          >
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
          </div>,
          document.body,
        )}
    </>
  )
}
