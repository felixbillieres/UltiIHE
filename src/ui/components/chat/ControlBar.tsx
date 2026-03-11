import { useState, useRef, useEffect } from "react"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  AGENTS,
  type AgentId,
} from "../../stores/settings"
import {
  Brain,
  Eye,
  Wrench,
  Zap,
  ChevronDown,
} from "lucide-react"

function Separator() {
  return <div className="w-px h-4 bg-border-weak shrink-0" />
}

function agentColorBg(agent: AgentId): string {
  switch (agent) {
    case "build":
      return "bg-accent"
    case "recon":
      return "bg-cyan-400"
    case "exploit":
      return "bg-red-400"
    case "report":
      return "bg-purple-400"
    default:
      return "bg-text-weaker"
  }
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
    activeAgent,
    activeModel,
    activeProvider,
    thinkingEffort,
    cycleAgent,
    cycleThinkingEffort,
    setActiveModel,
    setActiveProvider,
    getActiveModelInfo,
  } = useSettingsStore()

  const modelInfo = getActiveModelInfo()
  const agentInfo = AGENTS.find((a) => a.id === activeAgent)

  const [showModelPicker, setShowModelPicker] = useState(false)

  const modelDisplayName = modelInfo?.name || activeModel.split("/").pop() || activeModel

  return (
    <div className="px-3 pb-2 flex items-center gap-2 min-w-0">
      {/* Agent selector */}
      <button
        onClick={cycleAgent}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors shrink-0"
        title={`Agent: ${agentInfo?.name} — Click to cycle\n${agentInfo?.description}`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${agentColorBg(activeAgent)}`}
        />
        <span className="text-xs font-sans font-medium text-text-base capitalize">
          {agentInfo?.name || activeAgent}
        </span>
      </button>

      <Separator />

      {/* Model selector */}
      <div className="relative min-w-0 flex-1">
        <button
          onClick={() => setShowModelPicker(!showModelPicker)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors min-w-0 max-w-full"
          title={`Model: ${modelDisplayName}\nProvider: ${activeProvider}`}
        >
          <span className="text-xs font-sans text-text-weak truncate">
            {modelDisplayName}
          </span>
          <ChevronDown className="w-3 h-3 text-text-weaker shrink-0" />
        </button>

        {showModelPicker && (
          <ModelPicker
            currentProvider={activeProvider}
            currentModel={activeModel}
            onSelect={(providerId, modelId) => {
              setActiveProvider(providerId)
              setActiveModel(modelId)
              setShowModelPicker(false)
            }}
            onClose={() => setShowModelPicker(false)}
          />
        )}
      </div>

      {/* Capabilities badges */}
      <div className="flex items-center gap-1 shrink-0">
        {modelInfo?.reasoning && (
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
        {modelInfo?.toolCalling && (
          <CapBadge
            icon={<Wrench className="w-3 h-3" />}
            label="tools"
            active
          />
        )}
      </div>
    </div>
  )
}

function ModelPicker({
  currentProvider,
  currentModel,
  onSelect,
  onClose,
}: {
  currentProvider: string
  currentModel: string
  onSelect: (providerId: string, modelId: string) => void
  onClose: () => void
}) {
  const providers = useSettingsStore((s) => s.providers)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [onClose])

  const configuredProviderIds = new Set(
    providers.filter((p) => p.apiKey).map((p) => p.id),
  )

  const availableProviders = PROVIDER_CATALOG.filter((p) =>
    configuredProviderIds.has(p.id),
  )

  if (availableProviders.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute bottom-full left-0 mb-1 z-50 w-64 bg-surface-2 border border-border-base rounded-lg shadow-xl p-3"
      >
        <p className="text-xs text-text-weaker font-sans">
          No providers configured. Go to Settings to add an API key.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 z-50 w-72 max-h-[300px] overflow-y-auto bg-surface-2 border border-border-base rounded-lg shadow-xl py-1"
    >
      {availableProviders.map((provider) => (
        <div key={provider.id}>
          <div className="px-3 py-1.5 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium">
            {provider.name}
          </div>
          {provider.models.map((model) => {
            const isSelected =
              provider.id === currentProvider && model.id === currentModel
            return (
              <button
                key={model.id}
                onClick={() => onSelect(provider.id, model.id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent"
                    : "text-text-base hover:bg-surface-3"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-sans truncate">{model.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-weaker font-mono">
                      {(model.contextWindow / 1000).toFixed(0)}k ctx
                    </span>
                    {model.reasoning && (
                      <span className="text-[10px] text-purple-400">
                        reasoning
                      </span>
                    )}
                    {model.vision && (
                      <span className="text-[10px] text-blue-400">vision</span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <Zap className="w-3 h-3 text-accent shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
