import type { ReasoningMode } from "./systemPrompt"

export type ThinkingEffort = "off" | "low" | "medium" | "high"

/**
 * Return provider-specific options for reasoning/thinking.
 *
 * thinkingEffort controls the thinking budget:
 * - off: no reasoning
 * - low: minimal reasoning budget
 * - medium: moderate reasoning budget
 * - high: maximum reasoning budget
 *
 * Falls back to mode-based reasoning if thinkingEffort is "off":
 * - plan mode: medium reasoning
 * - deep mode: high reasoning
 */
export function getReasoningOptions(
  providerId: string,
  mode: ReasoningMode,
  thinkingEffort: ThinkingEffort = "off",
): Record<string, any> {
  // Determine effective effort from explicit setting or mode fallback
  let effort = thinkingEffort
  if (effort === "off") {
    if (mode === "plan") effort = "medium"
    else if (mode === "deep") effort = "high"
    else return {}
  }

  // Provider-specific thinking token budgets
  const anthropicBudget = { low: 5000, medium: 10000, high: 50000 } as const
  const googleBudget = { low: 1024, medium: 8192, high: 32768 } as const

  switch (providerId) {
    case "anthropic":
      return {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: anthropicBudget[effort] },
        },
      }
    case "openai":
      // o3, o4-mini use reasoningEffort directly (low/medium/high)
      return {
        openai: {
          reasoningEffort: effort,
        },
      }
    case "google":
      // Gemini 2.5 Pro/Flash thinking models use thinkingBudget
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: googleBudget[effort],
          },
        },
      }
    case "xai":
      // Grok-3 uses reasoning_effort in provider options
      return {
        xai: {
          reasoningEffort: effort,
        },
      }
    case "deepseek":
      // DeepSeek reasoner handles thinking internally
      return {}
    default:
      return {}
  }
}

/**
 * Auto-escalate thinking effort based on context signals.
 * Only activates if user hasn't explicitly set a thinking effort (i.e., "off").
 */
export function autoEscalateThinking(
  thinkingEffort: ThinkingEffort,
  userMessage: string,
  recentErrors: number,
): ThinkingEffort {
  // Don't override explicit user choice
  if (thinkingEffort !== "off") return thinkingEffort

  // Post-error recovery: AI needs to rethink its approach
  if (recentErrors >= 2) return "medium"

  // Pentest-specific: privilege escalation, lateral movement require multi-step reasoning
  if (/\b(privesc|privilege|lateral|pivot|escalat|post.?exploit)/i.test(userMessage)) return "medium"

  // Analytical queries
  if (/\b(explain|why|how|analyze|compare|plan|strategy|methodology)\b/i.test(userMessage)) return "low"

  // Long complex prompts
  if (userMessage.length > 300) return "low"

  return "off"
}
