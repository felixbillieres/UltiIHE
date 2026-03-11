/**
 * Context budget calculation per model.
 *
 * Determines how much context is available, when to compact,
 * and what tier of system prompt to use.
 *
 * Three tiers:
 * - full:    contextWindow > 32K  (cloud models, big local models)
 * - medium:  8K < contextWindow <= 32K (mid-size local models)
 * - minimal: contextWindow <= 8K  (small local models like 4K Llama)
 */

export type PromptTier = "full" | "medium" | "minimal"

export interface ContextBudget {
  /** Total context window of the model */
  contextWindow: number
  /** Tokens reserved for model output */
  outputReserve: number
  /** Tokens available for input (system + tools + messages) */
  inputBudget: number
  /** Threshold (% of inputBudget) at which we start pruning */
  pruneThreshold: number
  /** Threshold (% of inputBudget) at which we trigger compaction */
  compactThreshold: number
  /** Which prompt tier to use */
  promptTier: PromptTier
  /** Max number of tools to send in schemas */
  maxTools: number
}

/**
 * Calculate the context budget for a model.
 *
 * @param contextWindow - Total context window in tokens
 * @param maxOutput - Max output tokens (defaults based on model size)
 */
export function calculateBudget(
  contextWindow: number,
  maxOutput?: number,
): ContextBudget {
  // Output reserve: use model's maxOutput or a sensible default
  // Small models: reserve less for output to maximize input
  const outputReserve = maxOutput
    ? Math.min(maxOutput, Math.floor(contextWindow * 0.25))
    : contextWindow <= 8192
      ? Math.min(2048, Math.floor(contextWindow * 0.2))
      : contextWindow <= 32768
        ? Math.min(4096, Math.floor(contextWindow * 0.15))
        : Math.min(16384, Math.floor(contextWindow * 0.1))

  const inputBudget = contextWindow - outputReserve

  // Prompt tier based on context window
  let promptTier: PromptTier
  let maxTools: number

  if (contextWindow <= 8192) {
    promptTier = "minimal"
    maxTools = 5  // Only essential tools
  } else if (contextWindow <= 32768) {
    promptTier = "medium"
    maxTools = 12  // Core tools, skip niche ones
  } else {
    promptTier = "full"
    maxTools = 99  // All tools
  }

  return {
    contextWindow,
    outputReserve,
    inputBudget,
    // Prune old tool outputs at 70% of input budget
    pruneThreshold: 0.70,
    // Full compaction (LLM summarization) at 85%
    compactThreshold: 0.85,
    promptTier,
    maxTools,
  }
}

/**
 * Check if pruning is needed based on current token usage.
 */
export function shouldPrune(
  currentTokens: number,
  budget: ContextBudget,
): boolean {
  return currentTokens >= budget.inputBudget * budget.pruneThreshold
}

/**
 * Check if full compaction (LLM summarization) is needed.
 */
export function shouldCompact(
  currentTokens: number,
  budget: ContextBudget,
): boolean {
  return currentTokens >= budget.inputBudget * budget.compactThreshold
}
