import { create } from "zustand"
import { persist } from "zustand/middleware"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelInfo {
  id: string
  name: string
  contextWindow: number
  maxOutput: number
  reasoning: boolean
  toolCalling: boolean
  vision: boolean
  costPer1kInput?: number
  costPer1kOutput?: number
}

export interface ProviderInfo {
  id: string
  name: string
  type: string
  envVar?: string
  models: ModelInfo[]
  freeTier?: boolean
  freeNote?: string
}

export interface ProviderConfig {
  id: string
  name: string
  type: string
  apiKey?: string
  baseUrl?: string
  enabled: boolean
  models: string[]
}

export interface ThemeDefinition {
  id: string
  name: string
  colors: {
    "surface-0": string
    "surface-1": string
    "surface-2": string
    "surface-3": string
    "text-strong": string
    "text-base": string
    "text-weak": string
    "text-weaker": string
    "border-base": string
    "border-weak": string
    accent: string
    "accent-hover": string
    "status-success": string
    "status-error": string
    "status-warning": string
  }
}

export interface KeybindAction {
  id: string
  label: string
  group: "General" | "Session" | "Navigation" | "Terminal" | "Prompt"
  defaultKey: string
}

export type ReasoningMode = "build" | "plan" | "deep"

export type Language = "en" | "fr" | "de" | "es" | "ja" | "zh"

// ---------------------------------------------------------------------------
// Provider Catalog
// ---------------------------------------------------------------------------

