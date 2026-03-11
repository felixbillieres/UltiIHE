/**
 * Provider catalog API — serves models.dev data to the frontend.
 *
 * GET /api/providers — returns all supported providers with their models
 * GET /api/providers/refresh — force refresh from models.dev
 */

import { Hono } from "hono"
import {
  getFilteredProviders,
  getAllProviderModels,
  refresh,
  type ModelsDevProvider,
  type ModelsDevModel,
} from "../services/models-dev"
import { listInstalledModels } from "../services/local/models"
import { LOCAL_MODEL_CATALOG } from "../services/local/modelCatalog"
import { getServerStatus } from "../services/local/server"

export const providerRoutes = new Hono()

// ── Provider metadata we add on top of models.dev ────────────

interface ProviderMeta {
  freeTier?: boolean
  freeNote?: string
  signupUrl?: string
  description?: string
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: {
    signupUrl: "https://console.anthropic.com/",
    description: "$5 free credits on signup",
  },
  openai: {
    signupUrl: "https://platform.openai.com/api-keys",
    description: "Pay-as-you-go",
  },
  google: {
    freeTier: true,
    freeNote: "Free API key with rate limits",
    signupUrl: "https://aistudio.google.com/apikey",
    description: "Free API key, generous limits",
  },
  mistral: {
    signupUrl: "https://console.mistral.ai/api-keys",
    description: "Pay-as-you-go, Codestral free for coding",
  },
  groq: {
    freeTier: true,
    freeNote: "Free tier with generous rate limits",
    signupUrl: "https://console.groq.com/keys",
    description: "Free tier, ultra-fast inference",
  },
  openrouter: {
    freeTier: true,
    freeNote: "Some free models available",
    signupUrl: "https://openrouter.ai/keys",
    description: "Multi-provider gateway",
  },
  xai: {
    freeTier: true,
    freeNote: "$25 free credits monthly",
    signupUrl: "https://console.x.ai/",
    description: "$25/mo free credits for Grok",
  },
  deepseek: {
    signupUrl: "https://platform.deepseek.com/api_keys",
    description: "Very cheap, great reasoning",
  },
  togetherai: {
    freeTier: true,
    freeNote: "$5 free credits on signup",
    signupUrl: "https://api.together.ai/settings/api-keys",
    description: "$5 free credits on signup",
  },
  perplexity: {
    signupUrl: "https://www.perplexity.ai/settings/api",
    description: "Search-augmented AI",
  },
  fireworks: {
    freeTier: true,
    freeNote: "Free tier with rate limits",
    signupUrl: "https://fireworks.ai/api-keys",
    description: "Free tier, fast inference",
  },
  cerebras: {
    freeTier: true,
    freeNote: "Free tier available",
    signupUrl: "https://cloud.cerebras.ai/",
    description: "Free tier, fastest inference",
  },
  cohere: {
    freeTier: true,
    freeNote: "Free trial API key",
    signupUrl: "https://dashboard.cohere.com/api-keys",
    description: "Free trial key",
  },
}

// ── Convert models.dev model → frontend ModelInfo ────────────

function toModelInfo(model: ModelsDevModel) {
  return {
    id: model.id,
    name: model.name,
    contextWindow: model.limit.context,
    maxOutput: model.limit.output,
    reasoning: model.reasoning,
    toolCalling: model.tool_call,
    vision: model.modalities?.input?.includes("image") ?? false,
    costPer1kInput: model.cost ? model.cost.input / 1000 : undefined, // models.dev is per 1M
    costPer1kOutput: model.cost ? model.cost.output / 1000 : undefined,
    status: model.status,
  }
}

// ── Convert models.dev provider → frontend ProviderInfo ──────

function toProviderInfo(provider: ModelsDevProvider) {
  const meta = PROVIDER_META[provider.id] || {}
  return {
    id: provider.id,
    name: provider.name,
    type: provider.id,
    envVar: provider.env?.[0],
    models: Object.values(provider.models).map(toModelInfo),
    ...meta,
  }
}

// ── Build local provider info ────────────────────────────────

function buildLocalProvider() {
  const installed = listInstalledModels()
  const status = getServerStatus()

  return {
    id: "local",
    name: "Local AI",
    type: "local",
    freeTier: true,
    freeNote: "Runs on your machine — no API key needed",
    description: "Run models locally via llama.cpp (GGUF)",
    models: installed.map((m) => {
      const catalogEntry = LOCAL_MODEL_CATALOG.find((c) => c.id === m.id)
      return {
        id: m.id,
        name: catalogEntry?.name || m.id,
        contextWindow: catalogEntry?.contextWindow || 4096,
        maxOutput: Math.min(4096, (catalogEntry?.contextWindow || 4096) * 0.25),
        reasoning: catalogEntry?.reasoning || false,
        toolCalling: catalogEntry?.toolCalling || false,
        vision: false,
        installed: true,
        fileSizeMB: catalogEntry?.fileSizeMB,
        parameterSize: catalogEntry?.parameterSize,
      }
    }),
    serverStatus: {
      running: status.running,
      modelId: status.modelId,
      port: status.port,
    },
    catalog: LOCAL_MODEL_CATALOG.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      parameterSize: m.parameterSize,
      quantization: m.quantization,
      fileSizeMB: m.fileSizeMB,
      vramRequiredMB: m.vramRequiredMB,
      contextWindow: m.contextWindow,
      toolCalling: m.toolCalling,
      reasoning: m.reasoning,
      tags: m.tags,
      installed: installed.some((i) => i.id === m.id),
    })),
  }
}

// ── Routes ───────────────────────────────────────────────────

providerRoutes.get("/providers", async (c) => {
  try {
    const providers = await getFilteredProviders()
    const cloudProviders = providers.map(toProviderInfo)

    // Add custom provider (always available)
    const customProvider = {
      id: "custom",
      name: "Custom Endpoint",
      type: "custom",
      description: "OpenAI-compatible endpoint",
      models: [],
    }

    return c.json({
      providers: [...cloudProviders, customProvider],
      local: buildLocalProvider(),
    })
  } catch (err) {
    console.error("[providers] Error:", err)
    return c.json({ error: "Failed to load providers" }, 500)
  }
})

// Get ALL models for a specific provider (no "latest" filtering)
providerRoutes.get("/providers/:id/models", async (c) => {
  try {
    const providerId = c.req.param("id")
    const provider = await getAllProviderModels(providerId)
    if (!provider) {
      return c.json({ error: "Provider not found" }, 404)
    }
    const meta = PROVIDER_META[provider.id] || {}
    return c.json({
      ...toProviderInfo(provider),
      ...meta,
      totalModels: Object.keys(provider.models).length,
    })
  } catch (err) {
    return c.json({ error: "Failed to load provider models" }, 500)
  }
})

providerRoutes.post("/providers/refresh", async (c) => {
  try {
    await refresh()
    return c.json({ status: "ok" })
  } catch (err) {
    return c.json({ error: "Refresh failed" }, 500)
  }
})
