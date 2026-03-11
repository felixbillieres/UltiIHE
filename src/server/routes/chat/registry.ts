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
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { getServerStatus, startServer } from "../../services/local/server"
import { listInstalledModels } from "../../services/local/models"

/**
 * Create a provider registry scoped to the current request.
 * Each provider is lazy-initialized with the API key from the request body.
 */
export async function createRegistry(providerId: string, apiKey: string, modelId?: string, baseUrl?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providers: Record<string, () => any> = {
    anthropic: () => createAnthropic({ apiKey }),
    openai: () => createOpenAI({ apiKey }),
    google: () => createGoogleGenerativeAI({ apiKey }),
    mistral: () => createMistral({ apiKey }),
    groq: () => createGroq({ apiKey }),
    openrouter: () => createOpenRouter({ apiKey }),
    xai: () => createXai({ apiKey }),
    deepseek: () => createDeepSeek({ apiKey }),
    togetherai: () => createTogetherAI({ apiKey }),
    perplexity: () => createPerplexity({ apiKey }),
    fireworks: () => createFireworks({ apiKey }),
    cerebras: () => createCerebras({ apiKey }),
    "amazon-bedrock": () =>
      createAmazonBedrock({
        region: process.env.AWS_REGION || "us-east-1",
        apiKey: apiKey || process.env.AWS_BEARER_TOKEN_BEDROCK,
      }),
    azure: () =>
      createAzure({
        apiKey,
        resourceName: baseUrl || process.env.AZURE_RESOURCE_NAME || "",
      }),
    cohere: () => createCohere({ apiKey }),
    local: async () => {
      let status = getServerStatus()

      // Auto-start: if server isn't running but we know which model the user wants, start it
      if (!status.running && modelId) {
        const installed = listInstalledModels()
        const model = installed.find((m) => m.id === modelId)
        if (model) {
          console.log(`[Local AI] Auto-starting server for model: ${modelId}`)
          await startServer({ modelId, modelPath: model.filePath })
          status = getServerStatus()
        }
      }

      if (!status.running || !status.baseUrl) {
        throw new Error("Local AI server is not running. Install and select a local model to auto-start it.")
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
