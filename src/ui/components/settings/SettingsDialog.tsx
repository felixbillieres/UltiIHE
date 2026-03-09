import { useState } from "react"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  THEMES,
  DEFAULT_KEYBINDS,
  type ProviderConfig,
  type ProviderInfo,
  type ReasoningMode,
  type Language,
} from "../../stores/settings"
import { t, type TranslationKey } from "../../i18n/translations"
import {
  X, Check, Palette, Keyboard, Bot, Plug, Globe, Monitor, Sun, Moon,
  Brain, Eye, Wrench, Search, ChevronDown, RotateCcw,
} from "lucide-react"

type Tab = "general" | "providers" | "models" | "keybinds"

interface Props {
  onClose: () => void
}

function useT(key: TranslationKey, params?: Record<string, string | number>) {
  const lang = useSettingsStore((s) => s.language)
  return t(lang, key, params)
}

export function SettingsDialog({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("general")
  const lang = useSettingsStore((s) => s.language)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-surface-1 border border-border-base rounded-xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-weak shrink-0">
          <h2 className="text-sm font-medium text-text-strong font-sans">
            {t(lang, "settings.title")}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-3 transition-colors">
            <X className="w-4 h-4 text-text-weak" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 border-r border-border-weak p-2 shrink-0">
            <TabBtn active={tab === "general"} onClick={() => setTab("general")} icon={<Palette className="w-3.5 h-3.5" />} label={t(lang, "settings.tabs.general")} />
            <TabBtn active={tab === "providers"} onClick={() => setTab("providers")} icon={<Plug className="w-3.5 h-3.5" />} label={t(lang, "settings.tabs.providers")} />
            <TabBtn active={tab === "models"} onClick={() => setTab("models")} icon={<Bot className="w-3.5 h-3.5" />} label={t(lang, "settings.tabs.models")} />
            <TabBtn active={tab === "keybinds"} onClick={() => setTab("keybinds")} icon={<Keyboard className="w-3.5 h-3.5" />} label={t(lang, "settings.tabs.keybinds")} />
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "general" && <GeneralSettings />}
            {tab === "providers" && <ProviderSettings />}
            {tab === "models" && <ModelSettings />}
            {tab === "keybinds" && <KeybindSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-sans transition-colors ${active ? "bg-accent/8 text-accent" : "text-text-weak hover:text-text-base hover:bg-surface-2"}`}>
      {icon}
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English", fr: "Français", de: "Deutsch", es: "Español", ja: "日本語", zh: "中文",
}

const MONO_FONTS = [
  "IBM Plex Mono", "Cascadia Code", "Fira Code", "Hack", "JetBrains Mono",
  "Source Code Pro", "Ubuntu Mono", "Inconsolata", "Roboto Mono", "Iosevka",
]

function GeneralSettings() {
  const {
    activeTheme, colorScheme, fontSize, fontFamily, language,
    setTheme, setColorScheme, setFontSize, setFontFamily, setLanguage,
  } = useSettingsStore()

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Section title={useT("settings.general.theme")}>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition-colors ${
                activeTheme === theme.id
                  ? "border-accent bg-accent/8"
                  : "border-border-weak hover:border-border-base bg-surface-0"
              }`}
            >
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors["surface-0"] }} />
                <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors.accent }} />
                <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors["text-strong"] }} />
              </div>
              <span className="text-[10px] text-text-base font-sans">{theme.name}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Color scheme */}
      <Section title={useT("settings.general.colorScheme")}>
        <div className="flex gap-2">
          {(["dark", "light", "system"] as const).map((scheme) => {
            const Icon = scheme === "dark" ? Moon : scheme === "light" ? Sun : Monitor
            return (
              <button
                key={scheme}
                onClick={() => setColorScheme(scheme)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                  colorScheme === scheme
                    ? "bg-accent/8 text-accent border border-accent/30"
                    : "bg-surface-0 text-text-weak border border-border-weak hover:border-border-base"
                }`}
              >
                <Icon className="w-3 h-3" />
                {useT(`theme.scheme.${scheme}` as TranslationKey)}
              </button>
            )
          })}
        </div>
      </Section>

      {/* Font & size */}
      <Section title={useT("settings.general.fontFamily")}>
        <div className="flex gap-3">
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="flex-1 text-xs bg-surface-0 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-sans"
          >
            {MONO_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-weak font-sans">{useT("settings.general.fontSize")}</span>
            <input
              type="number"
              min={10}
              max={24}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-14 text-xs bg-surface-0 border border-border-base rounded-lg px-2 py-1.5 text-text-base text-center focus:outline-none focus:border-accent/50 font-sans"
            />
          </div>
        </div>
      </Section>

      {/* Language */}
      <Section title={useT("settings.general.language")}>
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(LANGUAGE_LABELS) as [Language, string][]).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setLanguage(code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                language === code
                  ? "bg-accent/8 text-accent border border-accent/30"
                  : "bg-surface-0 text-text-weak border border-border-weak hover:border-border-base"
              }`}
            >
              <Globe className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function ProviderSettings() {
  const { providers, addProvider, updateProvider } = useSettingsStore()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")

  const connected = providers.filter((p) => p.enabled)
  const available = PROVIDER_CATALOG.filter(
    (cat) => !providers.some((p) => p.id === cat.id && p.enabled),
  )

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
        <Section title={useT("settings.providers.connected")}>
          <div className="space-y-1.5">
            {connected.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-status-success" />
                  <span className="text-xs text-text-strong font-sans font-medium">{provider.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-weaker font-sans">
                    {useT("settings.providers.apiKey")}
                  </span>
                </div>
                <button
                  onClick={() => updateProvider(provider.id, { enabled: false })}
                  className="text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans"
                >
                  {useT("settings.providers.disconnect")}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={useT("settings.providers.available")}>
        <div className="space-y-1.5">
          {available.map((cat) => (
            <div key={cat.id}>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
                <div className="flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-text-weaker" />
                  <span className="text-xs text-text-base font-sans font-medium">{cat.name}</span>
                  <span className="text-[10px] text-text-weaker font-sans">
                    {t(useSettingsStore.getState().language, "settings.providers.models", { count: cat.models.length })}
                  </span>
                  {cat.freeTier && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-success/10 text-status-success font-sans font-medium">
                      {useT("settings.providers.freeTier")}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setEditingKey(cat.id); setKeyInput("") }}
                  className="text-xs text-accent hover:text-accent-hover transition-colors font-sans"
                >
                  {useT("settings.providers.connect")}
                </button>
              </div>
              {editingKey === cat.id && (
                <div className="mt-1 flex gap-2 px-3 py-2 rounded-lg bg-surface-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={useT("settings.providers.apiKeyPlaceholder")}
                    className="flex-1 text-xs bg-surface-0 border border-border-base rounded px-2 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-sans"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && keyInput.trim()) handleSaveKey(cat)
                      if (e.key === "Escape") setEditingKey(null)
                    }}
                  />
                  <button
                    onClick={() => handleSaveKey(cat)}
                    disabled={!keyInput.trim()}
                    className="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-accent-hover transition-colors font-sans font-medium"
                  >
                    {useT("settings.providers.save")}
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

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const MODE_COLORS: Record<ReasoningMode, string> = {
  build: "text-status-success",
  plan: "text-accent",
  deep: "text-status-warning",
}

function ModelSettings() {
  const {
    activeProvider, activeModel, activeMode,
    setActiveProvider, setActiveModel, setActiveMode, providers,
  } = useSettingsStore()
  const [search, setSearch] = useState("")

  const connectedIds = new Set(providers.filter((p) => p.enabled).map((p) => p.id))
  const availableProviders = PROVIDER_CATALOG.filter((p) => connectedIds.has(p.id))

  const filteredModels = availableProviders.flatMap((provider) =>
    provider.models
      .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()))
      .map((m) => ({ ...m, provider })),
  )

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
                {useT(`mode.${mode}` as TranslationKey)}
              </span>
              <span className="text-[10px] text-text-weaker">
                {useT(`mode.${mode}.desc` as TranslationKey)}
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
          placeholder={useT("settings.models.search")}
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
                    {useT("settings.models.reasoning")}
                  </span>
                )}
                {model.vision && (
                  <span className="flex items-center gap-0.5 text-[10px] text-accent font-sans">
                    <Eye className="w-2.5 h-2.5" />
                    {useT("settings.models.vision")}
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

// ---------------------------------------------------------------------------
// Keybindings
// ---------------------------------------------------------------------------

function KeybindSettings() {
  const { customKeybinds, getKeybind, setKeybind, resetKeybind, resetAllKeybinds } = useSettingsStore()
  const [recording, setRecording] = useState<string | null>(null)

  const groups = [...new Set(DEFAULT_KEYBINDS.map((k) => k.group))]

  function handleRecord(actionId: string) {
    setRecording(actionId)
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl")
      if (e.shiftKey) parts.push("Shift")
      if (e.altKey) parts.push("Alt")
      const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) parts.push(key)
      if (parts.length > 0 && !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
        setKeybind(actionId, parts.join("+"))
        setRecording(null)
        document.removeEventListener("keydown", handler, true)
      }
    }
    document.addEventListener("keydown", handler, true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-text-strong font-medium font-sans">{useT("settings.keybinds.title")}</h3>
        {Object.keys(customKeybinds).length > 0 && (
          <button
            onClick={resetAllKeybinds}
            className="flex items-center gap-1 text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans"
          >
            <RotateCcw className="w-3 h-3" />
            {useT("settings.keybinds.resetAll")}
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group}>
          <h4 className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wider mb-1.5 px-1">{group}</h4>
          <div className="space-y-0.5">
            {DEFAULT_KEYBINDS.filter((k) => k.group === group).map((action) => {
              const current = getKeybind(action.id)
              const isCustom = action.id in customKeybinds
              const isRecording = recording === action.id
              return (
                <div key={action.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-surface-0 group">
                  <span className="text-xs text-text-weak font-sans">{action.label}</span>
                  <div className="flex items-center gap-1.5">
                    {isCustom && (
                      <button
                        onClick={() => resetKeybind(action.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title={useT("settings.keybinds.reset")}
                      >
                        <RotateCcw className="w-3 h-3 text-text-weaker hover:text-text-weak" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRecord(action.id)}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                        isRecording
                          ? "bg-accent/15 text-accent border border-accent/30 animate-pulse"
                          : isCustom
                            ? "bg-accent/8 text-accent border border-accent/20"
                            : "bg-surface-0 border border-border-base text-text-weaker"
                      }`}
                    >
                      {isRecording ? useT("settings.keybinds.recording") : current}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs text-text-strong font-medium mb-3 font-sans">{title}</h3>
      {children}
    </div>
  )
}
