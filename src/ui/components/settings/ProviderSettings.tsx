import { useState } from "react"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  type ProviderInfo,
} from "../../stores/settings"
import { t } from "../../i18n/translations"
import { Check, Bot, ExternalLink, Sparkles } from "lucide-react"
import { Section } from "./SettingsSection"

export function ProviderSettings() {
  const { providers, addProvider, updateProvider, language: lang } = useSettingsStore()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")

  const connected = providers.filter((p) => p.enabled)
  const available = PROVIDER_CATALOG
    .filter((cat) => !providers.some((p) => p.id === cat.id && p.enabled))
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
      {connected.length > 0 && (
        <Section title={t(lang, "settings.providers.connected")}>
          <div className="space-y-1.5">
            {connected.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-status-success" />
                  <span className="text-xs text-text-strong font-sans font-medium">{provider.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-weaker font-sans">
                    {t(lang, "settings.providers.apiKey")}
                  </span>
                </div>
                <button
                  onClick={() => updateProvider(provider.id, { enabled: false })}
                  className="text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans"
                >
                  {t(lang, "settings.providers.disconnect")}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={t(lang, "settings.providers.available")}>
        <div className="space-y-2">
          {available.map((cat) => (
            <div key={cat.id} className="rounded-lg bg-surface-0 border border-border-weak overflow-hidden">
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-text-weaker" />
                    <span className="text-xs text-text-base font-sans font-medium">{cat.name}</span>
                    {cat.freeTier && (
                      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-status-success/10 text-status-success font-sans font-medium">
                        <Sparkles className="w-2.5 h-2.5" />
                        {t(lang, "settings.providers.freeTier")}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { setEditingKey(cat.id); setKeyInput("") }}
                    className="text-xs text-accent hover:text-accent-hover transition-colors font-sans"
                  >
                    {t(lang, "settings.providers.connect")}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-[22px]">
                  {cat.description && (
                    <span className="text-[10px] text-text-weaker font-sans">{cat.description}</span>
                  )}
                  <span className="text-[10px] text-text-weaker/60 font-sans">
                    {t(lang, "settings.providers.models", { count: cat.models.length })}
                  </span>
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
                </div>
              </div>
              {editingKey === cat.id && (
                <div className="flex gap-2 px-3 py-2.5 bg-surface-2/50 border-t border-border-weak">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={t(lang, "settings.providers.apiKeyPlaceholder")}
                    className="flex-1 text-xs bg-surface-0 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-sans"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && keyInput.trim()) handleSaveKey(cat)
                      if (e.key === "Escape") setEditingKey(null)
                    }}
                  />
                  <button
                    onClick={() => handleSaveKey(cat)}
                    disabled={!keyInput.trim()}
                    className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors font-sans font-medium"
                  >
                    {t(lang, "settings.providers.save")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
