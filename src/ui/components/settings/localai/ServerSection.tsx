import { Square, Loader2, Cpu, CheckCircle2, Radio } from "lucide-react"
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
      {/* Starting state — prominent loading indicator */}
      {startingModel && !server.running && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-accent/5 to-accent/10 border border-accent/20 p-4">
          {/* Animated shimmer bar */}
          <div className="absolute inset-x-0 top-0 h-1 bg-surface-2 overflow-hidden">
            <div className="h-full w-1/3 bg-accent rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
              style={{ animation: "shimmer 1.5s ease-in-out infinite" }} />
          </div>
          <style>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(400%); }
            }
          `}</style>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
            </div>
            <div>
              <p className="text-sm text-text-strong font-sans font-semibold">Loading model...</p>
              <p className="text-[10px] text-text-weaker font-sans mt-0.5">
                <span className="font-medium text-accent">{startingModel}</span> — Loading weights into memory, this can take up to 60s
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 ml-[52px]">
            <div className="flex items-center gap-1.5 text-[10px] text-text-weaker font-sans">
              <Cpu className="w-3 h-3" />
              Allocating VRAM...
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-text-weaker font-sans">
              <Radio className="w-3 h-3" />
              Waiting for health check...
            </div>
          </div>
        </div>
      )}

      {/* Running state — green success banner */}
      {server.running && (
        <div className="rounded-xl bg-status-success/5 border border-status-success/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-status-success/12 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-status-success" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-text-strong font-sans font-semibold">{server.modelId}</p>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success/12 text-status-success text-[9px] font-sans font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                    Running
                  </span>
                </div>
                {server.baseUrl && (
                  <p className="text-[10px] text-text-weaker font-mono mt-0.5">{server.baseUrl}</p>
                )}
              </div>
            </div>
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] bg-status-error/10 text-status-error rounded-lg hover:bg-status-error/20 transition-colors font-sans font-medium"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}
