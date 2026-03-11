import { useEffect } from "react"
import { Terminal, X, Wrench, ExternalLink, Loader2 } from "lucide-react"
import { useWebToolsStore, WEB_TOOLS } from "../../stores/webtools"
import { TOOL_ICONS_SM } from "./terminalConstants"

// ─── Container picker modal ─────────────────────────────────

interface ContainerPickerModalProps {
  toolId: string
  containerIds: string[]
  onPick: (toolId: string, container: string) => void
  onCancel: () => void
}

export function ContainerPickerModal({
  toolId,
  containerIds,
  onPick,
  onCancel,
}: ContainerPickerModalProps) {
  const tool = WEB_TOOLS.find((t) => t.id === toolId)

  // If only one container, auto-pick
  useEffect(() => {
    if (containerIds.length === 1) {
      onPick(toolId, containerIds[0])
    }
  }, [containerIds, toolId, onPick])

  // Don't render if auto-picking
  if (containerIds.length <= 1) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-surface-1 border border-border-weak rounded-xl shadow-2xl w-[360px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-weak">
          <div className="flex items-center gap-2.5">
            {TOOL_ICONS_SM[tool?.icon || ""]}
            <h2 className="text-sm font-sans font-semibold text-text-strong">
              Launch {tool?.name}
            </h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-surface-2 transition-colors">
            <X className="w-4 h-4 text-text-weaker" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-xs text-text-weak font-sans mb-3">
            Select a container to run {tool?.name} in:
          </p>
          <div className="space-y-1.5">
            {containerIds.map((cid) => (
              <button
                key={cid}
                onClick={() => onPick(toolId, cid)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-md bg-surface-0 hover:bg-surface-2 border border-border-weak hover:border-accent/30 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-text-weaker shrink-0" />
                <span className="text-xs font-mono text-text-base">{cid}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tool close confirmation modal ──────────────────────────

interface ToolCloseConfirmModalProps {
  toolId: string
  container?: string
  onConfirm: (toolId: string) => void
  onCancel: () => void
}

export function ToolCloseConfirmModal({
  toolId,
  container,
  onConfirm,
  onCancel,
}: ToolCloseConfirmModalProps) {
  const tool = WEB_TOOLS.find((t) => t.id === toolId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-surface-1 border border-border-weak rounded-xl shadow-2xl w-[380px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border-weak">
          <div className="flex items-center gap-2.5">
            {TOOL_ICONS_SM[tool?.icon || ""]}
            <h2 className="text-sm font-sans font-semibold text-text-strong">
              Stop {tool?.name}?
            </h2>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-text-weak font-sans leading-relaxed">
            This will stop all {tool?.name} processes
            {container && (
              <> running in <span className="font-mono text-accent">{container.replace(/^exegol-/, "")}</span></>
            )}
            {" "}and close the tab.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-weak">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-sans rounded-md text-text-weak hover:text-text-base hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(toolId)}
            className="px-3 py-1.5 text-xs font-sans font-medium rounded-md bg-red-500/80 hover:bg-red-500 text-white transition-colors"
          >
            Stop & Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Web tools settings modal ───────────────────────────────

interface WebToolsSettingsProps {
  onClose: () => void
}

export function WebToolsSettings({ onClose }: WebToolsSettingsProps) {
  const runningTools = useWebToolsStore((s) => s.runningTools)
  const stopTool = useWebToolsStore((s) => s.stopTool)
  const getProxyUrl = useWebToolsStore((s) => s.getProxyUrl)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-1 border border-border-weak rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-weak">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-text-weak" />
            <h2 className="text-sm font-sans font-semibold text-text-strong">Web Tools</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-2 transition-colors">
            <X className="w-4 h-4 text-text-weaker" />
          </button>
        </div>

        {/* Tool list */}
        <div className="p-5 space-y-4">
          {WEB_TOOLS.map((tool) => {
            const running = runningTools[tool.id]
            return (
              <div key={tool.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-0 border border-border-weak">
                <span className="text-text-weak shrink-0">{TOOL_ICONS_SM[tool.icon]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-sans font-medium text-text-strong">{tool.name}</div>
                  {running ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {running.status === "ready" && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-sans">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Running in {running.container}
                        </span>
                      )}
                      {running.status === "starting" && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-sans">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          Starting in {running.container}...
                        </span>
                      )}
                      {running.status === "error" && (
                        <span className="text-[10px] text-red-400 font-sans">
                          Error: {running.error?.slice(0, 80)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-weaker font-sans">Not running</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {running?.status === "ready" && (
                    <>
                      <a
                        href={getProxyUrl(tool.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-3 text-text-weak hover:text-text-base transition-colors"
                        title="Open in browser"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        onClick={() => stopTool(tool.id)}
                        className="px-2 py-1 text-[10px] font-sans rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-border-weak text-[10px] text-text-weaker font-sans">
          Tools are launched inside Exegol containers and proxied through the server.
        </div>
      </div>
    </div>
  )
}
