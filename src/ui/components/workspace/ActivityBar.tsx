/**
 * ActivityBar — vertical 36px bar on the left side with icon actions.
 */

import {
  FolderTree,
  Search,
  Box,
  Settings as SettingsIcon,
} from "lucide-react"

interface ActivityBarProps {
  filesPanelOpen: boolean
  onToggleFilesPanel: () => void
  onOpenSearch: () => void
  onOpenContainers: () => void
  onOpenSettings: () => void
}

function ActivityIcon({
  icon,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-full h-8 transition-colors relative ${
        active
          ? "text-text-base"
          : "text-text-weaker hover:text-text-weak"
      }`}
      title={title}
    >
      {active && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />
      )}
      {icon}
    </button>
  )
}

export function ActivityBar({
  filesPanelOpen,
  onToggleFilesPanel,
  onOpenSearch,
  onOpenContainers,
  onOpenSettings,
}: ActivityBarProps) {
  return (
    <div className="shrink-0 w-9 bg-surface-0 border-r border-border-weak flex flex-col items-center">
      {/* Top icons */}
      <div className="flex flex-col w-full pt-1">
        <ActivityIcon
          icon={<FolderTree className="w-4 h-4" />}
          active={filesPanelOpen}
          onClick={onToggleFilesPanel}
          title="Files (Ctrl+B)"
        />
        <ActivityIcon
          icon={<Search className="w-4 h-4" />}
          onClick={onOpenSearch}
          title="Search (Ctrl+K)"
        />
        <ActivityIcon
          icon={<Box className="w-4 h-4" />}
          onClick={onOpenContainers}
          title="Containers"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom icons */}
      <div className="flex flex-col w-full pb-1">
        <ActivityIcon
          icon={<SettingsIcon className="w-4 h-4" />}
          onClick={onOpenSettings}
          title="Settings (Ctrl+,)"
        />
      </div>
    </div>
  )
}
