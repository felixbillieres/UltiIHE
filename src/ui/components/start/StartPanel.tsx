import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useProjectStore, type Project } from "../../stores/project"
import { ProjectCard } from "./ProjectCard"
import { CreateProjectDialog } from "./CreateProjectDialog"
import { Plus } from "lucide-react"

export function StartPanel() {
  const navigate = useNavigate()
  const { projects, createProject, deleteProject, setActiveProject } =
    useProjectStore()
  const [showCreate, setShowCreate] = useState(false)

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  function handleSelectProject(project: Project) {
    setActiveProject(project.id)
    navigate(`/project/${project.id}`)
  }

  function handleCreateProject(name: string, description?: string) {
    const project = createProject(name, description)
    setShowCreate(false)
    setActiveProject(project.id)
    navigate(`/project/${project.id}`)
  }

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-5">
            <img
              src="/exegol-symbol.svg"
              alt="Exegol"
              className="w-12 h-12"
            />
          </div>
          <h1 className="text-2xl font-semibold text-text-strong mb-1.5 font-sans tracking-tight">
            Exegol IHE
          </h1>
          <p className="text-text-weak text-sm font-sans">
            Interactive Hacking Environment
          </p>
        </div>

        {/* Projects list */}
        {sorted.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs uppercase tracking-wider text-text-weaker mb-3 px-1 font-sans font-medium">
              Recent Projects
            </h2>
            <div className="space-y-1.5">
              {sorted.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => handleSelectProject(project)}
                  onDelete={() => deleteProject(project.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Create project button */}
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-border-base hover:border-accent/50 hover:bg-surface-1 transition-all group"
        >
          <div className="p-2 rounded-lg bg-surface-2 group-hover:bg-accent/10 transition-colors">
            <Plus className="w-4 h-4 text-text-weak group-hover:text-accent" />
          </div>
          <div className="text-left">
            <div className="text-sm text-text-base group-hover:text-text-strong font-sans">
              New Project
            </div>
            <div className="text-xs text-text-weaker font-sans">
              Start a new pentest engagement
            </div>
          </div>
        </button>

        {/* Footer */}
        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2.5 text-text-weaker text-xs font-sans">
            <img src="/exegol-symbol.svg" alt="" className="w-3.5 h-3.5 opacity-40" />
            <span>Built by the Exegol team</span>
          </div>
        </div>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <CreateProjectDialog
          onCreate={handleCreateProject}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
