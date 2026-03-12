import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Wrench, Settings as SettingsIcon } from "lucide-react"
import { WEB_TOOLS } from "../../stores/webtools"
import { TOOL_ICONS_SM } from "./terminalConstants"

interface WebToolsDropdownProps {
  openToolTabs: string[] // tool IDs that have open tabs
  onLaunch: (id: string) => void
  onSettings: () => void
}

export function WebToolsDropdown({
  openToolTabs,
  onLaunch,
  onSettings,
}: WebToolsDropdownProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Position dropdown below the button
  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - 208), // 208 = w-52
    })
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`p-1 rounded transition-colors ${
          open ? "bg-surface-2 text-text-base" : "text-text-weaker hover:bg-surface-2/50 hover:text-text-weak"
        }`}
        title="Web tools"
      >
        <Wrench className="w-3.5 h-3.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-52 bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="px-3 py-1.5 text-[10px] text-text-weaker uppercase tracking-wider">
              Web Tools
            </div>
            {WEB_TOOLS.map((tool) => {
              const openCount = openToolTabs.filter((id) => id === tool.id).length
              return (
                <button
                  key={tool.id}
                  onClick={() => {
                    onLaunch(tool.id)
                    setOpen(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
                >
                  <span className="shrink-0 text-text-weak">
                    {TOOL_ICONS_SM[tool.icon]}
                  </span>
                  <span className="flex-1">{tool.name}</span>
                  {openCount > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      {openCount > 1 && (
                        <span className="text-[9px] text-emerald-400 font-mono">{openCount}</span>
                      )}
                    </span>
                  )}
                </button>
              )
            })}
            <div className="h-px bg-border-weak my-1" />
            <button
              onClick={() => {
                onSettings()
                setOpen(false)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-text-weak hover:bg-surface-3 hover:text-text-base transition-colors"
            >
              <SettingsIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Configure tools...</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
