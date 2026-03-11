import { useState } from "react"
import { useSettingsStore, DEFAULT_KEYBINDS } from "../../stores/settings"
import { t } from "../../i18n/translations"
import { RotateCcw } from "lucide-react"

export function KeybindSettings() {
  const { customKeybinds, getKeybind, setKeybind, resetKeybind, resetAllKeybinds, language: lang } = useSettingsStore()
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
        <h3 className="text-xs text-text-strong font-medium font-sans">{t(lang, "settings.keybinds.title")}</h3>
        {Object.keys(customKeybinds).length > 0 && (
          <button
            onClick={resetAllKeybinds}
            className="flex items-center gap-1 text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans"
          >
            <RotateCcw className="w-3 h-3" />
            {t(lang, "settings.keybinds.resetAll")}
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
                        title={t(lang, "settings.keybinds.reset")}
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
                      {isRecording ? t(lang, "settings.keybinds.recording") : current}
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
