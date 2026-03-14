import { createProviderRegistry } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createXai } from "@ai-sdk/xai"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createFireworks } from "@ai-sdk/fireworks"
import { createCerebras } from "@ai-sdk/cerebras"
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAzure } from "@ai-sdk/azure"
import { createCohere } from "@ai-sdk/cohere"
import { createMoonshotAI } from "@ai-sdk/moonshotai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { getServerStatus, startServer } from "../../services/local/server"
import { listInstalledModels } from "../../services/local/models"

// --- SDK instance caching ---
// Simple hash for cache keys (not crypto — just dedup)
function quickHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdkCache = new Map<string, any>()
const MAX_CACHE_SIZE = 20

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCachedOrCreate(key: string, factory: () => any): any {
  if (sdkCache.has(key)) return sdkCache.get(key)
  // Evict oldest if too many
  if (sdkCache.size >= MAX_CACHE_SIZE) {
    const firstKey = sdkCache.keys().next().value
    if (firstKey) sdkCache.delete(firstKey)
  }
  const sdk = factory()
  sdkCache.set(key, sdk)
  return sdk
}

export function clearRegistryCache() {
  sdkCache.clear()
}

/**
 * Create a provider registry scoped to the current request.
 * Each provider is lazy-initialized with the API key from the request body.
 * SDK instances are cached by provider+apiKey for cacheable providers.
 * Local and custom providers are NOT cached (they depend on runtime state).
 */
export async function createRegistry(providerId: string, apiKey: string, modelId?: string, baseUrl?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providers: Record<string, () => any> = {
    anthropic: () => getCachedOrCreate(`anthropic:${quickHash(apiKey)}`, () =>
      createAnthropic({
        apiKey,
        headers: { "anthropic-beta": "interleaved-thinking-2025-05-14" },
      })
    ),
    openai: () => getCachedOrCreate(`openai:${quickHash(apiKey)}`, () =>
      createOpenAI({ apiKey })
    ),
    google: () => getCachedOrCreate(`google:${quickHash(apiKey)}`, () =>
      createGoogleGenerativeAI({ apiKey })
    ),
    mistral: () => getCachedOrCreate(`mistral:${quickHash(apiKey)}`, () =>
      createMistral({ apiKey })
    ),
    groq: () => getCachedOrCreate(`groq:${quickHash(apiKey)}`, () =>
      createGroq({ apiKey })
    ),
    openrouter: () => getCachedOrCreate(`openrouter:${quickHash(apiKey)}`, () =>
      createOpenRouter({
        apiKey,
        headers: {
          "X-Title": "Exegol IHE",
          "HTTP-Referer": "https://github.com/ExegolIHE",
        },
      })
    ),
    xai: () => getCachedOrCreate(`xai:${quickHash(apiKey)}`, () =>
      createXai({ apiKey })
    ),
    deepseek: () => getCachedOrCreate(`deepseek:${quickHash(apiKey)}`, () =>
      createDeepSeek({ apiKey })
    ),
    togetherai: () => getCachedOrCreate(`togetherai:${quickHash(apiKey)}`, () =>
      createTogetherAI({ apiKey })
    ),
    perplexity: () => getCachedOrCreate(`perplexity:${quickHash(apiKey)}`, () =>
      createPerplexity({ apiKey })
    ),
    fireworks: () => getCachedOrCreate(`fireworks:${quickHash(apiKey)}`, () =>
      createFireworks({ apiKey })
    ),
    cerebras: () => getCachedOrCreate(`cerebras:${quickHash(apiKey)}`, () =>
      createCerebras({ apiKey })
    ),
    "amazon-bedrock": () => getCachedOrCreate(`amazon-bedrock:${quickHash(apiKey)}`, () =>
      createAmazonBedrock({
        region: process.env.AWS_REGION || "us-east-1",
        apiKey: apiKey || process.env.AWS_BEARER_TOKEN_BEDROCK,
      })
    ),
    azure: () => getCachedOrCreate(`azure:${quickHash(apiKey)}:${quickHash(baseUrl || "")}`, () =>
      createAzure({
        apiKey,
        resourceName: baseUrl || process.env.AZURE_RESOURCE_NAME || "",
      })
    ),
    cohere: () => getCachedOrCreate(`cohere:${quickHash(apiKey)}`, () =>
      createCohere({ apiKey })
    ),
    moonshotai: () => getCachedOrCreate(`moonshotai:${quickHash(apiKey)}`, () =>
      createMoonshotAI({ apiKey })
    ),
    minimax: () => getCachedOrCreate(`minimax:${quickHash(apiKey)}`, () =>
      createOpenAICompatible({
        name: "minimax",
        baseURL: "https://api.minimax.io/v1",
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    ),
    // local and custom are NOT cached — they depend on runtime state
    local: async () => {
      let status = getServerStatus()

      // Auto-start: if server isn't running but we know which model the user wants, start it.
      // The frontend also starts the server on model selection, so this is a fallback.
      if (!status.running && modelId) {
        const installed = listInstalledModels()
        const model = installed.find((m) => m.id === modelId)
        if (model) {
          console.log(`[Local AI] Auto-starting server for model: ${modelId}`)
          await startServer({ modelId, modelPath: model.filePath })
          status = getServerStatus()
        }
      }

      // If still not running, wait briefly — the frontend might be starting it
      if (!status.running) {
        for (let i = 0; i < 20; i++) {
          await Bun.sleep(500)
          status = getServerStatus()
          if (status.running) break
        }
      }

      if (!status.running || !status.baseUrl) {
        throw new Error("Local AI server is not running. Select a local model to start it.")
      }
      return createOpenAICompatible({
        name: "local",
        baseURL: `${status.baseUrl}/v1`,
      })
    },
    custom: () => {
      if (!baseUrl) {
        throw new Error("Custom provider requires a base URL. Configure it in Settings > Local AI > Custom Endpoints.")
      }
      // Normalize: ensure /v1 suffix for OpenAI-compatible APIs
      const url = baseUrl.replace(/\/+$/, "")
      const finalUrl = url.endsWith("/v1") ? url : `${url}/v1`
      return createOpenAICompatible({
        name: "custom",
        baseURL: finalUrl,
        headers: apiKey && apiKey !== "none" ? { Authorization: `Bearer ${apiKey}` } : {},
      })
    },
  }

  const factory = providers[providerId]
  if (!factory) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  // Build registry entries: only register the requested provider
  // This avoids needing API keys for unused providers
  const provider = await factory()
  return createProviderRegistry({
    [providerId]: provider,
  })
}
