/**
 * Dynamic provider catalog — fetches from /api/providers (models.dev data).
 *
 * Starts empty and loads all provider/model data from the API on mount.
 */

import { create } from "zustand"
import type { ProviderInfo, ModelInfo } from "./settingsTypes"
import { LOCAL_PROVIDER } from "./settingsCatalogs"

interface ProviderCatalogStore {
  // Data
  providers: ProviderInfo[]
  localProvider: ProviderInfo
  loading: boolean
  lastFetch: number
  error: string | null

  // Actions
  fetch: () => Promise<void>
  refresh: () => Promise<void>

  // Getters
  getProvider: (id: string) => ProviderInfo | undefined
  getModel: (providerId: string, modelId: string) => ModelInfo | undefined
  findModel: (modelId: string) => ModelInfo | undefined
  allProviders: () => ProviderInfo[]
}

export const useProviderCatalog = create<ProviderCatalogStore>((set, get) => ({
  providers: [], // Populated dynamically from /api/providers
  localProvider: LOCAL_PROVIDER,
  loading: false,
  lastFetch: 0,
  error: null,

  fetch: async () => {
    // Don't refetch within 5 minutes
    if (Date.now() - get().lastFetch < 5 * 60 * 1000) return
    if (get().loading) return

    set({ loading: true, error: null })
    try {
      const res = await fetch("/api/providers")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (data.providers?.length > 0) {
        set({
          providers: data.providers,
          localProvider: data.local || LOCAL_PROVIDER,
          lastFetch: Date.now(),
          loading: false,
        })
        console.log(`[ProviderCatalog] Loaded ${data.providers.length} providers from models.dev`)
      } else {
        set({ loading: false })
      }
    } catch (e) {
      console.warn("[ProviderCatalog] Fetch failed, catalog will be empty until retry:", e)
      set({ loading: false, error: (e as Error).message })
    }
  },

  refresh: async () => {
    set({ lastFetch: 0 }) // Force refetch
    try {
      await fetch("/api/providers/refresh", { method: "POST" })
    } catch {}
    await get().fetch()
  },

  getProvider: (id: string) => {
    const state = get()
    if (id === "local") return state.localProvider
    return state.providers.find((p) => p.id === id)
  },

  getModel: (providerId: string, modelId: string) => {
    const provider = get().getProvider(providerId)
    return provider?.models.find((m) => m.id === modelId)
  },

  findModel: (modelId: string) => {
    const state = get()
    // Search all providers
    for (const provider of state.providers) {
      const model = provider.models.find((m) => m.id === modelId)
      if (model) return model
    }
    // Search local
    const localModel = state.localProvider.models.find((m) => m.id === modelId)
    if (localModel) return localModel
    return undefined
  },

  allProviders: () => {
    const state = get()
    return [...state.providers, state.localProvider]
  },
}))

// Auto-fetch on store creation (client-side only)
if (typeof window !== "undefined") {
  // Small delay to not block initial render
  setTimeout(() => {
    useProviderCatalog.getState().fetch()
  }, 500)
}
