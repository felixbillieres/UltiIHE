import { useEffect } from "react"
import { useContainerStore, type ExegolContainer } from "../../stores/container"
import { useProjectStore } from "../../stores/project"
import {
  Box,
  Play,
  Square,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react"

interface Props {
  projectId: string
}

export function ContainerPicker({ projectId }: Props) {
  const {
    containers,
    loading,
    error,
    fetchContainers,
    startContainer,
    setActiveContainer,
  } = useContainerStore()
  const updateProject = useProjectStore((s) => s.updateProject)

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers])

  const addContainerToProject = useProjectStore((s) => s.addContainerToProject)

  function handleSelect(container: ExegolContainer) {
    setActiveContainer(container.id)
    addContainerToProject(projectId, container.name)
  }

  async function handleStart(container: ExegolContainer) {
    await startContainer(container.name)
  }

  return (
    <div className="w-full max-w-lg px-6">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Box className="w-5 h-5 text-accent" />
          <h2 className="text-lg text-text-strong">Select Container</h2>
        </div>
        <p className="text-sm text-text-weak">
          Choose an Exegol container for this engagement
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && containers.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-text-weaker animate-spin" />
          <span className="ml-2 text-sm text-text-weaker">
            Scanning for Exegol containers...
          </span>
        </div>
      )}

      {/* No containers */}
      {!loading && containers.length === 0 && !error && (
        <div className="text-center py-12">
          <Box className="w-8 h-8 text-text-weaker mx-auto mb-3" />
          <p className="text-sm text-text-weak mb-1">
            No Exegol containers found
          </p>
          <p className="text-xs text-text-weaker">
            Make sure Exegol is installed and you have containers created
          </p>
        </div>
      )}

      {/* Container list */}
      <div className="space-y-2">
        {containers.map((container) => (
          <ContainerRow
            key={container.id}
            container={container}
            onSelect={() => handleSelect(container)}
            onStart={() => handleStart(container)}
          />
        ))}
      </div>

      {/* Refresh button */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => fetchContainers()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-weak hover:text-text-base rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-40"
        >
          <RefreshCw
            className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>
    </div>
  )
}

function ContainerRow({
  container,
  onSelect,
  onStart,
}: {
  container: ExegolContainer
  onSelect: () => void
  onStart: () => void
}) {
  const isRunning = container.state === "running"

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
        isRunning
          ? "bg-surface-1 border-border-base hover:border-accent cursor-pointer hover:bg-surface-2"
          : "bg-surface-1/50 border-border-weak"
      }`}
      onClick={isRunning ? onSelect : undefined}
    >
      {/* Status dot */}
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${
          isRunning ? "bg-status-success" : "bg-text-weaker"
        }`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm truncate ${isRunning ? "text-text-strong" : "text-text-weak"}`}
        >
          {container.name}
        </div>
        <div className="text-xs text-text-weaker truncate">
          {container.image} - {container.status}
        </div>
      </div>

      {/* Action */}
      {isRunning ? (
        <span className="text-xs text-status-success px-2 py-0.5 rounded bg-status-success/10">
          Select
        </span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStart()
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-accent hover:text-accent-hover rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors"
        >
          <Play className="w-3 h-3" />
          Start
        </button>
      )}
    </div>
  )
}
