import { useState } from "react"
import {
  useSettingsStore,
  type ProviderInfo,
  type ModelInfo,
} from "../../stores/settings"
import { useProviderCatalog } from "../../stores/providerCatalog"
import { t } from "../../i18n/translations"
import {
  Check, ExternalLink, Sparkles, Key, X,
  ChevronDown, ChevronUp, Wrench, Brain, Eye, DollarSign,
} from "lucide-react"
import { ProviderIcon } from "../provider-icons/ProviderIcon"
import { fmtCtx } from "../../utils/format"

// Format cost per 1K tokens
function fmtCost(c?: number): string {
  if (!c) return "—"
  if (c < 0.0001) return `$${(c * 1000).toFixed(3)}/M`
  return `$${c.toFixed(4)}/K`
}

// ── Model detail row ─────────────────────────────────────────

function ModelRow({ model }: { model: ModelInfo }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-2/50 transition-colors">
      {/* Name */}
      <span className="text-[11px] text-text-base font-sans font-medium min-w-0 truncate flex-1">
        {model.name}
      </span>

      {/* Capability badges */}
      <div className="flex items-center gap-1 shrink-0">
        {model.toolCalling && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[8px] font-sans font-medium" title="Tool calling">
            <Wrench className="w-2.5 h-2.5" />
            Tools
          </span>
        )}
        {model.reasoning && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[8px] font-sans font-medium" title="Reasoning">
            <Brain className="w-2.5 h-2.5" />
          </span>
        )}
        {model.vision && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[8px] font-sans font-medium" title="Vision">
            <Eye className="w-2.5 h-2.5" />
          </span>
        )}
      </div>

      {/* Context window */}
      <span className="text-[9px] text-text-weaker font-sans tabular-nums w-10 text-right shrink-0" title={`Context: ${model.contextWindow.toLocaleString()} tokens`}>
        {fmtCtx(model.contextWindow)}
      </span>

      {/* Max output */}
      <span className="text-[9px] text-text-weaker font-sans tabular-nums w-10 text-right shrink-0" title={`Max output: ${model.maxOutput.toLocaleString()} tokens`}>
        →{fmtCtx(model.maxOutput)}
      </span>

      {/* Cost */}
      {(model.costPer1kInput || model.costPer1kOutput) ? (
        <span className="text-[8px] text-text-weaker font-sans tabular-nums w-16 text-right shrink-0" title={`Input: ${fmtCost(model.costPer1kInput)} / Output: ${fmtCost(model.costPer1kOutput)}`}>
          <DollarSign className="w-2 h-2 inline" />
          {fmtCost(model.costPer1kInput)}
        </span>
      ) : (
        <span className="w-16 shrink-0" />
      )}
    </div>
  )
}

// ── Model list panel ─────────────────────────────────────────