export const PROVIDER_CATALOG: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        contextWindow: 200_000,
        maxOutput: 64_000,
        reasoning: true,
        toolCalling: true,
        vision: true,
        costPer1kInput: 0.005,
        costPer1kOutput: 0.025,
      },
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        contextWindow: 200_000,
        maxOutput: 64_000,
        reasoning: true,
        toolCalling: true,
        vision: true,
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        contextWindow: 200_000,
        maxOutput: 64_000,
        reasoning: false,
        toolCalling: true,
        vision: true,
        costPer1kInput: 0.0008,
        costPer1kOutput: 0.004,
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    envVar: "OPENAI_API_KEY",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        contextWindow: 128_000,
        maxOutput: 64_000,
        reasoning: false,
        toolCalling: true,
        vision: true,
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        contextWindow: 128_000,
        maxOutput: 64_000,
        reasoning: false,
        toolCalling: true,
        vision: true,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
      },
      {
        id: "o3-mini",
        name: "o3-mini",
        contextWindow: 128_000,
        maxOutput: 64_000,
        reasoning: true,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.0011,
        costPer1kOutput: 0.0044,
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    type: "google",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    freeTier: true,
    freeNote: "Free tier available with rate limits",
    models: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        contextWindow: 1_000_000,
        maxOutput: 65_000,
        reasoning: true,
        toolCalling: true,
        vision: true,
        costPer1kInput: 0.00125,
        costPer1kOutput: 0.01,
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        contextWindow: 1_000_000,
        maxOutput: 65_000,
        reasoning: false,
        toolCalling: true,
        vision: true,
        costPer1kInput: 0.000075,
        costPer1kOutput: 0.0003,
      },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    type: "mistral",
    envVar: "MISTRAL_API_KEY",
    models: [
      {
        id: "mistral-large-latest",
        name: "Mistral Large",
        contextWindow: 128_000,
        maxOutput: 32_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.002,
        costPer1kOutput: 0.006,
      },
      {
        id: "codestral-latest",
        name: "Codestral",
        contextWindow: 256_000,
        maxOutput: 32_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.0003,
        costPer1kOutput: 0.0009,
      },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    type: "groq",
    envVar: "GROQ_API_KEY",
    freeTier: true,
    freeNote: "Free tier with generous rate limits",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        contextWindow: 128_000,
        maxOutput: 32_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
      {
        id: "mixtral-8x7b-32768",
        name: "Mixtral 8x7B",
        contextWindow: 32_000,
        maxOutput: 8_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    envVar: "OPENROUTER_API_KEY",
    models: [
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4 (via OpenRouter)",
        contextWindow: 200_000,
        maxOutput: 64_000,
        reasoning: true,
        toolCalling: true,
        vision: true,
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o (via OpenRouter)",
        contextWindow: 128_000,
        maxOutput: 64_000,
        reasoning: false,
        toolCalling: true,
        vision: true,
      },
      {
        id: "google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro (via OpenRouter)",
        contextWindow: 1_000_000,
        maxOutput: 65_000,
        reasoning: true,
        toolCalling: true,
        vision: true,
      },
      {
        id: "deepseek/deepseek-chat-v3",
        name: "DeepSeek Chat v3 (via OpenRouter)",
        contextWindow: 64_000,
        maxOutput: 8_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    type: "xai",
    envVar: "XAI_API_KEY",
    models: [
      {
        id: "grok-3",
        name: "Grok 3",
        contextWindow: 128_000,
        maxOutput: 32_000,
        reasoning: true,
        toolCalling: true,
        vision: false,
      },
      {
        id: "grok-3-mini",
        name: "Grok 3 Mini",
        contextWindow: 128_000,
        maxOutput: 16_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    type: "deepseek",
    envVar: "DEEPSEEK_API_KEY",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        contextWindow: 64_000,
        maxOutput: 8_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.00027,
        costPer1kOutput: 0.0011,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        contextWindow: 64_000,
        maxOutput: 8_000,
        reasoning: true,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.00054,
        costPer1kOutput: 0.00219,
      },
    ],
  },
  {
    id: "togetherai",
    name: "Together AI",
    type: "togetherai",
    envVar: "TOGETHER_AI_API_KEY",
    freeTier: true,
    freeNote: "Some free models available",
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        name: "Llama 3.3 70B Turbo",
        contextWindow: 128_000,
        maxOutput: 4_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
      {
        id: "deepseek-ai/DeepSeek-R1",
        name: "DeepSeek R1",
        contextWindow: 64_000,
        maxOutput: 8_000,
        reasoning: true,
        toolCalling: true,
        vision: false,
      },
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    type: "perplexity",
    envVar: "PERPLEXITY_API_KEY",
    models: [
      {
        id: "sonar-pro",
        name: "Sonar Pro",
        contextWindow: 128_000,
        maxOutput: 8_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
      },
      {
        id: "sonar-reasoning-pro",
        name: "Sonar Reasoning Pro",
        contextWindow: 128_000,
        maxOutput: 8_000,
        reasoning: true,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.002,
        costPer1kOutput: 0.008,
      },
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    type: "fireworks",
    envVar: "FIREWORKS_API_KEY",
    models: [
      {
        id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        name: "Llama 3.3 70B Instruct",
        contextWindow: 128_000,
        maxOutput: 8_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
      {
        id: "accounts/fireworks/models/deepseek-r1",
        name: "DeepSeek R1",
        contextWindow: 64_000,
        maxOutput: 8_000,
        reasoning: true,
        toolCalling: true,
        vision: false,
      },
    ],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    type: "cerebras",
    envVar: "CEREBRAS_API_KEY",
    freeTier: true,
    freeNote: "Free tier with fast inference",
    models: [
      {
        id: "llama-3.3-70b",
        name: "Llama 3.3 70B",
        contextWindow: 128_000,
        maxOutput: 8_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
      {
        id: "llama-3.1-8b",
        name: "Llama 3.1 8B",
        contextWindow: 128_000,
        maxOutput: 8_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
      },
    ],
  },
  {
    id: "cohere",
    name: "Cohere",
    type: "cohere",
    envVar: "COHERE_API_KEY",
    models: [
      {
        id: "command-r-plus",
        name: "Command R+",
        contextWindow: 128_000,
        maxOutput: 4_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
      },
      {
        id: "command-r",
        name: "Command R",
        contextWindow: 128_000,
        maxOutput: 4_000,
        reasoning: false,
        toolCalling: true,
        vision: false,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export const THEMES: ThemeDefinition[] = [
  {
    id: "exegol-dark",
    name: "Exegol Dark",
    colors: {
      "surface-0": "#0c0e14",
      "surface-1": "#12151e",
      "surface-2": "#1a1e2b",
      "surface-3": "#232838",
      "text-strong": "#f1f5f9",
      "text-base": "#cbd5e1",
      "text-weak": "#94a3b8",
      "text-weaker": "#64748b",
      "border-base": "#1e293b",
      "border-weak": "#162032",
      accent: "#22d3ee",
      "accent-hover": "#06b6d4",
      "status-success": "#22c55e",
      "status-error": "#ef4444",
      "status-warning": "#f59e0b",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    colors: {
      "surface-0": "#0a0e1a",
      "surface-1": "#0f1425",
      "surface-2": "#161c32",
      "surface-3": "#1e2540",
      "text-strong": "#e8ecf4",
      "text-base": "#b8c4da",
      "text-weak": "#8494b4",
      "text-weaker": "#5a6a8a",
      "border-base": "#1c2440",
      "border-weak": "#141c34",
      accent: "#7c3aed",
      "accent-hover": "#6d28d9",
      "status-success": "#22c55e",
      "status-error": "#ef4444",
      "status-warning": "#f59e0b",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    colors: {
      "surface-0": "#282a36",
      "surface-1": "#2d303e",
      "surface-2": "#343746",
      "surface-3": "#3c3f50",
      "text-strong": "#f8f8f2",
      "text-base": "#d4d4ce",
      "text-weak": "#a4a4a0",
      "text-weaker": "#6272a4",
      "border-base": "#44475a",
      "border-weak": "#383a4c",
      accent: "#bd93f9",
      "accent-hover": "#a87cf8",
      "status-success": "#50fa7b",
      "status-error": "#ff5555",
      "status-warning": "#f1fa8c",
    },
  },
  {
    id: "nord",
    name: "Nord",
    colors: {
      "surface-0": "#2e3440",
      "surface-1": "#333a47",
      "surface-2": "#3b4252",
      "surface-3": "#434c5e",
      "text-strong": "#eceff4",
      "text-base": "#d8dee9",
      "text-weak": "#a3b1c4",
      "text-weaker": "#7b8da0",
      "border-base": "#434c5e",
      "border-weak": "#3b4252",
      accent: "#88c0d0",
      "accent-hover": "#7ab3c3",
      "status-success": "#a3be8c",
      "status-error": "#bf616a",
      "status-warning": "#ebcb8b",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    colors: {
      "surface-0": "#1e1e2e",
      "surface-1": "#232334",
      "surface-2": "#2a2a3c",
      "surface-3": "#313244",
      "text-strong": "#cdd6f4",
      "text-base": "#bac2de",
      "text-weak": "#a6adc8",
      "text-weaker": "#6c7086",
      "border-base": "#313244",
      "border-weak": "#282838",
      accent: "#cba6f7",
      "accent-hover": "#b48def",
      "status-success": "#a6e3a1",
      "status-error": "#f38ba8",
      "status-warning": "#f9e2af",
    },
  },
  {
    id: "light",
    name: "Light",
    colors: {
      "surface-0": "#ffffff",
      "surface-1": "#f8fafc",
      "surface-2": "#f1f5f9",
      "surface-3": "#e2e8f0",
      "text-strong": "#0f172a",
      "text-base": "#1e293b",
      "text-weak": "#475569",
      "text-weaker": "#94a3b8",
      "border-base": "#e2e8f0",
      "border-weak": "#f1f5f9",
      accent: "#2563eb",
      "accent-hover": "#1d4ed8",
      "status-success": "#16a34a",
      "status-error": "#dc2626",
      "status-warning": "#d97706",
    },
  },
]

// ---------------------------------------------------------------------------
// Default Keybindings
// ---------------------------------------------------------------------------

export const DEFAULT_KEYBINDS: KeybindAction[] = [
  // General
  {
    id: "command-palette",
    label: "Command Palette",
    group: "General",
    defaultKey: "Ctrl+Shift+P",
  },
  {
    id: "settings",
    label: "Open Settings",
    group: "General",
    defaultKey: "Ctrl+,",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    group: "General",
    defaultKey: "Ctrl+B",
  },

  // Session
  {
    id: "new-session",
    label: "New Session",
    group: "Session",
    defaultKey: "Ctrl+N",
  },
  {
    id: "archive-session",
    label: "Archive Session",
    group: "Session",
    defaultKey: "Ctrl+W",
  },

  // Navigation
  {
    id: "focus-chat",
    label: "Focus Chat Panel",
    group: "Navigation",
    defaultKey: "Ctrl+L",
  },
  {
    id: "focus-terminal",
    label: "Focus Terminal",
    group: "Navigation",
    defaultKey: "Ctrl+`",
  },

  // Terminal
  {
    id: "new-terminal",
    label: "New Terminal",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+T",
  },
  {
    id: "close-terminal",
    label: "Close Terminal",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+W",
  },
  {
    id: "next-terminal",
    label: "Next Terminal",
    group: "Terminal",
    defaultKey: "Ctrl+Tab",
  },
  {
    id: "split-horizontal",
    label: "Split Horizontal",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+H",
  },
  {
    id: "split-vertical",
    label: "Split Vertical",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+V",
  },

  // Prompt
  {
    id: "send-message",
    label: "Send Message",
    group: "Prompt",
    defaultKey: "Enter",
  },
  {
    id: "new-line",
    label: "New Line",
    group: "Prompt",
    defaultKey: "Shift+Enter",
  },
  {
    id: "stop-generation",
    label: "Stop Generation",
    group: "Prompt",
    defaultKey: "Escape",
  },
]

// ---------------------------------------------------------------------------
// Font catalog
// ---------------------------------------------------------------------------

const MONO_FONTS = [
  "IBM Plex Mono",
  "Cascadia Code",
  "Fira Code",
  "Hack",
  "JetBrains Mono",
  "Source Code Pro",
  "Ubuntu Mono",
  "Inconsolata",
  "Roboto Mono",
  "Space Mono",
  "Victor Mono",
  "Iosevka",
  "Fantasque Sans Mono",
] as const

export type MonoFont = (typeof MONO_FONTS)[number]

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

  // Language
  language: Language

  // Providers
  providers: ProviderConfig[]
  activeProvider: string
  activeModel: string
  activeMode: ReasoningMode

  // Keybindings
  customKeybinds: Record<string, string>

  // Actions - Appearance
  setTheme: (id: string) => void
  setColorScheme: (scheme: "dark" | "light" | "system") => void
  setFontSize: (size: number) => void
  setFontFamily: (font: string) => void

  // Actions - Language
  setLanguage: (lang: Language) => void

  // Actions - Providers
  addProvider: (provider: ProviderConfig) => void
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void
  removeProvider: (id: string) => void
  setActiveProvider: (id: string) => void
  setActiveModel: (model: string) => void
  setActiveMode: (mode: ReasoningMode) => void

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
      language: detectLanguage(),
      providers: [],
      activeProvider: "anthropic",
      activeModel: "claude-sonnet-4-20250514",
      activeMode: "build",
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
        language: state.language,
        providers: state.providers,
        activeProvider: state.activeProvider,
        activeModel: state.activeModel,
        activeMode: state.activeMode,
        customKeybinds: state.customKeybinds,
      }),
    },
  ),
)
