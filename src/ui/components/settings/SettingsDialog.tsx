import { useState } from "react"
import { useSettingsStore } from "../../stores/settings"
import { t } from "../../i18n/translations"
import { X, Palette, Keyboard, Bot, Plug, Cpu, Blocks } from "lucide-react"
import { LocalAISettings } from "./LocalAISettings"
import { GeneralSettings } from "./GeneralSettings"
import { ProviderSettings } from "./ProviderSettings"
import { ModelSettings } from "./ModelSettings"
import { KeybindSettings } from "./KeybindSettings"
import { MCPSettings } from "./MCPSettings"

type Tab = "general" | "providers" | "models" | "local" | "keybinds" | "mcp"

interface Props {
  onClose: () => void
}

export function SettingsDialog({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("general")
  const lang = useSettingsStore((s) => s.language)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl mx-4 bg-surface-1 border border-border-base rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
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
            <TabBtn active={tab === "local"} onClick={() => setTab("local")} icon={<Cpu className="w-3.5 h-3.5" />} label="Local AI" />
            <TabBtn active={tab === "keybinds"} onClick={() => setTab("keybinds")} icon={<Keyboard className="w-3.5 h-3.5" />} label={t(lang, "settings.tabs.keybinds")} />
            <TabBtn active={tab === "mcp"} onClick={() => setTab("mcp")} icon={<Blocks className="w-3.5 h-3.5" />} label="MCP Servers" />
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "general" && <GeneralSettings />}
            {tab === "providers" && <ProviderSettings />}
            {tab === "models" && <ModelSettings />}
            {tab === "local" && <LocalAISettings />}
            {tab === "keybinds" && <KeybindSettings />}
            {tab === "mcp" && <MCPSettings />}
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
