/**
 * TopBar — VS Code-style title bar with logo, project switcher, centered search,
 * and right-aligned layout toggles.
 */

import { useState, useRef, useEffect } from "react"
import { type Project } from "../../stores/project"
import { useCommandPalette } from "../../hooks/useCommandPalette"
import { useSearchStore } from "../../stores/search"
import {
  Settings as SettingsIcon,
  Search,
  PanelLeft,
  PanelRight,
  PanelBottom,
  ChevronDown,
  Command,
  ArrowLeftRight,
} from "lucide-react"

interface TopBarProps {
  project: Project
  projects: Project[]
  onNavigateHome: () => void
  onSwitchProject: (id: string) => void
  onOpenSettings: () => void
  containerCount: number
  filesPanelOpen: boolean
  chatPanelOpen: boolean
  bottomPanelOpen: boolean
  swapped: boolean
  onToggleFilesPanel: () => void
  onToggleChatPanel: () => void
  onToggleBottomPanel: () => void
  onSwapPanels: () => void
}

// ── Project switcher dropdown ────────────────────────────────

function ProjectSwitcher({
  project,
  projects,
  onSwitch,
  onHome,
}: {
  project: Project
  projects: Project[]
  onSwitch: (id: string) => void
  onHome: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("mousedown", handler)
    window.addEventListener("keydown", esc)
    return () => { window.removeEventListener("mousedown", handler); window.removeEventListener("keydown", esc) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-surface-2 transition-colors text-text-base"
      >
        <span className="text-xs font-sans font-medium truncate max-w-[160px]">{project.name}</span>
        <ChevronDown className="w-3 h-3 text-text-weaker" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-52 bg-surface-2 border border-border-base rounded-lg shadow-xl overflow-hidden">
          {projects.map((p) => {
            const isActive = p.id === project.id
            return (
              <button
                key={p.id}
                onClick={() => { if (!isActive) onSwitch(p.id); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-sans transition-colors ${
                  isActive ? "bg-accent/10 text-accent" : "text-text-base hover:bg-surface-3"
                }`}
              >
                <span className="truncate">{p.name}</span>
              </button>
            )
          })}
          <div className="border-t border-border-weak">
            <button
              onClick={() => { onHome(); setOpen(false) }}
              className="w-full px-3 py-1.5 text-xs font-sans text-text-weaker hover:text-text-base hover:bg-surface-3 transition-colors text-left"
            >
              All projects...
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panel toggle button ─────────────────────────────────────

function PanelToggle({
  active,
  onClick,
  icon,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-[22px] h-[22px] rounded transition-colors ${
        active ? "text-text-base bg-surface-2" : "text-text-weaker hover:text-text-weak hover:bg-surface-2/50"
      }`}
      title={title}
    >
      {icon}
    </button>
  )
}

// ── Main TopBar ──────────────────────────────────────────────

export function TopBar({
  project,
  projects,
  onNavigateHome,
  onSwitchProject,
  onOpenSettings,
  containerCount: _containerCount,
  filesPanelOpen,
  chatPanelOpen,
  bottomPanelOpen,
  swapped,
  onToggleFilesPanel,
  onToggleChatPanel,
  onToggleBottomPanel,
  onSwapPanels,
}: TopBarProps) {
  const { open: openCommandPalette } = useCommandPalette()
  const openSearch = () => useSearchStore.getState().open()

  return (
    <div className="shrink-0 bg-surface-0 border-b border-border-weak h-[35px] flex items-center px-2 gap-1 select-none">

      {/* ── Left: Logo + Project ─────────────────────────── */}
      <button
        onClick={onNavigateHome}
        className="flex items-center px-1 py-0.5 rounded hover:bg-surface-2 transition-colors shrink-0"
        title="Back to projects"
      >
        <img src="/exegol-symbol.svg" alt="Exegol" className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-border-weak mx-0.5" />

      <ProjectSwitcher
        project={project}
        projects={projects}
        onSwitch={onSwitchProject}
        onHome={onNavigateHome}
      />

      {/* ── Center: Search bar ───────────────────────────── */}
      <div className="flex-1 flex justify-center px-4">
        <button
          onClick={openSearch}
          className="flex items-center gap-2 w-full max-w-[360px] h-[22px] px-2.5 rounded-md bg-surface-1 border border-border-weak hover:bg-surface-2 hover:border-border-base transition-colors cursor-pointer"
          title="Search (Ctrl+K)"
        >
          <Search className="w-3 h-3 text-text-weaker shrink-0" />
          <span className="text-[11px] text-text-weaker font-sans flex-1 text-left truncate">
            Search...
          </span>
          <kbd className="text-[9px] text-text-weaker font-sans bg-surface-0 border border-border-weak rounded px-1 py-px shrink-0">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* ── Right: Layout toggles + Settings ─────────────── */}
      <div className="flex items-center gap-0.5 shrink-0">
        <PanelToggle
          active={filesPanelOpen}
          onClick={onToggleFilesPanel}
          icon={<PanelLeft className="w-3.5 h-3.5" />}
          title={filesPanelOpen ? "Hide sidebar (Ctrl+B)" : "Show sidebar (Ctrl+B)"}
        />
        <PanelToggle
          active={bottomPanelOpen}
          onClick={onToggleBottomPanel}
          icon={<PanelBottom className="w-3.5 h-3.5" />}
          title={bottomPanelOpen ? "Hide panel (Ctrl+J)" : "Show panel (Ctrl+J)"}
        />
        <PanelToggle
          active={chatPanelOpen}
          onClick={onToggleChatPanel}
          icon={<PanelRight className="w-3.5 h-3.5" />}
          title={chatPanelOpen ? "Hide assistant (Ctrl+Shift+B)" : "Show assistant (Ctrl+Shift+B)"}
        />
        <PanelToggle
          active={swapped}
          onClick={onSwapPanels}
          icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
          title="Swap side panels"
        />

        <div className="w-px h-4 bg-border-weak mx-0.5" />

        <button
          onClick={openCommandPalette}
          className="flex items-center justify-center w-[22px] h-[22px] rounded text-text-weaker hover:text-text-weak hover:bg-surface-2 transition-colors"
          title="Command palette (Ctrl+Shift+P)"
        >
          <Command className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center w-[22px] h-[22px] rounded text-text-weaker hover:text-text-weak hover:bg-surface-2 transition-colors"
          title="Settings (Ctrl+,)"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
