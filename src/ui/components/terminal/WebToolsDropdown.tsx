import { useState, useRef, useEffect } from "react"
import { Wrench, Settings as SettingsIcon } from "lucide-react"
import { WEB_TOOLS } from "../../stores/webtools"
import { TOOL_ICONS_SM } from "./terminalConstants"

interface WebToolsDropdownProps {
  openToolTabs: string[]
  onLaunch: (id: string) => void
  onSettings: () => void
}

export function WebToolsDropdown({
  openToolTabs,
  onLaunch,
  onSettings,
}: WebToolsDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`p-1 rounded transition-colors ${
          open ? "bg-surface-2 text-text-base" : "text-text-weaker hover:bg-surface-2/50 hover:text-text-weak"
        }`}
        title="Web tools"
      >
        <Wrench className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans">
          <div className="px-3 py-1.5 text-[10px] text-text-weaker uppercase tracking-wider">
            Web Tools
          </div>
          {WEB_TOOLS.map((tool) => {
            const isOpen = openToolTabs.includes(tool.id)
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
                {isOpen && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
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
        </div>
      )}
    </div>
  )
}
