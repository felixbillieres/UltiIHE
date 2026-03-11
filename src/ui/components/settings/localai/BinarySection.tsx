import { Download, Server, Check, Loader2, AlertTriangle } from "lucide-react"
import { useLocalAIStore } from "../../../stores/localAI"
import { Section } from "./Section"

export function BinarySection({
  binary,
  installing,
  progress,
  onInstall,
}: {
  binary: ReturnType<typeof useLocalAIStore.getState>["binary"]
  installing: boolean
  progress: ReturnType<typeof useLocalAIStore.getState>["binaryProgress"]
  onInstall: () => void
}) {
  return (
    <Section title="Inference Engine">
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-text-weaker" />
          <div>
            <span className="text-xs text-text-base font-sans font-medium">llama-server</span>
            {binary?.installed && (
              <span className="text-[10px] text-text-weaker font-sans ml-2">
                {binary.version}
              </span>
            )}
          </div>
        </div>
        {binary?.installed ? (
          <span className="flex items-center gap-1 text-[10px] text-status-success font-sans">
            <Check className="w-3 h-3" />
            Installed
          </span>
        ) : installing ? (
          <span className="flex items-center gap-1 text-[10px] text-accent font-sans">
            <Loader2 className="w-3 h-3 animate-spin" />
            {progress?.status === "extracting" ? "Extracting..." : "Downloading..."}
          </span>
        ) : (
          <button
            onClick={onInstall}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-accent text-white rounded-md hover:bg-accent-hover transition-colors font-sans font-medium"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}
      </div>

      {/* Progress bar during install */}
      {installing && progress && (
        <div className="mt-2 px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-weaker font-sans capitalize">
              {progress.status}
            </span>
            <span className="text-[10px] text-accent font-mono">{progress.percent}%</span>
          </div>
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {progress.error && (
            <div className="flex items-center gap-1 mt-1.5">
              <AlertTriangle className="w-3 h-3 text-status-error shrink-0" />
              <span className="text-[10px] text-status-error font-sans">{progress.error}</span>
            </div>
          )}
        </div>
      )}

      {!binary?.installed && !installing && (
        <p className="text-[10px] text-text-weaker font-sans mt-1.5 px-1">
          Downloads ~10 MB binary for your platform. Required to run local models.
        </p>
      )}
    </Section>
  )
}
