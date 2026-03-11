/**
 * Resolve context window size for any model.
 *
 * Checks three sources in order:
 * 1. Local model (actual server context size)
 * 2. models.dev database (auto-updated from https://models.dev)
 * 3. Sensible defaults based on provider
 *
 * No more hardcoded model lists — models.dev is the source of truth
 * for cloud providers, auto-refreshed every 60 minutes.
 */

import { LOCAL_MODEL_CATALOG } from "../../services/local/modelCatalog"
import { getServerStatus } from "../../services/local/server"
import { lookupModel } from "../../services/models-dev"

// ── Provider defaults (fallback when models.dev has no data) ──

const PROVIDER_DEFAULTS: Record<string, number> = {
  anthropic: 200_000,
  openai: 128_000,
  google: 1_000_000,
  mistral: 128_000,
  groq: 128_000,
  openrouter: 128_000,
  xai: 131_072,
  deepseek: 128_000,
  togetherai: 128_000,
  perplexity: 128_000,
  fireworks: 128_000,
  cerebras: 128_000,
  "amazon-bedrock": 200_000,
  azure: 128_000,
  cohere: 256_000,
  local: 4_096,
  custom: 32_768,
}

// Cache for models.dev lookups (avoid async in hot path)
const modelCache = new Map<string, { contextWindow: number; maxOutput: number }>()

/**
 * Warm the cache for a model from models.dev.
 * Called async — result cached for sync access later.
 */
async function warmCache(providerId: string, modelId: string): Promise<void> {
  const key = `${providerId}:${modelId}`
  if (modelCache.has(key)) return

  const model = await lookupModel(providerId, modelId)
  if (model) {
    modelCache.set(key, {
      contextWindow: model.limit.context,
      maxOutput: model.limit.output,
    })
  }
}

/**
 * Resolve the context window for a model.
 *
 * For local models, the ACTUAL context window is what llama-server was
 * started with (-c flag), not the model's theoretical maximum.
 */
export function resolveContextWindow(providerId: string, modelId: string): number {
  // 1. For local models, use the ACTUAL server context size
  if (providerId === "local") {
    const status = getServerStatus()
    if (status.running) {
      return status.contextSize || 4096
    }
    const catalogEntry = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId)
    if (catalogEntry) {
      return 4096 // Default startup context, not theoretical max
    }
  }

  // 2. Check models.dev cache
  const key = `${providerId}:${modelId}`
  const cached = modelCache.get(key)
  if (cached) {
    return cached.contextWindow
  }

  // 3. Trigger async cache warm (will be ready for next call)
  warmCache(providerId, modelId).catch(() => {})

  // 4. Provider default
  return PROVIDER_DEFAULTS[providerId] || 32_768
}

/**
 * Resolve max output tokens for a model.
 */
export function resolveMaxOutput(providerId: string, modelId: string): number {
  // Check models.dev cache
  const key = `${providerId}:${modelId}`
  const cached = modelCache.get(key)
  if (cached) {
    return cached.maxOutput
  }

  // Local models: conservative output limit
  if (providerId === "local") {
    const catalogEntry = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId)
    if (catalogEntry) {
      return Math.min(4096, Math.floor(catalogEntry.contextWindow * 0.25))
    }
    return 2048
  }

  // Default: 8K output for unknown models
  return 8192
}

/**
 * Pre-warm cache for a model (call this before chat starts).
 */
export async function preWarmModel(providerId: string, modelId: string): Promise<void> {
  await warmCache(providerId, modelId)
}