function ModelList({ models }: { models: ModelInfo[] }) {
  const toolModels = models.filter((m) => m.toolCalling)
  const noToolModels = models.filter((m) => !m.toolCalling)

  return (
    <div className="mt-2 mb-1">
      {/* Header row */}
      <div className="flex items-center gap-2 px-2 pb-1 border-b border-border-weak mb-1">
        <span className="text-[8px] text-text-weaker font-sans uppercase tracking-wider flex-1">Model</span>
        <span className="text-[8px] text-text-weaker font-sans uppercase tracking-wider w-[68px] text-right">Capabilities</span>
        <span className="text-[8px] text-text-weaker font-sans uppercase tracking-wider w-10 text-right">Ctx</span>
        <span className="text-[8px] text-text-weaker font-sans uppercase tracking-wider w-10 text-right">Out</span>
        <span className="text-[8px] text-text-weaker font-sans uppercase tracking-wider w-16 text-right">Cost</span>
      </div>

      {/* Models with tool calling first */}
      {toolModels.length > 0 && (
        <div>
          {toolModels.map((m) => (
            <ModelRow key={m.id} model={m} />
          ))}
        </div>
      )}

      {/* Models without tool calling */}
      {noToolModels.length > 0 && (
        <div>
          {toolModels.length > 0 && (
            <div className="flex items-center gap-2 px-2 pt-2 pb-1">
              <span className="text-[8px] text-text-weaker/60 font-sans uppercase tracking-wider">No tool calling</span>
              <div className="flex-1 border-b border-border-weak/30" />
            </div>
          )}
          {noToolModels.map((m) => (
            <ModelRow key={m.id} model={m} />
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-3 px-2 pt-2 mt-1 border-t border-border-weak">
        <span className="text-[9px] text-text-weaker font-sans">
          {models.length} models total
        </span>
        <span className="text-[9px] text-accent/70 font-sans">
          {toolModels.length} with tools
        </span>
        {models.some((m) => m.reasoning) && (
          <span className="text-[9px] text-purple-400/70 font-sans">
            {models.filter((m) => m.reasoning).length} with reasoning
          </span>
        )}
        {models.some((m) => m.vision) && (
          <span className="text-[9px] text-blue-400/70 font-sans">
            {models.filter((m) => m.vision).length} with vision
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────

export function ProviderSettings() {
  const { providers, addProvider, updateProvider, language: lang } = useSettingsStore()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)

  const connectedIds = new Set(providers.filter((p) => p.enabled).map((p) => p.id))

  const catalogProviders = useProviderCatalog((s) => s.providers)
  const connected = catalogProviders.filter((cat) => connectedIds.has(cat.id))
  const available = catalogProviders
    .filter((cat) => !connectedIds.has(cat.id))
    .sort((a, b) => (b.freeTier ? 1 : 0) - (a.freeTier ? 1 : 0))

  function handleSaveKey(cat: ProviderInfo) {
    const existing = providers.find((p) => p.id === cat.id)
    if (existing) {
      updateProvider(cat.id, { apiKey: keyInput, enabled: true })
    } else {
      addProvider({
        id: cat.id,
        name: cat.name,
        type: cat.type,
        apiKey: keyInput,
        enabled: true,
        models: cat.models.map((m) => m.id),
      })
    }
    setEditingKey(null)
    setKeyInput("")
  }

  function toggleExpand(id: string) {
    setExpandedProvider((prev) => (prev === id ? null : id))
  }

  // Shared card renderer
  function ProviderCard({ cat, isConnected }: { cat: ProviderInfo; isConnected: boolean }) {
    const isEditing = editingKey === cat.id
    const isExpanded = expandedProvider === cat.id
    const toolCount = cat.models.filter((m) => m.toolCalling).length

    return (
      <div
        key={cat.id}
        className={`relative flex flex-col rounded-xl border transition-all ${
          isEditing
            ? "bg-surface-0 border-accent/30 shadow-md ring-1 ring-accent/10"
            : isConnected
              ? "bg-surface-0 border-accent/20 shadow-sm"
              : "bg-surface-0 border-border-weak hover:border-border-base hover:shadow-sm"
        } ${isExpanded ? "col-span-2 xl:col-span-3" : ""}`}
      >
        <div className="p-4 flex-1 flex flex-col">
          {/* Top-right badge */}
          <div className="absolute top-2.5 right-2.5">
            {isConnected ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success/12 text-status-success">
                <Check className="w-2.5 h-2.5" />
                <span className="text-[9px] font-sans font-medium">Connected</span>
              </div>
            ) : cat.freeTier ? (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-status-success/10 text-status-success text-[9px] font-sans font-medium">
                <Sparkles className="w-2.5 h-2.5" />
                Free tier
              </span>
            ) : null}
          </div>

          {/* Header */}
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
              <ProviderIcon id={cat.id} className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm text-text-strong font-sans font-semibold">{cat.name}</h4>
              <span className="text-[10px] text-text-weaker font-sans">
                {cat.models.length} models
                {toolCount > 0 && toolCount < cat.models.length && (
                  <span className="text-accent/60"> · {toolCount} with tools</span>
                )}
              </span>
            </div>
          </div>

          {cat.description && (
            <p className="text-[10px] text-text-weaker font-sans mb-3 line-clamp-2">{cat.description}</p>
          )}

          {/* Actions row */}
          <div className="mt-auto flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="flex items-center gap-1 text-[10px] text-text-weaker font-sans">
                  <Key className="w-2.5 h-2.5" />
                  API Key
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => updateProvider(cat.id, { enabled: false })}
                  className="text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans"
                >
                  {t(lang, "settings.providers.disconnect")}
                </button>
              </>
            ) : (
              <>
                {cat.signupUrl && (
                  <a
                    href={cat.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-0.5 text-[10px] text-accent/70 hover:text-accent transition-colors font-sans"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Get API key
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                <div className="flex-1" />
                {!isEditing && (
                  <button
                    onClick={() => { setEditingKey(cat.id); setKeyInput("") }}
                    className="px-3 py-1.5 text-[10px] bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors font-sans font-medium"
                  >
                    {t(lang, "settings.providers.connect")}
                  </button>
                )}
              </>
            )}

            {/* Expand/collapse button */}
            {cat.models.length > 0 && (
              <button
                onClick={() => toggleExpand(cat.id)}
                className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors ml-1"
                title={isExpanded ? "Hide models" : "Show models"}
              >
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-text-weaker" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-text-weaker" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* API key input */}
        {isEditing && (
          <div className="px-4 pb-4 space-y-2">
            <div className="flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={t(lang, "settings.providers.apiKeyPlaceholder")}
                className="flex-1 text-xs bg-surface-1 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-sans"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && keyInput.trim()) handleSaveKey(cat)
                  if (e.key === "Escape") setEditingKey(null)
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveKey(cat)}
                disabled={!keyInput.trim()}
                className="flex-1 px-3 py-1.5 text-[10px] bg-accent text-white rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors font-sans font-medium"
              >
                {t(lang, "settings.providers.save")}
              </button>
              <button
                onClick={() => setEditingKey(null)}
                className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X className="w-3 h-3 text-text-weaker" />
              </button>
            </div>
          </div>
        )}

        {/* Expanded model list */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-border-weak mx-4">
            <ModelList models={cat.models} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connected providers */}
      {connected.length > 0 && (
        <div>
          <h3 className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wider mb-3 px-1">
            {t(lang, "settings.providers.connected")}
          </h3>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {connected.map((cat) => (
              <ProviderCard key={cat.id} cat={cat} isConnected />
            ))}
          </div>
        </div>
      )}

      {/* Available providers */}
      <div>
        <h3 className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wider mb-3 px-1">
          {t(lang, "settings.providers.available")}
        </h3>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {available.map((cat) => (
            <ProviderCard key={cat.id} cat={cat} isConnected={false} />
          ))}
        </div>
      </div>
    </div>
  )
}
