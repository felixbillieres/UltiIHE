import { useState } from "react"
import { type Project } from "../../stores/project"
import { FileManager } from "../files/FileManager"
import {
  FolderOpen,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from "lucide-react"

type BottomTab = "files"

interface BottomPanelProps {
  project: Project
  onClose: () => void
}

export function BottomPanel({ project, onClose }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>("files")

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-0">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border-weak shrink-0 bg-surface-1">
        <TabButton
          active={activeTab === "files"}
          onClick={() => setActiveTab("files")}
          icon={<FolderOpen className="w-3.5 h-3.5" />}
          label="Files"
        />
        {/* Future tabs: Credentials, Screenshots, Vulnerabilities */}
        <div className="ml-auto flex items-center pr-1.5 gap-0.5">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="Close panel"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "files" && (
          <FileManager containerIds={project.containerIds} />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium transition-colors border-b-2 ${
        active
          ? "text-text-strong border-accent"
          : "text-text-weaker hover:text-text-weak border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
