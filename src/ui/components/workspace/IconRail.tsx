import { useState, useEffect } from "react"
import { type Project } from "../../stores/project"
import { useCommandPalette } from "../../hooks/useCommandPalette"
import { type LayoutPreset, LAYOUT_PRESETS } from "./layoutPersistence"
import {
  Settings as SettingsIcon,
  Plus,
  Box,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottomClose,
  PanelBottomOpen,
  ArrowLeftRight,
  LayoutDashboard,
  MessageSquare,
  FileCode,
  Monitor,
  Radar,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

const ICON_SIZE = "w-3.5 h-3.5"
const ICON_SIZE_SM = "w-3 h-3"

const PRESET_ICONS: Record<LayoutPreset, React.ReactNode> = {
  default: <LayoutDashboard className={ICON_SIZE_SM} />,
  focus: <MessageSquare className={ICON_SIZE_SM} />,
  editor: <FileCode className={ICON_SIZE_SM} />,
  terminal: <Monitor className={ICON_SIZE_SM} />,
  recon: <Radar className={ICON_SIZE_SM} />,
}

const EXPAND_KEY = "ultiIHE-iconrail-expanded"

interface IconRailProps {
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

export function IconRail({
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
}: IconRailProps) {
  const { open: openCommandPalette } = useCommandPalette()
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(EXPAND_KEY) === "true" } catch { return false }
  })

  useEffect(() => {
    localStorage.setItem(EXPAND_KEY, String(expanded))
  }, [expanded])

  const w = expanded ? "w-44" : "w-12"

  // Helper for rail buttons with optional label
  function RailBtn({
    icon,
    label,
    active,
    onClick,
    title,
    badge,
    className: extraClass,
  }: {
    icon: React.ReactNode
    label?: string
    active?: boolean
    onClick: () => void
    title: string
    badge?: React.ReactNode
    className?: string
  }) {
    return (
      <button
        onClick={onClick}
        className={`relative rounded flex items-center transition-colors shrink-0 ${
          expanded ? "w-full px-2 h-7 gap-2" : "w-9 h-7 justify-center"
        } ${
          active
            ? "text-accent bg-accent/10 hover:bg-accent/15"
            : "text-text-weaker hover:bg-surface-2 hover:text-text-weak"
        } ${extraClass ?? ""}`}
        title={expanded ? "" : title}
      >
        {icon}
        {expanded && label && (
          <span className="text-[11px] font-sans truncate">{label}</span>
        )}
        {badge}
      </button>
    )
  }

  return (
    <div className={`${w} shrink-0 bg-surface-0 border-r border-border-weak flex flex-col items-center gap-2 transition-all duration-200`}>
      {/* Exegol logo — click to go home */}
      <button
        onClick={onNavigateHome}
        className={`shrink-0 flex items-center ${expanded ? "justify-start px-3 gap-2" : "justify-center"} w-full py-2.5 border-b border-border-weak/50 hover:bg-surface-1 transition-colors`}
        title="Back to projects"
      >
        <img src="/exegol-symbol.svg" alt="Exegol" className="w-6 h-6 shrink-0" />
        {expanded && (
          <span className="text-xs font-sans font-semibold text-text-strong truncate">Exegol IHE</span>
        )}
      </button>

      {/* Project buttons — scrollable */}
      <div className={`flex-1 flex flex-col ${expanded ? "items-stretch" : "items-center"} gap-1.5 overflow-y-auto scrollbar-none w-full px-1.5 pt-1`}>
        {projects.map((p) => {
          const isActive = p.id === project.id
          const initial = p.name.charAt(0).toUpperCase()
          return expanded ? (
            <button
              key={p.id}
              onClick={() => (!isActive ? onSwitchProject(p.id) : undefined)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all shrink-0 ${
                isActive
                  ? "bg-accent/20 text-accent ring-1 ring-accent/30"
                  : "text-text-weak hover:bg-surface-2 hover:text-text-base"
              }`}
            >
              <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-sans font-bold shrink-0 ${
                isActive ? "bg-accent/20" : "bg-surface-3"
              }`}>
                {initial}
              </span>
              <span className="text-[11px] font-sans truncate">{p.name}</span>
            </button>
          ) : (
            <button
              key={p.id}
              onClick={() => (!isActive ? onSwitchProject(p.id) : undefined)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-sans font-bold transition-all shrink-0 ${
                isActive
                  ? "bg-accent/20 text-accent ring-2 ring-accent/50"
                  : "bg-surface-2 text-text-weak hover:bg-surface-3 hover:text-text-base"
              }`}
              title={p.name}
            >
              {initial}
            </button>
          )
        })}

        <button
          onClick={onNavigateHome}
          className={`rounded-lg flex items-center justify-center border border-dashed border-border-weak text-text-weaker hover:border-border-base hover:text-text-weak transition-colors shrink-0 ${
            expanded ? "w-full h-8 gap-2 px-2" : "w-9 h-9"
          }`}
          title="All projects"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {expanded && <span className="text-[11px] font-sans">All projects</span>}
        </button>
      </div>

      {/* Bottom actions */}
      <div className={`shrink-0 flex flex-col ${expanded ? "items-stretch" : "items-center"} gap-1 py-3 border-t border-border-weak/50 w-full px-1.5`}>
        {/* Panel toggles */}
        <RailBtn
          icon={filesPanelOpen ? <PanelLeftClose className={ICON_SIZE} /> : <PanelLeftOpen className={ICON_SIZE} />}
          label="Files"
          active={filesPanelOpen}
          onClick={onToggleFilesPanel}
          title={filesPanelOpen ? "Hide files" : "Show files"}
        />
        <RailBtn
          icon={<ArrowLeftRight className={ICON_SIZE} />}
          label="Swap"
          active={swapped}
          onClick={onSwapPanels}
          title="Swap panels"
        />
        <RailBtn
          icon={chatPanelOpen ? <PanelRightClose className={ICON_SIZE} /> : <PanelRightOpen className={ICON_SIZE} />}
          label="Assistant"
          active={chatPanelOpen}
          onClick={onToggleChatPanel}
          title={chatPanelOpen ? "Hide assistant" : "Show assistant"}
        />
        <RailBtn
          icon={bottomPanelOpen ? <PanelBottomClose className={ICON_SIZE} /> : <PanelBottomOpen className={ICON_SIZE} />}
          label="Bottom"
          active={bottomPanelOpen}
          onClick={onToggleBottomPanel}
          title={bottomPanelOpen ? "Hide panel" : "Toggle panel"}
        />

        <div className={`${expanded ? "mx-2" : "w-6"} h-px bg-border-weak/50 my-0.5 self-center`} />

        {/* Layout presets */}
        {onApplyPreset && (
          <div className={`flex flex-col ${expanded ? "items-stretch" : "items-center"} gap-0.5`}>
            {(Object.keys(LAYOUT_PRESETS) as LayoutPreset[]).map((preset) => (
              <RailBtn
                key={preset}
                icon={PRESET_ICONS[preset]}
                label={LAYOUT_PRESETS[preset].label}
                active={activePreset === preset}
                onClick={() => onApplyPreset(preset)}
                title={`${LAYOUT_PRESETS[preset].label} — ${LAYOUT_PRESETS[preset].description}`}
              />
            ))}
          </div>
        )}

        <div className={`${expanded ? "mx-2" : "w-6"} h-px bg-border-weak/50 my-0.5 self-center`} />

        {/* Container + settings */}
        <RailBtn
          icon={<Box className="w-4 h-4" />}
          label={`Containers${containerCount > 0 ? ` (${containerCount})` : ""}`}
          onClick={onOpenContainers}
          title="Manage containers"
          badge={!expanded && containerCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-status-success text-[8px] text-white flex items-center justify-center font-bold">
              {containerCount}
            </span>
          ) : undefined}
          className={expanded ? "h-8" : "h-9 w-9 rounded-lg"}
        />
        <RailBtn
          icon={<Command className="w-4 h-4" />}
          label="Commands"
          onClick={openCommandPalette}
          title="Command palette (Ctrl+Shift+P)"
          className={expanded ? "h-8" : "h-9 w-9 rounded-lg"}
        />
        <RailBtn
          icon={<SettingsIcon className="w-4 h-4" />}
          label="Settings"
          onClick={onOpenSettings}
          title="Settings"
          className={expanded ? "h-8" : "h-9 w-9 rounded-lg"}
        />

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 w-full flex items-center justify-center py-1 rounded text-text-weaker hover:bg-surface-2 hover:text-text-weak transition-colors"
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {expanded ? (
            <ChevronsLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronsRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
