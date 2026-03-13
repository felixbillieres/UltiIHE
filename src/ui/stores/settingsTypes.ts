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
  status?: "alpha" | "beta" | "deprecated"
}

export interface ProviderInfo {
  id: string
  name: string
  type: string
  envVar?: string
  models: ModelInfo[]
  freeTier?: boolean
  freeNote?: string
  signupUrl?: string
  description?: string
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

export type ThinkingEffort = "off" | "low" | "medium" | "high"

// Single primary agent — no multi-agent system
export type AgentId = "build"

export type Language = "en" | "fr" | "de" | "es" | "ja" | "zh"
