import { create } from "zustand"
import { persist } from "zustand/middleware"

// Re-export types and constants for backward compatibility
export type {
  ModelInfo,
  ProviderInfo,
  ProviderConfig,
  ThemeDefinition,
  KeybindAction,
  ReasoningMode,
  ThinkingEffort,
  AgentId,
  AgentInfo,
  Language,
} from "./settingsTypes"
export { AGENTS } from "./settingsTypes"

export type { MonoFont } from "./settingsCatalogs"
export { PROVIDER_CATALOG, THEMES, DEFAULT_KEYBINDS, MONO_FONTS } from "./settingsCatalogs"

// Internal imports for store use
import type {
  ProviderConfig,
  ModelInfo,
  ReasoningMode,
  AgentId,
  ThinkingEffort,
  Language,
} from "./settingsTypes"
import { AGENTS } from "./settingsTypes"
import { PROVIDER_CATALOG, THEMES, DEFAULT_KEYBINDS } from "./settingsCatalogs"
import { useProviderCatalog } from "./providerCatalog"

// ---------------------------------------------------------------------------
// Language detection helper
// ---------------------------------------------------------------------------

function detectLanguage(): Language {
  if (typeof navigator === "undefined") return "en"
  const supported: Language[] = ["en", "fr", "de", "es", "ja", "zh"]
  for (const lang of navigator.languages) {
    const prefix = lang.slice(0, 2).toLowerCase() as Language
    if (supported.includes(prefix)) return prefix
  }
  return "en"
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface SettingsStore {
  // Appearance
  activeTheme: string
  colorScheme: "dark" | "light" | "system"
  fontSize: number
  fontFamily: string

  // Sound
  soundEnabled: boolean
  soundId: string

  // Language
  language: Language

  // Providers
  providers: ProviderConfig[]
  activeProvider: string
  activeModel: string
  activeMode: ReasoningMode
  activeAgent: AgentId
  thinkingEffort: ThinkingEffort

  // Keybindings
  customKeybinds: Record<string, string>

  // Actions - Appearance
  setTheme: (id: string) => void
  setColorScheme: (scheme: "dark" | "light" | "system") => void
  setFontSize: (size: number) => void
  setFontFamily: (font: string) => void

  // Actions - Sound
  setSoundEnabled: (enabled: boolean) => void
  setSoundId: (id: string) => void

  // Actions - Language
  setLanguage: (lang: Language) => void

  // Actions - Providers
  addProvider: (provider: ProviderConfig) => void
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void
  removeProvider: (id: string) => void
  setActiveProvider: (id: string) => void
  setActiveModel: (model: string) => void
  setActiveMode: (mode: ReasoningMode) => void
  setActiveAgent: (agent: AgentId) => void
  setThinkingEffort: (effort: ThinkingEffort) => void
  cycleAgent: () => void
  cycleThinkingEffort: () => void

  // Actions - Keybindings
  setKeybind: (actionId: string, key: string) => void
  resetKeybind: (actionId: string) => void
  resetAllKeybinds: () => void

  // Getters
  getKeybind: (actionId: string) => string
  getActiveProvider: () => ProviderConfig | undefined
  getActiveModelInfo: () => ModelInfo | undefined
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // --- Defaults ---
      activeTheme: "exegol-dark",
      colorScheme: "dark",
      fontSize: 14,
      fontFamily: "IBM Plex Mono",
      soundEnabled: false,
      soundId: "gentle",
      language: detectLanguage(),
      providers: [],
      activeProvider: "anthropic",
      activeModel: "claude-sonnet-4-20250514",
      activeMode: "build",
      activeAgent: "build" as AgentId,
      thinkingEffort: "off" as ThinkingEffort,
      customKeybinds: {},

      // --- Appearance ---
      setTheme: (id) => {
        const exists = THEMES.some((t) => t.id === id)
        if (exists) set({ activeTheme: id })
      },

      setColorScheme: (scheme) => set({ colorScheme: scheme }),

      setFontSize: (size) => {
        const clamped = Math.min(Math.max(size, 10), 24)
        set({ fontSize: clamped })
      },

      setFontFamily: (font) => set({ fontFamily: font }),

      // --- Sound ---
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setSoundId: (id) => set({ soundId: id }),

      // --- Language ---
      setLanguage: (lang) => set({ language: lang }),

      // --- Providers ---
      addProvider: (provider) =>
        set((s) => {
          const exists = s.providers.some((p) => p.id === provider.id)
          if (exists) return s
          return { providers: [...s.providers, provider] }
        }),

      updateProvider: (id, updates) =>
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        })),

      removeProvider: (id) =>
        set((s) => ({
          providers: s.providers.filter((p) => p.id !== id),
        })),

      setActiveProvider: (id) => set({ activeProvider: id }),

      setActiveModel: (model) => set({ activeModel: model }),

      setActiveMode: (mode) => set({ activeMode: mode }),

      setActiveAgent: (agent) => set({ activeAgent: agent }),

      setThinkingEffort: (effort) => set({ thinkingEffort: effort }),

      cycleAgent: () => {
        const current = get().activeAgent
        const ids = AGENTS.map((a) => a.id)
        const idx = ids.indexOf(current)
        set({ activeAgent: ids[(idx + 1) % ids.length] })
      },

      cycleThinkingEffort: () => {
        const model = get().getActiveModelInfo()
        if (!model?.reasoning) return // no cycling if model doesn't support reasoning
        const efforts: ThinkingEffort[] = ["off", "low", "medium", "high"]
        const current = get().thinkingEffort
        const idx = efforts.indexOf(current)
        set({ thinkingEffort: efforts[(idx + 1) % efforts.length] })
      },

      // --- Keybindings ---
      setKeybind: (actionId, key) =>
        set((s) => ({
          customKeybinds: { ...s.customKeybinds, [actionId]: key },
        })),

      resetKeybind: (actionId) =>
        set((s) => {
          const { [actionId]: _, ...rest } = s.customKeybinds
          return { customKeybinds: rest }
        }),

      resetAllKeybinds: () => set({ customKeybinds: {} }),

      getKeybind: (actionId) => {
        const custom = get().customKeybinds[actionId]
        if (custom) return custom
        const action = DEFAULT_KEYBINDS.find((k) => k.id === actionId)
        return action?.defaultKey ?? ""
      },

      // --- Getters ---
      getActiveProvider: () => {
        const state = get()
        return state.providers.find((p) => p.id === state.activeProvider)
      },

      getActiveModelInfo: () => {
        const state = get()
        // Try dynamic catalog first (models.dev)
        const dynamic = useProviderCatalog.getState().findModel(state.activeModel)
        if (dynamic) return dynamic
        // Fallback to static catalog
        for (const provider of PROVIDER_CATALOG) {
          const model = provider.models.find(
            (m) => m.id === state.activeModel,
          )
          if (model) return model
        }
        return undefined
      },
    }),
    {
      name: "ultiIHE-settings",
      partialize: (state) => ({
        activeTheme: state.activeTheme,
        colorScheme: state.colorScheme,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        soundEnabled: state.soundEnabled,
        soundId: state.soundId,
        language: state.language,
        providers: state.providers,
        activeProvider: state.activeProvider,
        activeModel: state.activeModel,
        activeMode: state.activeMode,
        activeAgent: state.activeAgent,
        thinkingEffort: state.thinkingEffort,
        customKeybinds: state.customKeybinds,
      }),
    },
  ),
)
