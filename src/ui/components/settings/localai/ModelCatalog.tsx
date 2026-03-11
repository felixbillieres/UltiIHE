import { useState, useMemo } from "react"
import {
  Download,
  Trash2,
  Play,
  Square,
  Loader2,
  Check,
  AlertTriangle,
  XCircle,
  Filter,
  Info,
} from "lucide-react"
import { useLocalAIStore, type LocalModelDef, type ModelFit } from "../../../stores/localAI"
import { TAG_STYLES, TIER_SPECS } from "./constants"
import { Section } from "./Section"

// ─── Model Catalog with Filters ─────────────────────────────

type FitFilter = "all" | "can-run" | "installed"

export function ModelCatalog({
  catalog,
  downloads,
  server,
  startingModel,
  onDownload,
  onCancel,
  onDelete,
  onStart,
}: {
  catalog: LocalModelDef[]
  downloads: Record<string, ReturnType<typeof useLocalAIStore.getState>["downloads"][string]>
  server: ReturnType<typeof useLocalAIStore.getState>["server"]
  startingModel: string | null
  onDownload: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onStart: (id: string) => void
}) {
  const [fitFilter, setFitFilter] = useState<FitFilter>("all")
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  // Collect all unique tags from catalog
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    catalog.forEach((m) => m.tags.forEach((t) => tags.add(t)))
    return Array.from(tags).sort()
  }, [catalog])

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  // Apply filters
  const filtered = useMemo(() => {
    return catalog.filter((m) => {
      // Fit filter
      if (fitFilter === "can-run" && m.fit === "too-large") return false
      if (fitFilter === "installed" && !m.installed) return false
      // Tag filter (AND: model must have ALL selected tags)
      if (activeTags.size > 0) {
        for (const tag of activeTags) {
          if (!m.tags.includes(tag)) return false
        }
      }
      return true
    })
  }, [catalog, fitFilter, activeTags])

  // Group filtered models by size
  const sizeToGB = (s: string) => parseFloat(s.replace("B", ""))
  const groups = [
    { label: "Small (1-4B)", models: filtered.filter((m) => sizeToGB(m.parameterSize) <= 4) },
    { label: "Medium (7-9B)", models: filtered.filter((m) => { const s = sizeToGB(m.parameterSize); return s >= 7 && s <= 9 }) },
    { label: "Large (13-14B)", models: filtered.filter((m) => { const s = sizeToGB(m.parameterSize); return s >= 13 && s <= 14 }) },
    { label: "XL (27-32B)", models: filtered.filter((m) => { const s = sizeToGB(m.parameterSize); return s >= 27 && s <= 32 }) },
    { label: "XXL (47B+)", models: filtered.filter((m) => sizeToGB(m.parameterSize) >= 47) },
  ].filter((g) => g.models.length > 0)

  // Check if any model in a group can't run
  const tierHasLargeModels = (models: LocalModelDef[]) => models.some((m) => m.fit === "too-large")

  const fitCount = {
    all: catalog.length,
    canRun: catalog.filter((m) => m.fit !== "too-large").length,
    installed: catalog.filter((m) => m.installed).length,
  }

  return (
    <Section title="Models">
      {/* Filter bar */}
      <div className="space-y-2 mb-4">
        {/* Fit filters */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3 h-3 text-text-weaker shrink-0" />
          <FilterPill
            active={fitFilter === "all"}
            onClick={() => setFitFilter("all")}
            label={`All (${fitCount.all})`}
          />
          <FilterPill
            active={fitFilter === "can-run"}
            onClick={() => setFitFilter("can-run")}
            label={`Can run (${fitCount.canRun})`}
            color="text-status-success"
          />
          <FilterPill
            active={fitFilter === "installed"}
            onClick={() => setFitFilter("installed")}
            label={`Installed (${fitCount.installed})`}
            color="text-accent"
          />
        </div>

        {/* Tag filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2 py-0.5 text-[10px] rounded-full font-sans transition-all ${
                activeTags.has(tag)
                  ? `${TAG_STYLES[tag] || "bg-surface-3 text-text-base"} ring-1 ring-current/30`
                  : "bg-surface-2 text-text-weaker hover:text-text-base"
              }`}
            >
              {tag}
            </button>
          ))}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="px-2 py-0.5 text-[10px] text-text-weaker hover:text-text-base font-sans underline"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {groups.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs text-text-weaker font-sans">No models match your filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const specs = TIER_SPECS[group.label]
            const showSpecs = tierHasLargeModels(group.models)
            return (
              <div key={group.label}>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <h4 className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wider">
                    {group.label}
                  </h4>
                  {specs && (
                    <span className="text-[9px] text-text-weaker font-sans">
                      {specs.vram} / {specs.ram}
                    </span>
                  )}
                </div>

                {/* Minimum specs banner for tiers with too-large models */}
                {showSpecs && specs && (
                  <div className="flex items-start gap-2 px-3 py-2 mb-1.5 rounded-lg bg-status-warning/8 border border-status-warning/15">
                    <Info className="w-3 h-3 text-status-warning shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-status-warning font-sans font-medium">Minimum: </span>
                      <span className="text-[10px] text-text-weak font-sans">
                        {specs.vram} or {specs.ram} (CPU mode) — {specs.note}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  {group.models.map((model) => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      download={downloads[model.id]}
                      isRunning={server.running && server.modelId === model.id}
                      isStarting={startingModel === model.id}
                      onDownload={() => onDownload(model.id)}
                      onCancel={() => onCancel(model.id)}
                      onDelete={() => onDelete(model.id)}
                      onStart={() => onStart(model.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

export function FilterPill({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[10px] rounded-full font-sans transition-all ${
        active
          ? `bg-accent/15 text-accent ring-1 ring-accent/30`
          : "bg-surface-2 text-text-weaker hover:text-text-base"
      }`}
    >
      {label}
    </button>
  )
}

export function FitBadge({ fit }: { fit: ModelFit }) {
  if (fit === "ok") return (
    <span className="flex items-center gap-0.5 text-[9px] text-status-success font-sans">
      <Check className="w-2.5 h-2.5" /> OK
    </span>
  )
  if (fit === "tight") return (
    <span className="flex items-center gap-0.5 text-[9px] text-status-warning font-sans">
      <AlertTriangle className="w-2.5 h-2.5" /> Tight
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-status-error font-sans">
      <XCircle className="w-2.5 h-2.5" /> Too large
    </span>
  )
}

export function ModelRow({
  model,
  download,
  isRunning,
  isStarting,
  onDownload,
  onCancel,
  onDelete,
  onStart,
}: {
  model: LocalModelDef
  download?: ReturnType<typeof useLocalAIStore.getState>["downloads"][string]
  isRunning: boolean
  isStarting: boolean
  onDownload: () => void
  onCancel: () => void
  onDelete: () => void
  onStart: () => void
}) {
  const isDownloading = download?.status === "downloading"

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
      isRunning
        ? "bg-accent/8 border-accent/30"
        : model.fit === "too-large"
          ? "bg-surface-0/50 border-border-weak opacity-60"
          : "bg-surface-0 border-border-weak"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-strong font-sans font-medium truncate">
            {model.name}
          </span>
          <span className="text-[10px] text-text-weaker font-mono shrink-0">
            {model.quantization}
          </span>
          <FitBadge fit={model.fit} />
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[10px] text-text-weaker font-sans">
            {(model.fileSizeMB / 1024).toFixed(1)} GB
          </span>
          <span className="text-[10px] text-text-weaker font-mono">
            {model.contextWindow >= 128_000 ? "128k" : `${(model.contextWindow / 1024).toFixed(0)}k`} ctx
          </span>
          <span className="text-[10px] text-text-weaker font-sans">
            ~{(model.vramRequiredMB / 1024).toFixed(0)} GB VRAM
          </span>
          {model.tags.map((tag) => (
            <span
              key={tag}
              className={`text-[9px] px-1.5 py-0.5 rounded-full font-sans ${TAG_STYLES[tag] || "bg-surface-2 text-text-weaker"}`}
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-text-weaker font-sans mt-0.5">{model.description}</p>

        {/* Download progress */}
        {isDownloading && download && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-accent font-sans">
                {download.downloadedMB} / {download.totalMB} MB
              </span>
              <span className="text-[10px] text-accent font-mono">{download.percent}%</span>
            </div>
            <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${download.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isRunning ? (
          <span className="flex items-center gap-1 text-[10px] text-accent font-sans font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
            Running
          </span>
        ) : isStarting ? (
          <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
        ) : isDownloading ? (
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="Cancel download"
          >
            <Square className="w-3 h-3 text-status-error" />
          </button>
        ) : model.installed ? (
          <>
            <button
              onClick={onStart}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-accent/15 text-accent rounded-md hover:bg-accent/25 transition-colors font-sans font-medium"
              title="Start model"
            >
              <Play className="w-2.5 h-2.5" />
              Run
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded hover:bg-surface-2 transition-colors"
              title="Delete model"
            >
              <Trash2 className="w-3 h-3 text-text-weaker hover:text-status-error" />
            </button>
          </>
        ) : model.fit !== "too-large" ? (
          <button
            onClick={onDownload}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-surface-2 text-text-base rounded-md hover:bg-surface-3 transition-colors font-sans font-medium"
            title="Download model"
          >
            <Download className="w-2.5 h-2.5" />
            {(model.fileSizeMB / 1024).toFixed(1)} GB
          </button>
        ) : (
          <span className="text-[9px] text-text-weaker font-sans italic">Too large</span>
        )}
      </div>
    </div>
  )
}
