import { useState } from "react"
import {
  useExegolStore,
  type ExegolContainer,
} from "../../stores/exegol"
import { useProjectStore, type Project } from "../../stores/project"
import {
  Play,
  Square,
  RotateCcw,
  Trash2,
  Eye,
  Plus,
  Check,
  ArrowUpCircle,
} from "lucide-react"
import { ActionBtn } from "./exegolFormComponents"

export function ContainerSection({
  project,
  containers,
  onViewDetail,
  onCreateClick,
}: {
  project: Project
  containers: ExegolContainer[]
  onViewDetail: (name: string) => void
  onCreateClick: () => void
}) {
  const actionLoading = useExegolStore((s) => s.actionLoading)
  const startContainer = useExegolStore((s) => s.startContainer)
  const stopContainer = useExegolStore((s) => s.stopContainer)
  const restartContainer = useExegolStore((s) => s.restartContainer)
  const removeContainer = useExegolStore((s) => s.removeContainer)
  const upgradeContainer = useExegolStore((s) => s.upgradeContainer)
  const addToProject = useProjectStore((s) => s.addContainerToProject)
  const removeFromProject = useProjectStore(
    (s) => s.removeContainerFromProject,
  )

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const isActionLoading = (name: string, action: string) =>
    actionLoading === `${name}-${action}`

  const isLinked = (dockerName: string) =>
    project.containerIds.includes(dockerName)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-text-weaker font-sans">
          Manage Exegol containers. Add them to your project to open terminals.
        </p>
        <button
          onClick={onCreateClick}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded bg-accent text-white hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="w-3 h-3" />
          Create
        </button>
      </div>

      {containers.length === 0 ? (
        <div className="text-center py-8 text-xs text-text-weaker font-sans">
          No Exegol containers found. Create one to get started.
        </div>
      ) : (
        <div className="border border-border-weak rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_70px_1fr_auto] gap-2 px-3 py-1.5 bg-surface-2 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium">
            <span>Container</span>
            <span>State</span>
            <span>Image</span>
            <span>Config</span>
            <span className="w-[200px] text-right">Actions</span>
          </div>

          {containers.map((c) => {
            const isRunning = c.state.toLowerCase() === "running"
            const linked = isLinked(c.dockerName)
            const isConfirmingRemove = confirmRemove === c.name

            return (
              <div
                key={c.name}
                className={`grid grid-cols-[1fr_80px_70px_1fr_auto] gap-2 px-3 py-2 border-t border-border-weak items-center group hover:bg-surface-2/50 transition-colors ${
                  linked ? "bg-accent/3" : ""
                }`}
              >
                {/* Name + linked badge */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-text-strong font-mono truncate">
                    {c.name}
                  </span>
                  {linked && (
                    <span className="shrink-0 px-1 py-px text-[8px] rounded bg-accent/15 text-accent font-sans font-medium">
                      IN PROJECT
                    </span>
                  )}
                </div>

                {/* State */}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isRunning ? "bg-status-success" : "bg-text-weaker"
                    }`}
                  />
                  <span
                    className={`text-xs ${isRunning ? "text-status-success" : "text-text-weaker"}`}
                  >
                    {c.state}
                  </span>
                </div>

                {/* Image */}
                <span className="text-xs text-text-weak truncate">
                  {c.image}
                </span>

                {/* Config */}
                <span
                  className="text-xs text-text-weaker truncate"
                  title={c.config}
                >
                  {c.config || "Default"}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-0.5 justify-end w-[200px]">
                  {isConfirmingRemove ? (
                    <>
                      <span className="text-[10px] text-status-error mr-1 font-sans">
                        Remove?
                      </span>
                      <button
                        onClick={() => {
                          removeContainer(c.name, true)
                          setConfirmRemove(null)
                        }}
                        className="px-1.5 py-0.5 text-[10px] bg-status-error/20 text-status-error rounded hover:bg-status-error/30 font-sans"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="px-1.5 py-0.5 text-[10px] text-text-weaker hover:text-text-weak font-sans"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      {isRunning && (
                        <ActionBtn
                          onClick={() =>
                            linked
                              ? removeFromProject(project.id, c.dockerName)
                              : addToProject(project.id, c.dockerName)
                          }
                          title={linked ? "Remove from project" : "Add to project"}
                          className={
                            linked
                              ? "text-accent bg-accent/10 hover:bg-accent/20"
                              : "text-text-weaker hover:bg-surface-3 hover:text-accent"
                          }
                        >
                          {linked ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </ActionBtn>
                      )}
                      {!isRunning && (
                        <ActionBtn
                          onClick={() => startContainer(c.name)}
                          loading={isActionLoading(c.name, "start")}
                          title="Start"
                          className="text-status-success hover:bg-status-success/10"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </ActionBtn>
                      )}
                      {isRunning && (
                        <ActionBtn
                          onClick={() => stopContainer(c.name)}
                          loading={isActionLoading(c.name, "stop")}
                          title="Stop"
                          className="text-amber-400 hover:bg-amber-400/10"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </ActionBtn>
                      )}
                      <ActionBtn
                        onClick={() => restartContainer(c.name)}
                        loading={isActionLoading(c.name, "restart")}
                        title="Restart"
                        className="text-blue-400 hover:bg-blue-400/10"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => upgradeContainer(c.name, undefined, true)}
                        loading={isActionLoading(c.name, "upgrade")}
                        title="Upgrade container to latest image"
                        className="text-purple-400 hover:bg-purple-400/10"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => onViewDetail(c.name)}
                        title="View Details"
                        className="text-text-weak hover:bg-surface-3"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => setConfirmRemove(c.name)}
                        title="Remove"
                        className="text-status-error hover:bg-status-error/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </ActionBtn>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
