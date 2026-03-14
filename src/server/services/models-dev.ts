/**
 * models.dev — External model database.
 *
 * Fetches model metadata (context windows, tool calling support, costs, etc.)
 * from https://models.dev/api.json — the same source OpenCode uses.
 *
 * Fallback chain:
 *   1. Local cache (~/.ultiIHE/cache/models.json)
 *   2. Bundled snapshot (compiled at build time)
 *   3. Network fetch from models.dev
 *
 * Auto-refreshes every 60 minutes.
 */

import { existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

// ── Types ────────────────────────────────────────────────────

export interface ModelsDevModel {
  id: string
  name: string
  family?: string
  attachment: boolean
  reasoning: boolean
  tool_call: boolean
  temperature?: boolean
  release_date: string
  last_updated?: string
  status?: "alpha" | "beta" | "deprecated"
  modalities?: {
    input: string[]
    output: string[]
  }
  cost?: {
    input: number   // per 1M tokens
    output: number
    cache_read?: number
    cache_write?: number
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  options?: Record<string, unknown>
  headers?: Record<string, string>
  variants?: Record<string, Record<string, unknown>>
}

export interface ModelsDevProvider {
  id: string
  name: string
  env: string[]
  npm?: string
  api?: string
  doc?: string
  models: Record<string, ModelsDevModel>
}

export type ModelsDevData = Record<string, ModelsDevProvider>

// ── Config ───────────────────────────────────────────────────

const MODELS_DEV_URL = process.env.ULTIHE_MODELS_URL || "https://models.dev"
const CACHE_DIR = join(homedir(), ".ultiIHE", "cache")
const CACHE_FILE = join(CACHE_DIR, "models.json")
const REFRESH_INTERVAL = 60 * 60 * 1000 // 60 minutes
const FETCH_TIMEOUT = 10_000 // 10 seconds

// Providers we support (have AI SDK packages for)
const SUPPORTED_PROVIDERS = new Set([
  "anthropic",
  "openai",
  "google",
  "mistral",
  "groq",
  "openrouter",
  "xai",
  "deepseek",
  "togetherai",
  "perplexity",
  "fireworks-ai",
  "cerebras",
  "cohere",
  "amazon-bedrock",
  "azure",
  "moonshotai",
  "minimax",
])

// Provider ID mapping (models.dev ID → our internal ID)
const PROVIDER_ID_MAP: Record<string, string> = {
  "fireworks-ai": "fireworks",
}

// ── State ────────────────────────────────────────────────────

let cachedData: ModelsDevData | null = null
let lastFetch = 0

// ── Core Functions ───────────────────────────────────────────

/**
 * Get model data. Uses cache → snapshot → network fallback chain.
 */
export async function getModelsDevData(): Promise<ModelsDevData> {
  if (cachedData && Date.now() - lastFetch < REFRESH_INTERVAL) {
    return cachedData
  }

  // 1. Try local cache file
  try {
    if (existsSync(CACHE_FILE)) {
      const text = await Bun.file(CACHE_FILE).text()
      const data = JSON.parse(text) as ModelsDevData
      if (data && typeof data === "object" && Object.keys(data).length > 10) {
        cachedData = data
        lastFetch = Date.now()
        console.log(`[models.dev] Loaded from cache (${Object.keys(data).length} providers)`)
        return data
      }
    }
  } catch {
    // Cache invalid or missing
  }

  // 2. Try bundled snapshot
  try {
    const { snapshot } = await import("./models-snapshot")
    if (snapshot && Object.keys(snapshot).length > 10) {
      cachedData = snapshot as unknown as ModelsDevData
      lastFetch = Date.now()
      console.log(`[models.dev] Loaded from snapshot (${Object.keys(snapshot).length} providers)`)
      // Trigger background refresh
      refresh().catch(() => {})
      return cachedData
    }
  } catch {
    // No snapshot available
  }

  // 3. Fetch from network
  const data = await fetchFromNetwork()
  if (data) {
    cachedData = data
    lastFetch = Date.now()
    return data
  }

  // 4. Return empty if all fails
  console.warn("[models.dev] All sources failed — returning empty data")
  return {}
}

/**
 * Fetch fresh data from models.dev and save to cache.
 */
export async function refresh(): Promise<void> {
  const data = await fetchFromNetwork()
  if (data) {
    cachedData = data
    lastFetch = Date.now()
  }
}

async function fetchFromNetwork(): Promise<ModelsDevData | null> {
  try {
    const res = await fetch(`${MODELS_DEV_URL}/api.json`, {
      headers: { "User-Agent": "UltiIHE" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) {
      console.warn(`[models.dev] Fetch failed: ${res.status}`)
      return null
    }
    const text = await res.text()
    const data = JSON.parse(text) as ModelsDevData

    // Save to cache
    try {
      mkdirSync(CACHE_DIR, { recursive: true })
      await Bun.write(CACHE_FILE, text)
      console.log(`[models.dev] Fetched and cached (${Object.keys(data).length} providers)`)
    } catch (e) {
      console.warn("[models.dev] Failed to write cache:", e)
    }

    return data
  } catch (e) {
    console.warn("[models.dev] Network fetch failed:", e instanceof Error ? e.message : e)
    return null
  }
}

// ── Provider Filtering ───────────────────────────────────────

// ── Blacklist & filtering ────────────────────────────────────

/** Models known to be broken or unusable */
const MODEL_BLACKLIST = new Set([
  "gpt-5-chat-latest",
])

// Models released within this window are considered "recent"
const RECENT_MONTHS = 6
const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000
const PREVIEW_EXPIRY_MONTHS = 3

/**
 * Check if a preview model has an expired date in its ID.
 * Matches patterns like "preview-09-2025" or "preview-2025-09".
 */
function isExpiredPreview(modelId: string): boolean {
  if (!modelId.includes("preview")) return false

  // Match MM-YYYY or YYYY-MM patterns
  const mmYyyy = modelId.match(/(\d{2})-(\d{4})/)
  const yyyyMm = modelId.match(/(\d{4})-(\d{2})/)

  let previewDate: Date | null = null
  if (mmYyyy) {
    const month = parseInt(mmYyyy[1], 10)
    const year = parseInt(mmYyyy[2], 10)
    if (month >= 1 && month <= 12 && year >= 2020) {
      previewDate = new Date(year, month - 1) // month is 0-indexed
    }
  } else if (yyyyMm) {
    const year = parseInt(yyyyMm[1], 10)
    const month = parseInt(yyyyMm[2], 10)
    if (month >= 1 && month <= 12 && year >= 2020) {
      previewDate = new Date(year, month - 1)
    }
  }

  if (!previewDate) return false

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - PREVIEW_EXPIRY_MONTHS)
  return previewDate < cutoff
}

/**
 * Shared model cleanup: removes deprecated, alpha, expired previews,
 * blacklisted, embeddings, guard, TTS, and other non-chat models.
 * @param models Raw models from models.dev
 * @param strict If true, also filters -image models without tool_call (used in getFilteredProviders)
 */
function cleanModels(
  models: Record<string, ModelsDevModel>,
  strict = false,
): Record<string, ModelsDevModel> {
  const result: Record<string, ModelsDevModel> = {}
  for (const [modelId, model] of Object.entries(models)) {
    // Status filters
    if (model.status === "deprecated") continue
    if (model.status === "alpha") continue
    // Blacklist
    if (MODEL_BLACKLIST.has(modelId)) continue
    // Expired previews (date > 3 months in the past)
    if (isExpiredPreview(modelId)) continue
    // Non-chat model types
    if (modelId.includes("embed") || modelId.includes("embedding")) continue
    if (modelId.includes("guard") || modelId.includes("safeguard")) continue
    if (modelId.includes("-tts")) continue
    if (modelId.includes("-live-")) continue
    if (modelId.includes("whisper") || modelId.includes("transcrib")) continue
    if (modelId.includes("moderation") || modelId.includes("omni-moderation")) continue
    // Image-only models (strict mode)
    if (strict && modelId.includes("-image") && !model.tool_call) continue
    // Models without output limit are probably not chat models
    if (!model.limit.output) continue
    result[modelId] = model
  }
  return result
}

// Aggregator providers that host models from many different providers.
// These need stricter filtering (tool_call required) to avoid 90+ model lists.
const AGGREGATOR_PROVIDERS = new Set([
  "openrouter",
  "amazon-bedrock",
  "azure",
])

/**
 * Determine if a model is "latest" in its family — same logic as OpenCode.
 * For each provider, group models by family. Within each family, only
 * keep the most recently released model. Also keep any model released
 * within the last 6 months regardless of family position.
 */
function selectLatestModels(
  models: Record<string, ModelsDevModel>,
): Set<string> {
  const now = Date.now()
  const recentCutoff = now - RECENT_MONTHS * MS_PER_MONTH
  const selected = new Set<string>()

  // Group by family
  const families = new Map<string, { id: string; date: number }[]>()
  for (const [modelId, model] of Object.entries(models)) {
    const family = model.family || modelId // models without family = their own family
    const date = model.release_date ? new Date(model.release_date).getTime() : 0

    if (!families.has(family)) families.set(family, [])
    families.get(family)!.push({ id: modelId, date })

    // Always include recent models
    if (date >= recentCutoff) {
      selected.add(modelId)
    }
  }

  // Pick newest per family
  for (const members of families.values()) {
    members.sort((a, b) => b.date - a.date)
    if (members[0]) selected.add(members[0].id)
  }

  return selected
}

/**
 * Get filtered providers for our supported set.
 * Removes deprecated, embeddings, guard, TTS, etc.
 * Then applies "latest per family" filtering like OpenCode.
 */
export async function getFilteredProviders(): Promise<ModelsDevProvider[]> {
  const data = await getModelsDevData()
  const result: ModelsDevProvider[] = []

  for (const [provId, provider] of Object.entries(data)) {
    if (!SUPPORTED_PROVIDERS.has(provId)) continue

    // Map provider ID if needed
    const mappedId = PROVIDER_ID_MAP[provId] || provId

    // Step 1: Remove junk models (deprecated, alpha, expired previews, etc.)
    const cleaned = cleanModels(provider.models, true)

    if (Object.keys(cleaned).length === 0) continue

    // Step 2: For aggregator providers (openrouter, bedrock, azure),
    // require tool_call support — they have too many models otherwise
    if (AGGREGATOR_PROVIDERS.has(provId)) {
      for (const [modelId, model] of Object.entries(cleaned)) {
        if (!model.tool_call) delete cleaned[modelId]
      }
    }

    // Step 3: Select only "latest" models per family (like OpenCode)
    const latestIds = selectLatestModels(cleaned)
    const filteredModels: Record<string, ModelsDevModel> = {}
    for (const [modelId, model] of Object.entries(cleaned)) {
      if (latestIds.has(modelId)) {
        filteredModels[modelId] = model
      }
    }

    if (Object.keys(filteredModels).length === 0) continue

    result.push({
      ...provider,
      id: mappedId,
      models: filteredModels,
    })
  }

  return result
}

/**
 * Get ALL non-deprecated models for a provider (no "latest" filtering).
 * Used when user explicitly wants to see everything.
 */
export async function getAllProviderModels(
  providerId: string,
): Promise<ModelsDevProvider | null> {
  const data = await getModelsDevData()

  const reverseMap: Record<string, string> = {}
  for (const [k, v] of Object.entries(PROVIDER_ID_MAP)) reverseMap[v] = k
  const devId = reverseMap[providerId] || providerId

  const provider = data[devId]
  if (!provider) return null

  const cleaned = cleanModels(provider.models)

  const mappedId = PROVIDER_ID_MAP[devId] || devId
  return { ...provider, id: mappedId, models: cleaned }
}

/**
 * Look up a specific model's metadata.
 */
export async function lookupModel(
  providerId: string,
  modelId: string,
): Promise<ModelsDevModel | null> {
  const data = await getModelsDevData()

  // Try direct provider match
  const reverseMap: Record<string, string> = {}
  for (const [k, v] of Object.entries(PROVIDER_ID_MAP)) reverseMap[v] = k

  const devProviderId = reverseMap[providerId] || providerId
  const provider = data[devProviderId]
  if (provider?.models[modelId]) {
    return provider.models[modelId]
  }

  // Try fuzzy match (model ID might differ slightly)
  if (provider) {
    for (const [mid, model] of Object.entries(provider.models)) {
      if (mid === modelId || mid.endsWith(modelId) || modelId.endsWith(mid)) {
        return model
      }
    }
  }

  return null
}

// ── Auto-refresh ─────────────────────────────────────────────

// Start background refresh cycle
const refreshTimer = setInterval(() => {
  refresh().catch(() => {})
}, REFRESH_INTERVAL)
refreshTimer.unref() // Don't keep process alive

// Initial fetch on module load (background)
refresh().catch(() => {})
