import { type Project } from "../../stores/project"
import {
  Settings as SettingsIcon,
  Plus,
  Box,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react"

interface IconRailProps {
  project: Project
  projects: Project[]
  onNavigateHome: () => void
  onSwitchProject: (id: string) => void
  onOpenSettings: () => void
  onOpenContainers: () => void
  containerCount: number
  chatPanelOpen: boolean
  onToggleChatPanel: () => void
}

export function IconRail({
  project,
  projects,
  onNavigateHome,
  onSwitchProject,
  onOpenSettings,
  onOpenContainers,
  containerCount,
  chatPanelOpen,
  onToggleChatPanel,
}: IconRailProps) {
  return (
    <div className="w-12 shrink-0 bg-surface-0 border-r border-border-weak flex flex-col items-center gap-2">
      {/* Exegol logo */}
      <div className="shrink-0 flex items-center justify-center w-full py-2.5 border-b border-border-weak/50">
        <img src="/exegol-symbol.svg" alt="Exegol" className="w-6 h-6" />
      </div>

      {/* Project buttons — scrollable */}
      <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto scrollbar-none w-full px-1.5 pt-1">
        {projects.map((p) => {
          const isActive = p.id === project.id
          const initial = p.name.charAt(0).toUpperCase()
          return (
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
          className="w-9 h-9 rounded-lg flex items-center justify-center border border-dashed border-border-weak text-text-weaker hover:border-border-base hover:text-text-weak transition-colors shrink-0"
          title="All projects"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 flex flex-col items-center gap-1.5 py-3 border-t border-border-weak/50 w-full px-1.5">
        {/* Chat panel toggle */}
        <button
          onClick={onToggleChatPanel}
          className={`w-9 h-7 rounded flex items-center justify-center transition-colors shrink-0 ${
            chatPanelOpen
              ? "text-accent bg-accent/10 hover:bg-accent/15"
              : "text-text-weaker hover:bg-surface-2 hover:text-text-weak"
          }`}
          title={chatPanelOpen ? "Hide chat" : "Show chat"}
        >
          {chatPanelOpen ? (
            <PanelRightClose className="w-3.5 h-3.5" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="w-6 h-px bg-border-weak/50 my-0.5" />

        {/* Container + settings */}
        <button
          onClick={onOpenContainers}
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-text-weaker hover:bg-surface-2 hover:text-text-weak transition-colors shrink-0"
          title="Manage containers"
        >
          <Box className="w-4 h-4" />
          {containerCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-status-success text-[8px] text-white flex items-center justify-center font-bold">
              {containerCount}
            </span>
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-text-weaker hover:bg-surface-2 hover:text-text-weak transition-colors shrink-0"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
