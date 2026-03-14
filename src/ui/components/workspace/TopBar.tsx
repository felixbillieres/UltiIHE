/**
 * TopBar — horizontal replacement for the vertical IconRail.
 * Two rows:
 *   Row 1 (Options): Logo, project switcher, menus (Search, Containers, Commands, Settings)
 *   Row 2 (Views):   Panel toggles, layout presets
 */

import { useState, useRef, useEffect } from "react"
import { type Project } from "../../stores/project"
import { useCommandPalette } from "../../hooks/useCommandPalette"
import { useSearchStore } from "../../stores/search"
import { type LayoutPreset, LAYOUT_PRESETS } from "./layoutPersistence"
import {
  Settings as SettingsIcon,
  Box,
  Command,
  Search,
  PanelLeft,
  PanelRight,
  PanelBottom,
  LayoutDashboard,
  MessageSquare,
  FileCode,
  Monitor,
  Radar,
  ChevronDown,
  ArrowLeftRight,
} from "lucide-react"

const PRESET_ICONS: Record<LayoutPreset, React.ReactNode> = {
  default: <LayoutDashboard className="w-3 h-3" />,
  focus: <MessageSquare className="w-3 h-3" />,
  editor: <FileCode className="w-3 h-3" />,
  terminal: <Monitor className="w-3 h-3" />,
  recon: <Radar className="w-3 h-3" />,
}

interface TopBarProps {
  project: Project
  projects: Project[]
  onNavigateHome: () => void
  onSwitchProject: (id: string) => void
  onOpenSettings: () => void
  onOpenContainers: () => void
  containerCount: number
  filesPanelOpen: boolean
  chatPanelOpen: boolean
  bottomPanelOpen: boolean
  swapped: boolean
  activePreset?: LayoutPreset
  onToggleFilesPanel: () => void
  onToggleChatPanel: () => void
  onToggleBottomPanel: () => void
  onSwapPanels: () => void
  onApplyPreset?: (preset: LayoutPreset) => void
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
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors text-text-base"
      >
        <span className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
          {project.name.charAt(0).toUpperCase()}
        </span>
        <span className="text-xs font-sans font-medium truncate max-w-[140px]">{project.name}</span>
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
                <span className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${
                  isActive ? "bg-accent/20 text-accent" : "bg-surface-0 text-text-weaker"
                }`}>
                  {p.name.charAt(0).toUpperCase()}
                </span>
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

// ── View toggle button ───────────────────────────────────────

function ViewToggle({
  icon,
  label,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors ${
        active
          ? "text-text-base bg-surface-2"
          : "text-text-weaker hover:text-text-weak hover:bg-surface-2/50"
      }`}
      title={title}
    >
      {icon}
      {label}
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
  onOpenContainers,
  containerCount,
  filesPanelOpen,
  chatPanelOpen,
  bottomPanelOpen,
  swapped,
  activePreset,
  onToggleFilesPanel,
  onToggleChatPanel,
  onToggleBottomPanel,
  onSwapPanels,
  onApplyPreset,
}: TopBarProps) {
  const { open: openCommandPalette } = useCommandPalette()
  const openSearch = () => useSearchStore.getState().open()

  return (
    <div className="shrink-0 bg-surface-0 border-b border-border-weak">
      {/* Row 1: Options */}
      <div className="flex items-center h-9 px-2 gap-1">
        {/* Logo */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-surface-2 transition-colors shrink-0"
          title="Back to projects"
        >
          <img src="/exegol-symbol.svg" alt="Exegol" className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-border-weak mx-0.5" />

        {/* Project switcher */}
        <ProjectSwitcher
          project={project}
          projects={projects}
          onSwitch={onSwitchProject}
          onHome={onNavigateHome}
        />

        <div className="flex-1" />

        {/* Right actions */}
        <button
          onClick={openSearch}
          className="flex items-center gap-1 px-2 py-1 rounded text-text-weaker hover:text-text-weak hover:bg-surface-2 transition-colors"
          title="Search (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-[10px] font-sans hidden sm:inline">Search</span>
        </button>

        <button
          onClick={onOpenContainers}
          className="relative flex items-center gap-1 px-2 py-1 rounded text-text-weaker hover:text-text-weak hover:bg-surface-2 transition-colors"
          title="Containers"
        >
          <Box className="w-3.5 h-3.5" />
          {containerCount > 0 && (
            <span className="text-[10px] font-sans text-status-success">{containerCount}</span>
          )}
        </button>

        <button
          onClick={openCommandPalette}
          className="flex items-center gap-1 px-2 py-1 rounded text-text-weaker hover:text-text-weak hover:bg-surface-2 transition-colors"
          title="Commands (Ctrl+Shift+P)"
        >
          <Command className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center px-2 py-1 rounded text-text-weaker hover:text-text-weak hover:bg-surface-2 transition-colors"
          title="Settings"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 2: Views */}
      <div className="flex items-center h-7 px-2 gap-0.5 border-t border-border-weak/50">
        {/* Panel toggles */}
        <ViewToggle
          icon={<PanelLeft className="w-3 h-3" />}
          label="Sidebar"
          active={filesPanelOpen}
          onClick={onToggleFilesPanel}
          title={filesPanelOpen ? "Hide sidebar" : "Show sidebar"}
        />
        <ViewToggle
          icon={<PanelBottom className="w-3 h-3" />}
          label="Panel"
          active={bottomPanelOpen}
          onClick={onToggleBottomPanel}
          title={bottomPanelOpen ? "Hide panel" : "Show panel"}
        />
        <ViewToggle
          icon={<PanelRight className="w-3 h-3" />}
          label="Assistant"
          active={chatPanelOpen}
          onClick={onToggleChatPanel}
          title={chatPanelOpen ? "Hide assistant" : "Show assistant"}
        />

        <div className="w-px h-3.5 bg-border-weak mx-1" />

        <ViewToggle
          icon={<ArrowLeftRight className="w-3 h-3" />}
          label="Swap"
          active={swapped}
          onClick={onSwapPanels}
          title="Swap sidebar and assistant"
        />

        <div className="w-px h-3.5 bg-border-weak mx-1" />

        {/* Layout presets */}
        {onApplyPreset && (
          <div className="flex items-center gap-0.5">
            {(Object.keys(LAYOUT_PRESETS) as LayoutPreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => onApplyPreset(preset)}
                className={`p-1 rounded transition-colors ${
                  activePreset === preset
                    ? "text-accent bg-accent/10"
                    : "text-text-weaker hover:text-text-weak hover:bg-surface-2/50"
                }`}
                title={`${LAYOUT_PRESETS[preset].label} — ${LAYOUT_PRESETS[preset].description}`}
              >
                {PRESET_ICONS[preset]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
