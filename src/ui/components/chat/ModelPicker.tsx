import { useState, useRef, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { useSettingsStore } from "../../stores/settings"
import { useProviderCatalog } from "../../stores/providerCatalog"
import { useLocalAIStore } from "../../stores/localAI"
import { Zap, Cpu, Search, Clock } from "lucide-react"
import { ProviderIcon } from "../provider-icons/ProviderIcon"
import { fmtCtx } from "../../utils/format"

const PROVIDER_SORT_ORDER = [
  "anthropic", "openai", "google", "mistral", "xai", "deepseek",
  "groq", "openrouter", "moonshotai", "minimax", "togetherai",
  "fireworks", "cerebras", "cohere", "perplexity",
]

function StatusBadge({ status }: { status: "alpha" | "beta" | "deprecated" }) {
  const colors = {
    alpha: "bg-yellow-500/15 text-yellow-400",
    beta: "bg-blue-500/15 text-blue-400",
    deprecated: "bg-red-500/15 text-red-400",
  }
  return (
    <span className={`px-1 py-px rounded text-[9px] font-sans font-medium ${colors[status]}`}>
      {status}
    </span>
  )
}

export function ModelPicker({
  currentProvider,
  currentModel,
  onSelect,
  onClose,
  anchorRef,
}: {
  currentProvider: string
  currentModel: string
  onSelect: (providerId: string, modelId: string) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement>
}) {
  const providers = useSettingsStore((s) => s.providers)
  const recentModels = useSettingsStore((s) => s.recentModels)
  const { catalog, server, fetchModels } = useLocalAIStore()
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ bottom: 0, left: 0, maxWidth: 320 })
  const [search, setSearch] = useState("")

  // Position relative to anchor button via portal
  useEffect(() => {
    if (!anchorRef.current) return
    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect()
      const maxW = Math.min(320, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - maxW - 8))
      setPos({
        bottom: window.innerHeight - rect.top + 4,
        left,
        maxWidth: maxW,
      })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [anchorRef])

  // Focus search input on open
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Fetch local model catalog when picker opens
  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [onClose, anchorRef])

  const configuredProviderIds = new Set(
    providers.filter((p) => p.enabled && p.apiKey).map((p) => p.id),
  )

  const catalogProviders = useProviderCatalog((s) => s.providers)

  // Sort providers by importance
  const availableProviders = useMemo(() => {
    const filtered = catalogProviders.filter((p) => configuredProviderIds.has(p.id))
    return [...filtered].sort((a, b) => {
      const ai = PROVIDER_SORT_ORDER.indexOf(a.id)
      const bi = PROVIDER_SORT_ORDER.indexOf(b.id)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [catalogProviders, configuredProviderIds])

  // Installed local models
  const installedLocal = catalog.filter((m) => m.installed)

  // Search filter
  const q = search.toLowerCase().trim()
  const filteredLocal = q
    ? installedLocal.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
      )
    : installedLocal
  const filteredProviders = useMemo(() => {
    if (!q) return availableProviders
    return availableProviders
      .map((p) => ({
        ...p,
        models: p.models.filter(
          (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.models.length > 0)
  }, [availableProviders, q])

  // Resolve recent models for display
  const recentEntries = useMemo(() => {
    if (q) return [] // hide recents when searching
    return recentModels
      .map((r) => {
        // Look up in catalog
        const provider = catalogProviders.find((p) => p.id === r.providerId)
        const model = provider?.models.find((m) => m.id === r.modelId)
        // Check local catalog
        const localModel = r.providerId === "local" ? catalog.find((m) => m.id === r.modelId) : null
        const displayName = localModel?.name || model?.name || r.modelId.split("/").pop() || r.modelId
        const providerName = localModel ? "Local" : provider?.name || r.providerId
        return { ...r, displayName, providerName, model }
      })
  }, [recentModels, catalogProviders, catalog, q])

  const hasAnything = availableProviders.length > 0 || installedLocal.length > 0

  const content = !hasAnything ? (
    <div
      ref={ref}
      className="fixed z-[9999] bg-surface-2 border border-border-base rounded-lg shadow-xl p-3"
      style={{ bottom: pos.bottom, left: pos.left, width: Math.min(256, pos.maxWidth) }}
    >
      <p className="text-xs text-text-weaker font-sans">
        No providers configured. Go to Settings to add an API key, or install a local model.
      </p>
    </div>
  ) : (
    <div
      ref={ref}
      className="fixed z-[9999] max-h-[400px] overflow-y-auto bg-surface-2 border border-border-base rounded-xl shadow-xl py-1"
      style={{ bottom: pos.bottom, left: pos.left, width: pos.maxWidth }}
    >
      {/* Search input */}
      <div className="px-2 pt-1 pb-1.5">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-0 border border-border-weak">
          <Search className="w-3 h-3 text-text-weaker shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="flex-1 bg-transparent text-xs font-sans text-text-base placeholder:text-text-weaker outline-none"
          />
        </div>
      </div>

      {/* Recent models */}
      {recentEntries.length > 0 && (
        <div>
          <div className="px-3 py-1.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-text-weaker" />
            <span className="text-[10px] text-text-weaker uppercase tracking-wide font-sans font-semibold">
              Recent
            </span>
          </div>
          {recentEntries.map((entry) => {
            const isSelected =
              entry.providerId === currentProvider && entry.modelId === currentModel
            return (
              <button
                key={`${entry.providerId}-${entry.modelId}`}
                onClick={() => onSelect(entry.providerId, entry.modelId)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent"
                    : "text-text-base hover:bg-surface-3"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-sans truncate">{entry.displayName}</span>
                    {entry.model?.status && <StatusBadge status={entry.model.status} />}
                  </div>
                  <span className="text-[10px] text-text-weaker font-sans">{entry.providerName}</span>
                </div>
                {isSelected && <Zap className="w-3 h-3 text-accent shrink-0" />}
              </button>
            )
          })}
          <div className="mx-3 my-1 border-t border-border-weak" />
        </div>
      )}

      {/* Local models — shown first if any are installed */}
      {filteredLocal.length > 0 && (
        <div>
          <div className="px-3 py-1.5 flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-accent" />
            <span className="text-[10px] text-accent uppercase tracking-wide font-sans font-semibold">
              Local Models
            </span>
            <span className="text-[9px] text-text-weaker font-sans">Free</span>
          </div>
          {filteredLocal.map((model) => {
            const isSelected = currentProvider === "local" && currentModel === model.id
            const isRunning = server.running && server.modelId === model.id
            return (
              <button
                key={model.id}
                onClick={() => onSelect("local", model.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent"
                    : "text-text-base hover:bg-surface-3"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-sans font-medium truncate">{model.name}</span>
                    <span className="text-[10px] text-text-weaker font-mono">{model.quantization}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-text-weaker font-mono">
                      {fmtCtx(model.contextWindow)} ctx
                    </span>
                    <span className="text-[10px] text-text-weaker font-sans">
                      {(model.fileSizeMB / 1024).toFixed(1)} GB
                    </span>
                    {model.reasoning && (
                      <span className="text-[10px] text-purple-400">reasoning</span>
                    )}
                    {model.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[10px] text-text-weaker">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {isRunning && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-status-success/12 text-status-success text-[9px] font-sans">
                      <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                      Live
                    </span>
                  )}
                  {!isRunning && isSelected && (
                    <span className="text-[9px] text-accent font-sans">Will auto-start</span>
                  )}
                  {isSelected && <Zap className="w-3 h-3 text-accent" />}
                </div>
              </button>
            )
          })}
          {/* Separator between local and cloud */}
          {filteredProviders.length > 0 && (
            <div className="mx-3 my-1 border-t border-border-weak" />
          )}
        </div>
      )}

      {/* Cloud providers */}
      {filteredProviders.map((provider) => (
        <div key={provider.id}>
          <div className="px-3 py-1.5 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium flex items-center gap-1.5">
            <ProviderIcon id={provider.id} className="w-3.5 h-3.5 shrink-0" />
            {provider.name}
          </div>
          {provider.models.map((model) => {
            const isSelected =
              provider.id === currentProvider && model.id === currentModel
            return (
              <button
                key={model.id}
                onClick={() => onSelect(provider.id, model.id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent"
                    : "text-text-base hover:bg-surface-3"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-sans truncate">{model.name}</span>
                    {model.status && <StatusBadge status={model.status} />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-weaker font-mono">
                      {fmtCtx(model.contextWindow)} ctx
                    </span>
                    {model.reasoning && (
                      <span className="text-[10px] text-purple-400">
                        reasoning
                      </span>
                    )}
                    {model.vision && (
                      <span className="text-[10px] text-blue-400">vision</span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <Zap className="w-3 h-3 text-accent shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      ))}

      {/* No results */}
      {q && filteredLocal.length === 0 && filteredProviders.length === 0 && (
        <div className="px-3 py-3 text-xs text-text-weaker font-sans text-center">
          No models matching "{search}"
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
