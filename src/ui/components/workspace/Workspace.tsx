import { useParams, useNavigate } from "react-router-dom"
import { useProjectStore } from "../../stores/project"
import { useContainerStore } from "../../stores/container"
import { ContainerPicker } from "./ContainerPicker"
import { WorkspaceLayout } from "./WorkspaceLayout"
import { ArrowLeft } from "lucide-react"

export function Workspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  )
  const activeContainerId = useContainerStore((s) => s.activeContainerId)

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-weak mb-4">Project not found</p>
          <button
            onClick={() => navigate("/")}
            className="text-accent hover:text-accent-hover text-sm"
          >
            Back to projects
          </button>
        </div>
      </div>
    )
  }

  // No container selected yet — show picker
  if (!activeContainerId) {
    return (
      <div className="h-full flex flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-weak bg-surface-1">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-text-weak" />
          </button>
          <div>
            <div className="text-sm text-text-strong">{project.name}</div>
            {project.description && (
              <div className="text-xs text-text-weaker">
                {project.description}
              </div>
            )}
          </div>
        </div>

        {/* Container picker */}
        <div className="flex-1 flex items-center justify-center">
          <ContainerPicker projectId={project.id} />
        </div>
      </div>
    )
  }

  return <WorkspaceLayout project={project} />
}
