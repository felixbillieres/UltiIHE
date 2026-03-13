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

export type AgentId = "build" | "recon" | "exploit" | "report"

export interface AgentInfo {
  id: AgentId
  name: string
  color: string
  description: string
  canExecute: boolean
}

export const AGENTS: AgentInfo[] = [
  {
    id: "build",
    name: "Build",
    color: "text-accent",
    description: "Primary agent — full access to all tools",
    canExecute: true,
  },
  {
    id: "recon",
    name: "Recon",
    color: "text-blue-400",
    description: "Reconnaissance — network discovery, enumeration, scanning",
    canExecute: true,
  },
  {
    id: "exploit",
    name: "Exploit",
    color: "text-red-400",
    description: "Exploitation — validate vulnerabilities, capture evidence",
    canExecute: true,
  },
  {
    id: "report",
    name: "Report",
    color: "text-purple-400",
    description: "Reporting — read-only, generates findings and reports",
    canExecute: false,
  },
]

export type Language = "en" | "fr" | "de" | "es" | "ja" | "zh"
