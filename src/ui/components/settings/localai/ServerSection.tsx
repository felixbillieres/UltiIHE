import { Square } from "lucide-react"
import { useLocalAIStore } from "../../../stores/localAI"
import { Section } from "./Section"

export function ServerSection({
  server,
  startingModel,
  onStop,
}: {
  server: ReturnType<typeof useLocalAIStore.getState>["server"]
  startingModel: string | null
  onStop: () => void
}) {
  if (!server.running && !startingModel) return null

  return (
    <Section title="Server">
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${server.running ? "bg-status-success animate-pulse" : "bg-status-warning animate-pulse"}`} />
          <div>
            <span className="text-xs text-text-base font-sans font-medium">
              {server.running ? server.modelId : startingModel}
            </span>
            {server.running && server.baseUrl && (
              <span className="text-[10px] text-text-weaker font-sans ml-2">
                {server.baseUrl}
              </span>
            )}
            {startingModel && !server.running && (
              <span className="text-[10px] text-status-warning font-sans ml-2">
                Loading model...
              </span>
            )}
          </div>
        </div>
        {server.running && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-status-error/15 text-status-error rounded-md hover:bg-status-error/25 transition-colors font-sans font-medium"
          >
            <Square className="w-2.5 h-2.5" />
            Stop
          </button>
        )}
      </div>
    </Section>
  )
}
