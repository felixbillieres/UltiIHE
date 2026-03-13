import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { useSettingsStore } from "../../stores/settings"
import { useLocalAIStore } from "../../stores/localAI"
import { useContextStore } from "../../stores/context"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { useWebSocket } from "../../hooks/useWebSocket"
import {
  Brain,
  Eye,
  Wrench,
  ChevronDown,
  Cpu,
  Loader2,
  Gauge,
  Zap,
} from "lucide-react"
import { ModelPicker } from "./ModelPicker"

function Separator() {
  return <div className="w-px h-4 bg-border-weak shrink-0" />
}

// ── Context Indicator ─────────────────────────────────────────
// Shows context usage as a compact bar with color coding.
// Green < 50%, Yellow 50-80%, Red > 80%

function ContextIndicator() {
  const info = useContextStore((s) => s.info)
  const [showTooltip, setShowTooltip] = useState(false)
  const [warned80, setWarned80] = useState(false)
  const [warned95, setWarned95] = useState(false)

  // Context overflow warnings
  useEffect(() => {
    if (!info) return
    if (info.percentUsed >= 95 && !warned95) {
      setWarned95(true)
      toast.error("Context nearly full (95%). Consider using /compact to free space.", { duration: 5000 })
    } else if (info.percentUsed >= 80 && !warned80) {
      setWarned80(true)
      toast("Context usage at 80%. Consider compacting soon.", { duration: 3000 })
    }
    // Reset warnings if context drops (after compaction)
    if (info.percentUsed < 70) {
      setWarned80(false)
      setWarned95(false)
    }
  }, [info?.percentUsed])

  if (!info) return null

  const pct = info.percentUsed
  const color =
    pct >= 80 ? "bg-status-error" :
    pct >= 50 ? "bg-status-warning" :
    "bg-status-success"

  const textColor =
    pct >= 80 ? "text-status-error" :
    pct >= 50 ? "text-status-warning" :
    "text-text-weaker"

  // Format token counts compactly: 1234 → "1.2k", 123456 → "123k"
  const fmt = (n: number) =>
    n >= 100_000 ? `${Math.round(n / 1000)}k`
    : n >= 1_000 ? `${(n / 1000).toFixed(1)}k`
    : String(n)

  return (
    <div
      className="relative flex items-center gap-1.5 shrink-0"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Compact bar */}
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2">
        <Gauge className={`w-3 h-3 ${textColor}`} />
        <div className="w-12 h-1.5 rounded-full bg-surface-0 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className={`text-[10px] font-mono ${textColor} tabular-nums`}>
          {pct}%
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-56 bg-surface-2 border border-border-base rounded-lg shadow-xl p-3 pointer-events-none">
          <div className="text-[10px] font-sans text-text-weak space-y-1.5">
            <div className="flex justify-between">
              <span className="text-text-weaker">Context used</span>
              <span className="font-mono text-text-base">{fmt(info.total)} / {fmt(info.limit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-weaker">Free</span>
              <span className="font-mono text-status-success">{fmt(info.free)}</span>
            </div>
            <div className="h-px bg-border-weak my-1" />
            <div className="flex justify-between">
              <span className="text-text-weaker">Prompt tier</span>
              <span className={`font-mono ${
                info.promptTier === "minimal" ? "text-status-warning" :
                info.promptTier === "medium" ? "text-accent" :
                "text-text-base"
              }`}>{info.promptTier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-weaker">Tools</span>
              <span className="font-mono">{info.toolCount}</span>
            </div>
            {info.pruned && (
              <div className="text-status-warning text-[9px] mt-1">
                Old messages pruned to save context
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CapBadge({
  icon,
  label,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick?: () => void
  title?: string
}) {
  const Tag = onClick ? "button" : "span"
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "bg-surface-2 text-text-weaker"
      } ${onClick ? "cursor-pointer hover:bg-accent/15" : ""}`}
    >
      {icon}
      {label}
    </Tag>
  )
}

export function ControlBar() {
  const {
    activeModel,
    activeProvider,
    thinkingEffort,
    cycleThinkingEffort,
    setActiveModel,
    setActiveProvider,
    getActiveModelInfo,
  } = useSettingsStore()
  const approvalMode = useCommandApprovalStore((s) => s.mode)
  const setApprovalMode = useCommandApprovalStore((s) => s.setMode)
  const { send: wsSend } = useWebSocket()

  const server = useLocalAIStore((s) => s.server)
  const serverStarting = useLocalAIStore((s) => s.serverStarting)
  const serverError = useLocalAIStore((s) => s.serverError)
  const modelInfo = getActiveModelInfo()

  const [showModelPicker, setShowModelPicker] = useState(false)
  const modelBtnRef = useRef<HTMLButtonElement>(null)

  // For local models, show the catalog name
  const localCatalog = useLocalAIStore((s) => s.catalog)
  const localEntry = activeProvider === "local" ? localCatalog.find((m) => m.id === activeModel) : null
  const modelDisplayName = localEntry?.name || modelInfo?.name || activeModel.split("/").pop() || activeModel

  // Loading: only when actively starting (serverStarting is set)
  const isLocalStarting = activeProvider === "local" && !!serverStarting
  // Ready: server running AND serving this model
  const isLocalReady = activeProvider === "local" && server.running && server.modelId === activeModel

  // Poll server status while starting so we know when it's ready
  useEffect(() => {
    if (!isLocalStarting) return
    const interval = setInterval(() => {
      useLocalAIStore.getState().fetchServerStatus()
    }, 1000)
    return () => clearInterval(interval)
  }, [isLocalStarting])

  // Handle model selection: auto-start local models, stop when switching away
  const handleModelSelect = async (providerId: string, modelId: string) => {
    const wasLocal = activeProvider === "local"
    const isNowLocal = providerId === "local"
    const store = useLocalAIStore.getState()

    // Switching away from local → stop server
    if (wasLocal && !isNowLocal && server.running) {
      store.stopServer()
    }

    // Switching to a different local model → stop old, start new
    if (isNowLocal && (modelId !== activeModel || !server.running)) {
      if (server.running) {
        await store.stopServer()
      }
      // Start the new model immediately
      store.startServer(modelId).catch(() => {
        // Error is captured in store.serverError
      })
    }

    setActiveProvider(providerId)
    setActiveModel(modelId)
    setShowModelPicker(false)
  }

  return (
    <div className="px-3 pb-2 flex items-center gap-2 min-w-0">
      {/* Model selector */}
      <div className="min-w-0 flex-1">
        <button
          ref={modelBtnRef}
          onClick={() => setShowModelPicker(!showModelPicker)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors min-w-0 max-w-full"
          title={`Model: ${modelDisplayName}\nProvider: ${activeProvider}`}
        >
          {isLocalStarting && <Loader2 className="w-3 h-3 text-accent animate-spin shrink-0" />}
          {isLocalReady && !isLocalStarting && (
            <div className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
          )}
          {activeProvider === "local" && serverError && !isLocalStarting && (
            <div className="w-1.5 h-1.5 rounded-full bg-status-error shrink-0" />
          )}
          <span className="text-xs font-sans text-text-weak truncate">
            {isLocalStarting
              ? `Starting ${localEntry?.name || activeModel}...`
              : modelDisplayName}
          </span>
          <ChevronDown className="w-3 h-3 text-text-weaker shrink-0" />
        </button>

        {showModelPicker && (
          <ModelPicker
            currentProvider={activeProvider}
            currentModel={activeModel}
            onSelect={handleModelSelect}
            onClose={() => setShowModelPicker(false)}
            anchorRef={modelBtnRef as React.RefObject<HTMLElement>}
          />
        )}
      </div>

      {/* Capabilities badges */}
      <div className="flex items-center gap-1 shrink-0">
        {(modelInfo?.reasoning || localEntry?.reasoning) && (
          <CapBadge
            icon={<Brain className="w-3 h-3" />}
            label={thinkingEffort !== "off" ? thinkingEffort : "think"}
            active={thinkingEffort !== "off"}
            onClick={cycleThinkingEffort}
            title="Thinking effort — Click to cycle (off > low > medium > high)"
          />
        )}
        {modelInfo?.vision && (
          <CapBadge
            icon={<Eye className="w-3 h-3" />}
            label="vision"
            active
          />
        )}
        {(modelInfo?.toolCalling || localEntry?.toolCalling) && (
          <CapBadge
            icon={<Wrench className="w-3 h-3" />}
            label="tools"
            active
          />
        )}
        {activeProvider === "local" && (
          <CapBadge
            icon={<Cpu className="w-3 h-3" />}
            label="local"
            active
          />
        )}
      </div>

      <Separator />

      {/* YOLO mode toggle — auto-run all commands and tools without asking */}
      <CapBadge
        icon={<Zap className="w-3 h-3" />}
        label="YOLO"
        active={approvalMode !== "ask"}
        onClick={() => {
          if (approvalMode === "ask") {
            setApprovalMode("auto-run")
            wsSend({ type: "command:set-mode", data: { mode: "auto-run" } })
            wsSend({ type: "tool:set-mode", data: { mode: "auto-run" } })
            toast.success("YOLO mode ON — commands & tools run without approval")
          } else {
            setApprovalMode("ask")
            wsSend({ type: "command:set-mode", data: { mode: "ask" } })
            wsSend({ type: "tool:set-mode", data: { mode: "ask" } })
            toast("YOLO mode OFF — back to approval mode")
          }
        }}
        title={approvalMode !== "ask"
          ? "YOLO mode ON — click to require approval"
          : "Click to enable YOLO mode (auto-run commands & tools)"}
      />

      <Separator />

      {/* Context indicator */}
      <ContextIndicator />
    </div>
  )
}
