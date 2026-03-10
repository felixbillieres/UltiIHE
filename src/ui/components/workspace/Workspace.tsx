import { useParams, useNavigate } from "react-router-dom"
import { useProjectStore } from "../../stores/project"
import { WorkspaceLayout } from "./WorkspaceLayout"

export function Workspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  )

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

  // Go straight to workspace — no blocking container picker
  return <WorkspaceLayout project={project} />
}
