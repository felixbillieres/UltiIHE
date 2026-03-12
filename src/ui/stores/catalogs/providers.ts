import type { ProviderInfo } from "../settingsTypes"

// Local provider is handled separately (no API key, managed via Local AI settings)
export const LOCAL_PROVIDER: ProviderInfo = {
  id: "local",
  name: "Local AI",
  type: "local",
  freeTier: true,
  freeNote: "Runs on your machine — no API key needed",
  description: "Run models locally via llama.cpp (GGUF)",
  models: [], // Dynamic — populated from installed models
}

// Empty — all provider/model data is fetched dynamically from /api/providers (models.dev)
export const PROVIDER_CATALOG: ProviderInfo[] = []
