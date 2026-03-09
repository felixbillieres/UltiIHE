import { useState } from "react"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  type ProviderConfig,
} from "../../stores/settings"
import { X, Check, Eye, EyeOff, Palette, Keyboard, Bot, Plug } from "lucide-react"

type Tab = "general" | "providers" | "keybinds"

interface Props {
  onClose: () => void
}

export function SettingsDialog({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("providers")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl mx-4 bg-surface-1 border border-border-base rounded-xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-weak shrink-0">
          <h2 className="text-sm font-medium text-text-strong font-sans">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-3 transition-colors"
          >
            <X className="w-4 h-4 text-text-weak" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Tab list */}
          <div className="w-44 border-r border-border-weak p-2 shrink-0">
            <SettingsTab
              active={tab === "general"}
              onClick={() => setTab("general")}
              icon={<Palette className="w-3.5 h-3.5" />}
              label="General"
            />
            <SettingsTab
              active={tab === "providers"}
              onClick={() => setTab("providers")}
              icon={<Plug className="w-3.5 h-3.5" />}
              label="Providers"
            />
            <SettingsTab
              active={tab === "keybinds"}
              onClick={() => setTab("keybinds")}
              icon={<Keyboard className="w-3.5 h-3.5" />}
              label="Keybindings"
            />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "general" && <GeneralSettings />}
            {tab === "providers" && <ProviderSettings />}
            {tab === "keybinds" && <KeybindSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-sans transition-colors ${
        active
          ? "bg-accent/8 text-accent"
          : "text-text-weak hover:text-text-base hover:bg-surface-2"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function GeneralSettings() {
  const { appearance, setTheme, setFontSize, setFontFamily } =
    useSettingsStore()

  const fonts = [
    "Inter",
    "JetBrains Mono",
    "Fira Code",
    "Cascadia Code",
    "IBM Plex Mono",
    "Hack",
    "Inconsolata",
    "Source Code Pro",
    "Ubuntu Mono",
  ]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs text-text-strong font-medium mb-3 font-sans">
          Appearance
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-weak font-sans">Theme</span>
            <select
              value={appearance.theme}
              onChange={(e) =>
                setTheme(e.target.value as "dark" | "light" | "system")
              }
              className="text-xs bg-surface-0 border border-border-base rounded px-2 py-1 text-text-base focus:outline-none focus:border-accent/50 font-sans"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-weak font-sans">Font size</span>
            <input
              type="number"
              min={10}
              max={24}
              value={appearance.fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-16 text-xs bg-surface-0 border border-border-base rounded px-2 py-1 text-text-base text-center focus:outline-none focus:border-accent/50 font-sans"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-weak font-sans">Font family</span>
            <select
              value={appearance.fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="text-xs bg-surface-0 border border-border-base rounded px-2 py-1 text-text-base focus:outline-none focus:border-accent/50 font-sans"
            >
              {fonts.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProviderSettings() {
  const { providers, addProvider, updateProvider, removeProvider } =
    useSettingsStore()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")

  const connected = providers.filter((p) => p.enabled)
  const available = PROVIDER_CATALOG.filter(
    (cat) => !providers.some((p) => p.id === cat.id && p.enabled),
  )

  function handleConnect(catalogEntry: (typeof PROVIDER_CATALOG)[0]) {
    setEditingKey(catalogEntry.id)
    setKeyInput("")
  }

  function handleSaveKey(catalogEntry: (typeof PROVIDER_CATALOG)[0]) {
    const existing = providers.find((p) => p.id === catalogEntry.id)
    if (existing) {
      updateProvider(catalogEntry.id, {
        apiKey: keyInput,
        enabled: true,
      })
    } else {
      addProvider({
        ...catalogEntry,
        apiKey: keyInput,
        enabled: true,
      })
    }
    setEditingKey(null)
    setKeyInput("")
  }

  return (
    <div className="space-y-6">
      {/* Connected */}
      {connected.length > 0 && (
        <div>
          <h3 className="text-xs text-text-strong font-medium mb-3 font-sans">
            Connected
          </h3>
          <div className="space-y-1.5">
            {connected.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-status-success" />
                  <span className="text-xs text-text-strong font-sans font-medium">
                    {provider.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-weaker font-sans">
                    API Key
                  </span>
                </div>
                <button
                  onClick={() =>
                    updateProvider(provider.id, { enabled: false })
                  }
                  className="text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available */}
      <div>
        <h3 className="text-xs text-text-strong font-medium mb-3 font-sans">
          Available Providers
        </h3>
        <div className="space-y-1.5">
          {available.map((cat) => (
            <div key={cat.id}>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
                <div className="flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-text-weaker" />
                  <span className="text-xs text-text-base font-sans font-medium">
                    {cat.name}
                  </span>
                  <span className="text-[10px] text-text-weaker font-sans">
                    {cat.models.length} models
                  </span>
                  {cat.freeTier && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-success/10 text-status-success font-sans font-medium">
                      Free tier
                    </span>
                  )}
                  {cat.freeNote && !cat.freeTier && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/8 text-accent font-sans">
                      {cat.freeNote}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleConnect(cat)}
                  className="text-xs text-accent hover:text-accent-hover transition-colors font-sans"
                >
                  Connect
                </button>
              </div>
              {editingKey === cat.id && (
                <div className="mt-1 flex gap-2 px-3 py-2 rounded-lg bg-surface-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={`${cat.name} API key`}
                    className="flex-1 text-xs bg-surface-0 border border-border-base rounded px-2 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-sans"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && keyInput.trim())
                        handleSaveKey(cat)
                      if (e.key === "Escape") setEditingKey(null)
                    }}
                  />
                  <button
                    onClick={() => handleSaveKey(cat)}
                    disabled={!keyInput.trim()}
                    className="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-accent-hover transition-colors font-sans font-medium"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KeybindSettings() {
  const keybinds = [
    { action: "Send message", key: "Enter" },
    { action: "New line", key: "Shift+Enter" },
    { action: "New session", key: "Ctrl+N" },
    { action: "Toggle sidebar", key: "Ctrl+B" },
    { action: "Settings", key: "Ctrl+," },
    { action: "Command palette", key: "Ctrl+Shift+P" },
  ]

  return (
    <div>
      <h3 className="text-xs text-text-strong font-medium mb-3 font-sans">
        Keyboard Shortcuts
      </h3>
      <div className="space-y-1">
        {keybinds.map(({ action, key }) => (
          <div
            key={action}
            className="flex items-center justify-between px-3 py-2 rounded hover:bg-surface-0"
          >
            <span className="text-xs text-text-weak font-sans">{action}</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-base text-text-weaker font-mono">
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}
