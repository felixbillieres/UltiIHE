/**
 * Zustand store for context/token tracking.
 *
 * Tracks the current context usage (estimated + real from server)
 * and exposes it for the UI context indicator.
 *
 * Two sources of truth:
 * 1. X-Context-Info header from /api/chat responses (post-send)
 * 2. /api/context endpoint polling (pre-send estimation)
 */

import { create } from "zustand"

export interface ContextInfo {
  /** Estimated tokens used (system + tools + messages) */
  total: number
  /** Available input budget (contextWindow - outputReserve) */
  limit: number
  /** Free tokens remaining */
  free: number
  /** Percentage used (0-100) */
  percentUsed: number
  /** Prompt tier: full | medium | minimal */
  promptTier: "full" | "medium" | "minimal"
  /** Number of tools sent to the model */
  toolCount: number
  /** Whether messages were pruned for this request */
  pruned: boolean
  /** Whether the backend recommends compaction */
  needsCompaction?: boolean
}

interface ContextStore {
  /** Current context info (null before first update) */
  info: ContextInfo | null
  /** Whether a context query is in flight */
  loading: boolean
  /** Last error */
  error: string | null

  /** Update context info from server response header */
  updateFromHeader: (headerValue: string) => void
  /** Update context info from direct data */
  update: (info: ContextInfo) => void
  /** Query the /api/context endpoint for current estimation */
  fetchEstimate: (params: {
    messages: Array<{ role: string; content: string }>
    providerId: string
    modelId: string
    containerIds?: string[]
    activeTerminalId?: string
    mode?: string
  }) => Promise<void>
  /** Clear context info (e.g., on session switch) */
  clear: () => void
}

export const useContextStore = create<ContextStore>((set) => ({
  info: null,
  loading: false,
  error: null,

  updateFromHeader: (headerValue: string) => {
    try {
      const info = JSON.parse(headerValue) as ContextInfo
      set({ info, error: null })
    } catch {
      // Invalid header — ignore
    }
  },

  update: (info: ContextInfo) => {
    set({ info, error: null })
  },

  fetchEstimate: async (params) => {
    set({ loading: true })
    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        set({ loading: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json()
      set({
        info: {
          total: data.total,
          limit: data.limit,
          free: data.free,
          percentUsed: data.percentUsed,
          promptTier: data.promptTier,
          toolCount: data.maxTools,
          pruned: data.pruneNeeded,
        },
        loading: false,
        error: null,
      })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  clear: () => set({ info: null, error: null }),
}))
