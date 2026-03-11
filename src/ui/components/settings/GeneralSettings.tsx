import {
  useSettingsStore,
  THEMES,
  type Language,
} from "../../stores/settings"
import { t, type TranslationKey } from "../../i18n/translations"
import { Globe, Monitor, Sun, Moon } from "lucide-react"
import { Section } from "./SettingsSection"

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English", fr: "Fran\u00e7ais", de: "Deutsch", es: "Espa\u00f1ol", ja: "\u65e5\u672c\u8a9e", zh: "\u4e2d\u6587",
}

const MONO_FONTS = [
  "IBM Plex Mono", "Cascadia Code", "Fira Code", "Hack", "JetBrains Mono",
  "Source Code Pro", "Ubuntu Mono", "Inconsolata", "Roboto Mono", "Iosevka",
]

export function GeneralSettings() {
  const {
    activeTheme, colorScheme, fontSize, fontFamily, language: lang,
    setTheme, setColorScheme, setFontSize, setFontFamily, setLanguage,
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

      {/* Color scheme */}
      <Section title={t(lang, "settings.general.colorScheme")}>
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
                {t(lang, `theme.scheme.${scheme}` as TranslationKey)}
              </button>
            )
          })}
        </div>
      </Section>

      {/* Font & size */}
      <Section title={t(lang, "settings.general.fontFamily")}>
        <div className="flex gap-3">
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="flex-1 text-xs bg-surface-0 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-sans"
          >
            {MONO_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-weak font-sans">{t(lang, "settings.general.fontSize")}</span>
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
    </div>
  )
}
