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

  const budgetMap = { low: 8000, medium: 16000, high: 32000 } as const

  switch (providerId) {
    case "anthropic":
      return {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: budgetMap[effort] },
        },
      }
    case "openai":
      return {
        openai: {
          reasoningEffort: effort === "high" ? "high" : effort === "low" ? "low" : "medium",
        },
      }
    case "google":
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: budgetMap[effort],
          },
        },
      }
    case "deepseek":
      // DeepSeek reasoner handles thinking internally
      return {}
    default:
      return {}
  }
}
