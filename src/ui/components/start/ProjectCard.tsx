import { type Project } from "../../stores/project"
import { Folder, Trash2, Clock } from "lucide-react"

interface Props {
  project: Project
  onClick: () => void
  onDelete: () => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ProjectCard({ project, onClick, onDelete }: Props) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-1 border border-border-weak hover:border-border-base hover:bg-surface-2 transition-all cursor-pointer group"
    >
      <div className="p-2 rounded-lg bg-surface-2 group-hover:bg-accent/8">
        <Folder className="w-4 h-4 text-text-weak group-hover:text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-strong truncate font-sans font-medium">
          {project.name}
        </div>
        {project.description && (
          <div className="text-xs text-text-weaker truncate font-sans">
            {project.description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {project.containerName && (
          <span className="text-xs px-2 py-0.5 rounded bg-surface-3 text-text-weak font-mono">
            {project.containerName}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs text-text-weaker font-sans">
          <Clock className="w-3 h-3" />
          {timeAgo(project.updatedAt)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1.5 rounded hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5 text-text-weaker hover:text-red-400" />
        </button>
      </div>
    </div>
  )
}
