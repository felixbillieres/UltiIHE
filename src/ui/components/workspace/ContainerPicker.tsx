import { useEffect } from "react"
import { useExegolStore } from "../../stores/exegol"
import { useProjectStore } from "../../stores/project"
import {
  Box,
  Play,
  RefreshCw,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react"

interface Props {
  projectId: string
}

export function ContainerPicker({ projectId }: Props) {
  const {
    containers,
    loading,
    error,
    actionLoading,
    fetchInfo,
    startContainer,
  } = useExegolStore()
  const addContainerToProject = useProjectStore((s) => s.addContainerToProject)

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  async function handleSelect(dockerName: string) {
    addContainerToProject(projectId, dockerName)
  }

  async function handleStart(name: string) {
    await startContainer(name)
  }

  return (
    <div className="w-full max-w-lg px-6">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Box className="w-5 h-5 text-accent" />
          <h2 className="text-lg text-text-strong font-sans">Select Container</h2>
        </div>
        <p className="text-sm text-text-weak font-sans">
          Choose an Exegol container for this engagement
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 mb-4 rounded-lg bg-status-error/10 border border-status-error/20">
          <AlertTriangle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
          <pre className="text-xs text-status-error whitespace-pre-wrap break-words font-sans flex-1 min-w-0">
            {error}
          </pre>
          <button
            onClick={() => useExegolStore.setState({ error: null })}
            className="p-0.5 rounded hover:bg-status-error/20 shrink-0"
          >
            <X className="w-3 h-3 text-status-error" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && containers.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-text-weaker animate-spin" />
          <span className="ml-2 text-sm text-text-weaker font-sans">
            Scanning for Exegol containers...
          </span>
        </div>
      )}

      {/* No containers */}
      {!loading && containers.length === 0 && !error && (
        <div className="text-center py-12">
          <Box className="w-8 h-8 text-text-weaker mx-auto mb-3" />
          <p className="text-sm text-text-weak mb-1 font-sans">
            No Exegol containers found
          </p>
          <p className="text-xs text-text-weaker font-sans">
            Make sure Exegol is installed and you have containers created
          </p>
        </div>
      )}

      {/* Container list */}
      <div className="space-y-2">
        {containers.map((c) => {
          const isRunning = c.state.toLowerCase() === "running"
          const isStarting = actionLoading === `${c.name}-start`

          return (
            <div
              key={c.name}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                isRunning
                  ? "bg-surface-1 border-border-base hover:border-accent cursor-pointer hover:bg-surface-2"
                  : "bg-surface-1/50 border-border-weak"
              }`}
              onClick={isRunning ? () => handleSelect(c.dockerName) : undefined}
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
                  className={`text-sm truncate font-sans ${isRunning ? "text-text-strong" : "text-text-weak"}`}
                >
                  {c.name}
                </div>
                <div className="text-xs text-text-weaker truncate font-sans">
                  {c.image} — {c.state}
                  {c.config && c.config !== "Default" && ` — ${c.config}`}
                </div>
              </div>

              {/* Action */}
              {isRunning ? (
                <span className="text-xs text-status-success px-2 py-0.5 rounded bg-status-success/10 font-sans">
                  Select
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStart(c.name)
                  }}
                  disabled={isStarting}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-accent hover:text-accent-hover rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors disabled:opacity-40 font-sans"
                >
                  {isStarting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  {isStarting ? "Starting..." : "Start"}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Refresh button */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => fetchInfo()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-weak hover:text-text-base rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-40 font-sans"
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
