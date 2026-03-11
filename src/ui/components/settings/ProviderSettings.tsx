import { useState } from "react"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  type ProviderInfo,
} from "../../stores/settings"
import { t } from "../../i18n/translations"
import { Check, ExternalLink, Sparkles, Key, X, Zap, Cloud, Shield, Cpu } from "lucide-react"

// Provider icons by type/id — gives each card a distinct feel
const PROVIDER_ICONS: Record<string, { icon: typeof Cloud; color: string }> = {
  anthropic: { icon: Shield, color: "text-orange-400" },
  openai: { icon: Zap, color: "text-emerald-400" },
  google: { icon: Cloud, color: "text-blue-400" },
  mistral: { icon: Zap, color: "text-orange-300" },
  groq: { icon: Cpu, color: "text-purple-400" },
  openrouter: { icon: Cloud, color: "text-pink-400" },
  xai: { icon: Zap, color: "text-gray-300" },
  deepseek: { icon: Cpu, color: "text-cyan-400" },
  togetherai: { icon: Cloud, color: "text-indigo-400" },
  perplexity: { icon: Zap, color: "text-teal-400" },
  fireworks: { icon: Zap, color: "text-amber-400" },
  cerebras: { icon: Cpu, color: "text-violet-400" },
  cohere: { icon: Cloud, color: "text-rose-400" },
}

export function ProviderSettings() {
  const { providers, addProvider, updateProvider, language: lang } = useSettingsStore()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")

  const connectedIds = new Set(providers.filter((p) => p.enabled).map((p) => p.id))

  // Split into connected and available
  const connected = PROVIDER_CATALOG.filter((cat) => connectedIds.has(cat.id))
  const available = PROVIDER_CATALOG
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

  return (
    <div className="space-y-6">
      {/* Connected providers */}
      {connected.length > 0 && (
        <div>
          <h3 className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wider mb-3 px-1">
            {t(lang, "settings.providers.connected")}
          </h3>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {connected.map((cat) => {
              const iconDef = PROVIDER_ICONS[cat.id]
              const Icon = iconDef?.icon || Cloud
              const iconColor = iconDef?.color || "text-text-weaker"

              return (
                <div
                  key={cat.id}
                  className="relative flex flex-col p-4 rounded-xl bg-surface-0 border border-accent/20 shadow-sm"
                >
                  {/* Connected badge */}
                  <div className="absolute top-2.5 right-2.5">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success/12 text-status-success">
                      <Check className="w-2.5 h-2.5" />
                      <span className="text-[9px] font-sans font-medium">Connected</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div>
                      <h4 className="text-sm text-text-strong font-sans font-semibold">{cat.name}</h4>
                      <span className="text-[10px] text-text-weaker font-sans">
                        {cat.models.length} models
                      </span>
                    </div>
                  </div>

                  {cat.description && (
                    <p className="text-[10px] text-text-weaker font-sans mb-3 line-clamp-2">{cat.description}</p>
                  )}

                  <div className="mt-auto flex items-center gap-2">
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
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available providers */}
      <div>
        <h3 className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wider mb-3 px-1">
          {t(lang, "settings.providers.available")}
        </h3>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {available.map((cat) => {
            const iconDef = PROVIDER_ICONS[cat.id]
            const Icon = iconDef?.icon || Cloud
            const iconColor = iconDef?.color || "text-text-weaker"
            const isEditing = editingKey === cat.id

            return (
              <div
                key={cat.id}
                className={`relative flex flex-col rounded-xl border transition-all ${
                  isEditing
                    ? "bg-surface-0 border-accent/30 shadow-md ring-1 ring-accent/10"
                    : "bg-surface-0 border-border-weak hover:border-border-base hover:shadow-sm"
                }`}
              >
                <div className="p-4 flex-1 flex flex-col">
                  {/* Free tier badge */}
                  {cat.freeTier && (
                    <div className="absolute top-2.5 right-2.5">
                      <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-status-success/10 text-status-success text-[9px] font-sans font-medium">
                        <Sparkles className="w-2.5 h-2.5" />
                        Free tier
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div>
                      <h4 className="text-sm text-text-strong font-sans font-semibold">{cat.name}</h4>
                      <span className="text-[10px] text-text-weaker font-sans">
                        {cat.models.length} models
                      </span>
                    </div>
                  </div>

                  {cat.description && (
                    <p className="text-[10px] text-text-weaker font-sans mb-3 line-clamp-2">{cat.description}</p>
                  )}

                  <div className="mt-auto flex items-center gap-2">
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
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
