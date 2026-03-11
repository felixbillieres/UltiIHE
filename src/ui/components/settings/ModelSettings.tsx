import { useState } from "react"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  type ProviderInfo,
  type ReasoningMode,
} from "../../stores/settings"
import { t, type TranslationKey } from "../../i18n/translations"
import { Check, Brain, Eye, Wrench, Search } from "lucide-react"
import { Section } from "./SettingsSection"

export const MODE_COLORS: Record<ReasoningMode, string> = {
  build: "text-status-success",
  plan: "text-accent",
  deep: "text-status-warning",
}

export function ModelSettings() {
  const {
    activeProvider, activeModel, activeMode, language: lang,
    setActiveProvider, setActiveModel, setActiveMode, providers,
  } = useSettingsStore()
  const [search, setSearch] = useState("")

  const connectedIds = new Set(providers.filter((p) => p.enabled).map((p) => p.id))
  const availableProviders = PROVIDER_CATALOG.filter((p) => connectedIds.has(p.id))

  // Include local models if local provider is connected
  const localProvider = providers.find((p) => p.id === "local" && p.enabled)
  const localModels: { id: string; name: string; provider: ProviderInfo; contextWindow: number; maxOutput: number; reasoning: boolean; toolCalling: boolean; vision: boolean; costPer1kInput?: number; costPer1kOutput?: number }[] = []
  if (localProvider) {
    for (const modelId of localProvider.models) {
      localModels.push({
        id: modelId,
        name: `${modelId} (local)`,
        provider: { id: "local", name: "Local AI", type: "local", models: [] },
        contextWindow: 32_768,
        maxOutput: 4096,
        reasoning: false,
        toolCalling: true,
        vision: false,
      })
    }
  }

  const filteredModels = [
    ...localModels.filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase())),
    ...availableProviders.flatMap((provider) =>
      provider.models
        .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()))
        .map((m) => ({ ...m, provider })),
    ),
  ]

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
      {availableProviders.length === 0 && (
        <p className="text-xs text-text-weaker text-center py-4 font-sans">
          Connect a provider first in the Providers tab.
        </p>
      )}

      {/* Model list */}
      <div className="space-y-1">
        {filteredModels.map(({ provider, ...model }) => (
          <button
            key={`${provider.id}:${model.id}`}
            onClick={() => {
              setActiveProvider(provider.id)
              setActiveModel(model.id)
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              activeModel === model.id && activeProvider === provider.id
                ? "bg-accent/8 border border-accent/30"
                : "bg-surface-0 border border-border-weak hover:border-border-base"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-strong font-sans font-medium truncate">{model.name}</span>
                <span className="text-[10px] text-text-weaker font-sans shrink-0">{provider.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-text-weaker font-mono">
                  {model.contextWindow >= 1_000_000
                    ? `${(model.contextWindow / 1_000_000).toFixed(0)}M`
                    : `${(model.contextWindow / 1_000).toFixed(0)}k`}
                </span>
                {model.reasoning && (
                  <span className="flex items-center gap-0.5 text-[10px] text-status-warning font-sans">
                    <Brain className="w-2.5 h-2.5" />
                    {t(lang, "settings.models.reasoning")}
                  </span>
                )}
                {model.vision && (
                  <span className="flex items-center gap-0.5 text-[10px] text-accent font-sans">
                    <Eye className="w-2.5 h-2.5" />
                    {t(lang, "settings.models.vision")}
                  </span>
                )}
                {model.toolCalling && (
                  <span className="flex items-center gap-0.5 text-[10px] text-status-success font-sans">
                    <Wrench className="w-2.5 h-2.5" />
                  </span>
                )}
                {model.costPer1kInput != null && (
                  <span className="text-[10px] text-text-weaker font-mono">
                    ${model.costPer1kInput}/{model.costPer1kOutput}
                  </span>
                )}
              </div>
            </div>
            {activeModel === model.id && activeProvider === provider.id && (
              <Check className="w-3.5 h-3.5 text-accent shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
