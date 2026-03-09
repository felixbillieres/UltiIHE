import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ProviderConfig {
  id: string
  name: string
  type:
    | "anthropic"
    | "openai"
    | "google"
    | "mistral"
    | "groq"
    | "openrouter"
    | "xai"
    | "deepseek"
    | "togetherai"
    | "perplexity"
    | "fireworks"
    | "cerebras"
    | "amazon-bedrock"
    | "azure"
    | "cohere"
    | "custom"
  apiKey?: string
  baseUrl?: string
  enabled: boolean
  models: string[]
  freeTier?: boolean
  freeNote?: string
}

export const PROVIDER_CATALOG: Omit<ProviderConfig, "apiKey" | "enabled">[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    models: [
      "claude-opus-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250506",
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini"],
  },
  {
    id: "google",
    name: "Google",
    type: "google",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    freeTier: true,
    freeNote: "Free tier available with rate limits",
  },
  {
    id: "mistral",
    name: "Mistral",
    type: "mistral",
    models: ["mistral-large-latest", "mistral-medium-latest", "codestral-latest"],
  },
  {
    id: "groq",
    name: "Groq",
    type: "groq",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
    freeTier: true,
    freeNote: "Free tier with generous rate limits",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    models: [
      "anthropic/claude-sonnet-4",
      "openai/gpt-4o",
      "google/gemini-2.5-pro",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat-v3",
    ],
  },
  {
    id: "xai",
    name: "xAI",
    type: "xai",
    models: ["grok-3", "grok-3-mini", "grok-2"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    type: "deepseek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    freeNote: "Very affordable pricing",
  },
  {
    id: "togetherai",
    name: "Together AI",
    type: "togetherai",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Llama-3.1-8B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-R1",
    ],
    freeTier: true,
    freeNote: "Some free models available",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    type: "perplexity",
    models: [
      "sonar-pro",
      "sonar",
      "sonar-reasoning-pro",
      "sonar-reasoning",
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    type: "fireworks",
    models: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/qwen2p5-72b-instruct",
      "accounts/fireworks/models/deepseek-r1",
    ],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    type: "cerebras",
    models: ["llama-3.3-70b", "llama-3.1-8b"],
    freeTier: true,
    freeNote: "Free tier with fast inference",
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    type: "amazon-bedrock",
    models: [
      "anthropic.claude-sonnet-4-20250514-v1:0",
      "anthropic.claude-haiku-4-20250506-v1:0",
      "amazon.nova-pro-v1:0",
    ],
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    type: "azure",
    models: ["gpt-4o", "gpt-4o-mini"],
  },
  {
    id: "cohere",
    name: "Cohere",
    type: "cohere",
    models: ["command-r-plus", "command-r", "command-light"],
  },
]

interface SettingsStore {
  appearance: {
    theme: "dark" | "light" | "system"
    fontSize: number
    fontFamily: string
  }
  providers: ProviderConfig[]
  activeProvider: string
  activeModel: string

  setTheme: (theme: "dark" | "light" | "system") => void
  setFontSize: (size: number) => void
  setFontFamily: (font: string) => void
  addProvider: (provider: ProviderConfig) => void
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void
  removeProvider: (id: string) => void
  setActiveProvider: (id: string) => void
  setActiveModel: (model: string) => void
  getActiveProvider: () => ProviderConfig | undefined
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      appearance: {
        theme: "dark",
        fontSize: 14,
        fontFamily: "Inter",
      },
      providers: [],
      activeProvider: "anthropic",
      activeModel: "claude-sonnet-4-20250514",

      setTheme: (theme) =>
        set((s) => ({ appearance: { ...s.appearance, theme } })),
      setFontSize: (fontSize) =>
        set((s) => ({ appearance: { ...s.appearance, fontSize } })),
      setFontFamily: (fontFamily) =>
        set((s) => ({ appearance: { ...s.appearance, fontFamily } })),

      addProvider: (provider) =>
        set((s) => ({ providers: [...s.providers, provider] })),

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

      getActiveProvider: () =>
        get().providers.find((p) => p.id === get().activeProvider),
    }),
    { name: "ultiIHE-settings" },
  ),
)
