import {
  useSettingsStore,
  THEMES,
  type Language,
} from "../../stores/settings"
import { t } from "../../i18n/translations"
import { Globe, Volume2, VolumeX, Play } from "lucide-react"
import { Section } from "./SettingsSection"
import { SOUND_OPTIONS, previewSound } from "../../utils/sound"

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English", fr: "Fran\u00e7ais", de: "Deutsch", es: "Espa\u00f1ol", ja: "\u65e5\u672c\u8a9e", zh: "\u4e2d\u6587",
}


export function GeneralSettings() {
  const {
    activeTheme, language: lang,
    soundEnabled, soundId,
    setTheme, setLanguage,
    setSoundEnabled, setSoundId,
  } = useSettingsStore()

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Section title={t(lang, "settings.general.theme")}>
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

      {/* Language */}
      <Section title={t(lang, "settings.general.language")}>
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(LANGUAGE_LABELS) as [Language, string][]).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setLanguage(code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                lang === code
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

      {/* Sounds */}
      <Section title="Sounds">
        <div className="space-y-3">
          {/* Toggle switch */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
              role="switch"
              aria-checked={soundEnabled}
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                soundEnabled ? "bg-accent" : "bg-surface-3"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  soundEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <span className="flex items-center gap-1.5 text-xs text-text-base font-sans">
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-accent" /> : <VolumeX className="w-3.5 h-3.5 text-text-weaker" />}
              {soundEnabled ? "Sound on" : "Sound off"}
            </span>
          </label>
          {soundEnabled && (
            <div className="flex gap-2 flex-wrap">
              {SOUND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setSoundId(opt.id); previewSound(opt.id) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                    soundId === opt.id
                      ? "bg-accent/8 text-accent border border-accent/30"
                      : "bg-surface-0 text-text-weak border border-border-weak hover:border-border-base"
                  }`}
                >
                  <Play className="w-2.5 h-2.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}
