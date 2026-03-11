/**
 * Context management module.
 *
 * Provides token estimation, adaptive prompts, message pruning,
 * and context budget calculation for both large cloud models
 * and small local models.
 */

export { estimateTokens, estimateMessagesTokens, estimateToolsTokens, buildContextBreakdown } from "./tokens"
export type { ContextBreakdown } from "./tokens"

export { calculateBudget, shouldPrune, shouldCompact } from "./budget"
export type { ContextBudget, PromptTier } from "./budget"

export { buildAdaptivePrompt } from "./prompt"

export { pruneMessages, truncateContent } from "./pruner"

export { buildCompactionRequest, applyCompaction, estimateCompactionSavings } from "./compaction"
