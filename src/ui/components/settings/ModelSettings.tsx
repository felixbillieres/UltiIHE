import { useState } from "react"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  type ProviderInfo,
  type ReasoningMode,
} from "../../stores/settings"
import { useLocalAIStore } from "../../stores/localAI"
import { t, type TranslationKey } from "../../i18n/translations"
import { Check, Brain, Eye, Wrench, Search, Zap, DollarSign, Cpu, CheckCircle2 } from "lucide-react"
import { Section } from "./SettingsSection"

export const MODE_COLORS: Record<ReasoningMode, string> = {
  build: "text-status-success",
  plan: "text-accent",
  deep: "text-status-warning",
}

type ModelEntry = {
  id: string
  name: string
  provider: ProviderInfo
  contextWindow: number
  maxOutput: number
  reasoning: boolean
  toolCalling: boolean
  vision: boolean
  costPer1kInput?: number
  costPer1kOutput?: number
  isLocal?: boolean
  isLocalRunning?: boolean
}

export function ModelSettings() {
  const {
    activeProvider, activeModel, activeMode, language: lang,
    setActiveProvider, setActiveModel, setActiveMode, providers,
  } = useSettingsStore()
  const [search, setSearch] = useState("")

  // Local AI state — show installed models even if server isn't running
  const { catalog, server } = useLocalAIStore()
  const installedLocal = catalog.filter((m) => m.installed)

  const connectedIds = new Set(providers.filter((p) => p.enabled).map((p) => p.id))
  const availableProviders = PROVIDER_CATALOG.filter((p) => connectedIds.has(p.id))

  // Build local models from installed catalog entries
  const localProvider: ProviderInfo = { id: "local", name: "Local AI", type: "local", models: [] }
  const localModels: ModelEntry[] = installedLocal.map((m) => ({
    id: m.id,
    name: m.name,
    provider: localProvider,
    contextWindow: m.contextWindow,
    maxOutput: 4096,
    reasoning: m.reasoning,
    toolCalling: m.toolCalling,
    vision: false,
    isLocal: true,
    isLocalRunning: server.running && server.modelId === m.id,
  }))

  const filteredModels: ModelEntry[] = [
    ...localModels.filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase())),
    ...availableProviders.flatMap((provider) =>
      provider.models
        .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()))
        .map((m) => ({ ...m, provider })),
    ),
  ]

  // Group by provider for display
  const grouped = new Map<string, { provider: ProviderInfo; models: ModelEntry[] }>()
  for (const model of filteredModels) {
    const key = model.provider.id
    if (!grouped.has(key)) grouped.set(key, { provider: model.provider, models: [] })
    grouped.get(key)!.models.push(model)
  }

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <Section title="Mode">
        <div className="flex gap-2">
          {(["build", "plan", "deep"] as ReasoningMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setActiveMode(mode)}
              className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg text-xs font-sans transition-colors border ${
                activeMode === mode
                  ? "bg-accent/8 border-accent/30"
                  : "bg-surface-0 border-border-weak hover:border-border-base"
              }`}
            >
              <Brain className={`w-4 h-4 ${MODE_COLORS[mode]}`} />
              <span className={`font-medium ${activeMode === mode ? MODE_COLORS[mode] : "text-text-base"}`}>
                {t(lang, `mode.${mode}` as TranslationKey)}
              </span>
              <span className="text-[10px] text-text-weaker">
                {t(lang, `mode.${mode}.desc` as TranslationKey)}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Model search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-weaker" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t(lang, "settings.models.search")}
          className="w-full text-xs bg-surface-0 border border-border-base rounded-lg pl-8 pr-3 py-2 text-text-base focus:outline-none focus:border-accent/50 font-sans"
        />
      </div>

      {/* No providers connected */}
      {availableProviders.length === 0 && localModels.length === 0 && (
        <p className="text-xs text-text-weaker text-center py-4 font-sans">
          Connect a provider first in the Providers tab.
        </p>
      )}

      {/* Model cards grouped by provider */}
      {Array.from(grouped.entries()).map(([providerId, { provider, models }]) => (
        <div key={providerId}>
          <div className="flex items-center gap-2 mb-2 px-1">
            <h3 className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wider">
              {provider.name}
            </h3>
            {providerId === "local" && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-sans font-medium">
                <Cpu className="w-2.5 h-2.5" />
                On-device
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
            {models.map(({ provider: prov, ...model }) => {
              const isActive = activeModel === model.id && activeProvider === prov.id
              const isLocalRunning = model.isLocalRunning
              const isLocal = model.isLocal
              // Local models can only be selected if the server is running with this model
              const canSelect = !isLocal || isLocalRunning

              return (
                <button
                  key={`${prov.id}:${model.id}`}
                  onClick={() => {
                    if (!canSelect) return
                    setActiveProvider(prov.id)
                    setActiveModel(model.id)
                  }}
                  className={`relative flex flex-col p-3 rounded-xl text-left transition-all ${
                    isActive
                      ? "bg-accent/8 border border-accent/30 shadow-sm ring-1 ring-accent/10"
                      : isLocal && !isLocalRunning
                        ? "bg-surface-0/50 border border-border-weak opacity-60"
                        : "bg-surface-0 border border-border-weak hover:border-border-base hover:shadow-sm"
                  } ${!canSelect ? "cursor-default" : ""}`}
                >
                  {/* Status badges */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {isLocalRunning && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-status-success/12 text-status-success text-[9px] font-sans font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                        Running
                      </span>
                    )}
                    {isLocal && !isLocalRunning && (
                      <span className="text-[9px] text-text-weaker font-sans italic">Not running</span>
                    )}
                    {isActive && !isLocal && (
                      <Check className="w-3.5 h-3.5 text-accent" />
                    )}
                    {isActive && isLocalRunning && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                    )}
                  </div>

                  <h4 className="text-xs text-text-strong font-sans font-semibold mb-1 pr-20 truncate">
                    {model.name}
                  </h4>

                  {/* Context & output */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-text-weaker font-mono">
                      {model.contextWindow >= 1_000_000
                        ? `${(model.contextWindow / 1_000_000).toFixed(0)}M ctx`
                        : `${(model.contextWindow / 1_000).toFixed(0)}k ctx`}
                    </span>
                    {isLocal && (
                      <span className="text-[10px] text-text-weaker font-sans">Free</span>
                    )}
                  </div>

                  {/* Capability badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                    {model.reasoning && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-status-warning/10 text-status-warning text-[9px] font-sans">
                        <Brain className="w-2.5 h-2.5" />
                        Reasoning
                      </span>
                    )}
                    {model.vision && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-sans">
                        <Eye className="w-2.5 h-2.5" />
                        Vision
                      </span>
                    )}
                    {model.toolCalling && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-status-success/10 text-status-success text-[9px] font-sans">
                        <Wrench className="w-2.5 h-2.5" />
                        Tools
                      </span>
                    )}
                    {model.costPer1kInput != null && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-surface-2 text-text-weaker text-[9px] font-mono">
                        <DollarSign className="w-2.5 h-2.5" />
                        {model.costPer1kInput}/{model.costPer1kOutput}
                      </span>
                    )}
                    {isLocal && !model.reasoning && !model.costPer1kInput && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-sans">
                        <Cpu className="w-2.5 h-2.5" />
                        Local
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
