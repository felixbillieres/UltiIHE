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

// Agent modes — defines AI behavior profile
export type AgentMode = "ctf" | "audit" | "neutral"

export interface AgentModeInfo {
  id: AgentMode
  label: string
  description: string
  color: string
  icon: string // lucide icon name
  defaultApproval: "ask" | "auto-run"
}

export const AGENT_MODES: AgentModeInfo[] = [
  {
    id: "ctf",
    label: "CTF",
    description: "Solver mindset — aggressive exploration, creative tricks, flag-oriented",
    color: "#22d3ee",
    icon: "Flag",
    defaultApproval: "auto-run",
  },
  {
    id: "audit",
    label: "Audit",
    description: "Professional pentest — methodology, logging, scope-aware, approval-first",
    color: "#f59e0b",
    icon: "ShieldCheck",
    defaultApproval: "ask",
  },
  {
    id: "neutral",
    label: "Neutral",
    description: "General assistant — no specific security directives",
    color: "#9ca3af",
    icon: "Terminal",
    defaultApproval: "ask",
  },
]

export type Language = "en" | "fr" | "de" | "es" | "ja" | "zh"
