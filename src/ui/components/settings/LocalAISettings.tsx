/**
 * Local AI settings panel.
 * Hardware detection, binary install, model catalog with filters, server control, custom endpoints.
 */

import { useState, useEffect, useMemo } from "react"
import { useLocalAIStore, type LocalModelDef, type ModelFit } from "../../stores/localAI"
import { useSettingsStore } from "../../stores/settings"
import {
  Cpu,
  HardDrive,
  Download,
  Trash2,
  Play,
  Square,
  Loader2,
  Check,
  AlertTriangle,
  XCircle,
  Monitor,
  Zap,
  Server,
  Globe,
  Plus,
  Filter,
  Info,
} from "lucide-react"

// ─── Tag colors ─────────────────────────────────────────────

const TAG_STYLES: Record<string, string> = {
  general: "bg-blue-500/15 text-blue-400",
  coding: "bg-green-500/15 text-green-400",
  reasoning: "bg-purple-500/15 text-purple-400",
  uncensored: "bg-red-500/15 text-red-400",
  fast: "bg-yellow-500/15 text-yellow-400",
}

// ─── Minimum specs per tier ─────────────────────────────────

const TIER_SPECS: Record<string, { vram: string; ram: string; note: string }> = {
  "Small (1-4B)": { vram: "2-4 GB VRAM", ram: "8 GB RAM", note: "Runs on any modern machine" },
  "Medium (7-9B)": { vram: "6-8 GB VRAM", ram: "16 GB RAM", note: "GTX 1070+ / RTX 2060+ / M1+" },
  "Large (13-14B)": { vram: "10-12 GB VRAM", ram: "32 GB RAM", note: "RTX 3080+ / RTX 4070+ / M1 Pro+" },
  "XL (27-32B)": { vram: "18-24 GB VRAM", ram: "64 GB RAM", note: "RTX 3090 / RTX 4090 / M2 Max+" },
  "XXL (47B+)": { vram: "28-48 GB VRAM", ram: "64+ GB RAM", note: "Multi-GPU / M2 Ultra / CPU offloading" },
}

// ─── Main component ─────────────────────────────────────────

export function LocalAISettings() {
  const {
    hardware,
    binary,
    catalog,
    server,
    downloads,
    loading,
    binaryInstalling,
    fetchAll,
    installBinary,
    downloadModel,
    cancelDownload,
    deleteModel,
    startServer,
    stopServer,
  } = useLocalAIStore()

  const { addProvider, updateProvider, providers, setActiveProvider, setActiveModel } = useSettingsStore()

  const binaryProgress = useLocalAIStore((s) => s.binaryProgress)
  const [startingModel, setStartingModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Auto-register local provider when server starts
  useEffect(() => {
    if (server.running && server.modelId) {
      const existing = providers.find((p) => p.id === "local")
      if (!existing) {
        addProvider({
          id: "local",
          name: "Local AI",
          type: "local",
          apiKey: "local",
          enabled: true,
          models: [server.modelId],
        })
      } else {
        updateProvider("local", {
          enabled: true,
          models: [server.modelId],
        })
      }
    }
  }, [server.running, server.modelId])

  const handleStartServer = async (modelId: string) => {
    setStartingModel(modelId)
    setError(null)
    try {
      await startServer(modelId)
      setActiveProvider("local")
      setActiveModel(modelId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setStartingModel(null)
    }
  }

  const handleStopServer = async () => {
    await stopServer()
    updateProvider("local", { enabled: false })
  }

  if (loading && !hardware) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Custom endpoints — top of page */}
      <CustomEndpoints />

      {/* Hardware info */}
      <HardwareSection hardware={hardware} />

      {/* Binary status */}
      <BinarySection
        binary={binary}
        installing={binaryInstalling}
        progress={binaryProgress}
        onInstall={installBinary}
      />

      {/* Server status */}
      {binary?.installed && (
        <ServerSection
          server={server}
          startingModel={startingModel}
          onStop={handleStopServer}
        />
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-error/10 border border-status-error/20">
          <AlertTriangle className="w-3.5 h-3.5 text-status-error shrink-0" />
          <span className="text-xs text-status-error font-sans">{error}</span>
        </div>
      )}

      {/* Model catalog with filters */}
      {binary?.installed && (
        <ModelCatalog
          catalog={catalog}
          downloads={downloads}
          server={server}
          startingModel={startingModel}
          onDownload={downloadModel}
          onCancel={cancelDownload}
          onDelete={deleteModel}
          onStart={handleStartServer}
        />
      )}
    </div>
  )
}

// ─── Hardware Section ────────────────────────────────────────

function HardwareSection({ hardware }: { hardware: ReturnType<typeof useLocalAIStore.getState>["hardware"] }) {
  if (!hardware) return null

  const gpu = hardware.gpus[0]

  return (
    <Section title="Hardware">
      <div className="grid grid-cols-2 gap-2">
        <InfoCard
          icon={<Monitor className="w-3.5 h-3.5" />}
          label="Platform"
          value={`${hardware.platform} ${hardware.arch}`}
        />
        <InfoCard
          icon={<Cpu className="w-3.5 h-3.5" />}
          label="CPU"
          value={`${hardware.cpuCores} cores`}
        />
        <InfoCard
          icon={<HardDrive className="w-3.5 h-3.5" />}
          label="RAM"
          value={`${Math.round(hardware.totalRAM_MB / 1024)} GB (${Math.round(hardware.freeRAM_MB / 1024)} GB free)`}
        />
        {gpu ? (
          <InfoCard
            icon={<Zap className="w-3.5 h-3.5 text-status-success" />}
            label={gpu.backend.toUpperCase()}
            value={`${gpu.name} — ${Math.round(gpu.vramMB / 1024)} GB VRAM`}
          />
        ) : (
          <InfoCard
            icon={<Zap className="w-3.5 h-3.5 text-text-weaker" />}
            label="GPU"
            value="No GPU detected (CPU mode)"
          />
        )}
      </div>
    </Section>
  )
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-0 border border-border-weak">
      <div className="mt-0.5 text-text-weaker">{icon}</div>
      <div>
        <div className="text-[10px] text-text-weaker font-sans uppercase tracking-wide">{label}</div>
        <div className="text-xs text-text-base font-sans">{value}</div>
      </div>
    </div>
  )
}

// ─── Binary Section ──────────────────────────────────────────

function BinarySection({
  binary,
  installing,
  progress,
  onInstall,
}: {
  binary: ReturnType<typeof useLocalAIStore.getState>["binary"]
  installing: boolean
  progress: ReturnType<typeof useLocalAIStore.getState>["binaryProgress"]
  onInstall: () => void
}) {
  return (
    <Section title="Inference Engine">
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-text-weaker" />
          <div>
            <span className="text-xs text-text-base font-sans font-medium">llama-server</span>
            {binary?.installed && (
              <span className="text-[10px] text-text-weaker font-sans ml-2">
                {binary.version}
              </span>
            )}
          </div>
        </div>
        {binary?.installed ? (
          <span className="flex items-center gap-1 text-[10px] text-status-success font-sans">
            <Check className="w-3 h-3" />
            Installed
          </span>
        ) : installing ? (
          <span className="flex items-center gap-1 text-[10px] text-accent font-sans">
            <Loader2 className="w-3 h-3 animate-spin" />
            {progress?.status === "extracting" ? "Extracting..." : "Downloading..."}
          </span>
        ) : (
          <button
            onClick={onInstall}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-accent text-white rounded-md hover:bg-accent-hover transition-colors font-sans font-medium"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}
      </div>

      {/* Progress bar during install */}
      {installing && progress && (
        <div className="mt-2 px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-weaker font-sans capitalize">
              {progress.status}
            </span>
            <span className="text-[10px] text-accent font-mono">{progress.percent}%</span>
          </div>
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {progress.error && (
            <div className="flex items-center gap-1 mt-1.5">
              <AlertTriangle className="w-3 h-3 text-status-error shrink-0" />
              <span className="text-[10px] text-status-error font-sans">{progress.error}</span>
            </div>
          )}
        </div>
      )}

      {!binary?.installed && !installing && (
        <p className="text-[10px] text-text-weaker font-sans mt-1.5 px-1">
          Downloads ~10 MB binary for your platform. Required to run local models.
        </p>
      )}
    </Section>
  )
}

// ─── Server Section ──────────────────────────────────────────

function ServerSection({
  server,
  startingModel,
  onStop,
}: {
  server: ReturnType<typeof useLocalAIStore.getState>["server"]
  startingModel: string | null
  onStop: () => void
}) {
  if (!server.running && !startingModel) return null

  return (
    <Section title="Server">
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${server.running ? "bg-status-success animate-pulse" : "bg-status-warning animate-pulse"}`} />
          <div>
            <span className="text-xs text-text-base font-sans font-medium">
              {server.running ? server.modelId : startingModel}
            </span>
            {server.running && server.baseUrl && (
              <span className="text-[10px] text-text-weaker font-sans ml-2">
                {server.baseUrl}
              </span>
            )}
            {startingModel && !server.running && (
              <span className="text-[10px] text-status-warning font-sans ml-2">
                Loading model...
              </span>
            )}
          </div>
        </div>
        {server.running && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-status-error/15 text-status-error rounded-md hover:bg-status-error/25 transition-colors font-sans font-medium"
          >
            <Square className="w-2.5 h-2.5" />
            Stop
          </button>
        )}
      </div>
    </Section>
  )
}

// ─── Model Catalog with Filters ─────────────────────────────

type FitFilter = "all" | "can-run" | "installed"

function ModelCatalog({
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

function FilterPill({
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

function FitBadge({ fit }: { fit: ModelFit }) {
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

function ModelRow({
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

// ─── Custom Endpoints ────────────────────────────────────────

function CustomEndpoints() {
  const { providers, addProvider, removeProvider, setActiveProvider, setActiveModel } = useSettingsStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")

  const customProviders = providers.filter((p) => p.type === "custom")

  const handleAdd = () => {
    if (!name.trim() || !url.trim() || !model.trim()) return

    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`
    addProvider({
      id,
      name: name.trim(),
      type: "custom",
      apiKey: apiKey.trim() || "none",
      baseUrl: url.trim(),
      enabled: true,
      models: [model.trim()],
    })

    setName("")
    setUrl("")
    setApiKey("")
    setModel("")
    setAdding(false)
  }

  const handleUse = (provider: typeof customProviders[0]) => {
    setActiveProvider(provider.id)
    setActiveModel(provider.models[0])
  }

  return (
    <Section title="Custom Endpoints">
      <p className="text-[10px] text-text-weaker font-sans mb-3 px-1">
        Connect to any OpenAI-compatible API — homelab server, Mac Mini cluster, Ollama, vLLM, text-generation-webui, etc.
      </p>

      {/* Existing custom endpoints */}
      {customProviders.length > 0 && (
        <div className="space-y-1 mb-3">
          {customProviders.map((cp) => (
            <div
              key={cp.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-3.5 h-3.5 text-accent shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs text-text-base font-sans font-medium truncate">{cp.name}</div>
                  <div className="text-[10px] text-text-weaker font-mono truncate">{cp.baseUrl}</div>
                  <div className="text-[10px] text-text-weaker font-sans">
                    Model: <span className="font-mono">{cp.models[0]}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleUse(cp)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-accent/15 text-accent rounded-md hover:bg-accent/25 transition-colors font-sans font-medium"
                >
                  <Play className="w-2.5 h-2.5" />
                  Use
                </button>
                <button
                  onClick={() => removeProvider(cp.id)}
                  className="p-1 rounded hover:bg-surface-2 transition-colors"
                  title="Remove endpoint"
                >
                  <Trash2 className="w-3 h-3 text-text-weaker hover:text-status-error" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div className="space-y-2 p-3 rounded-lg bg-surface-0 border border-border-weak">
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My homelab server"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-sans placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">Base URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:8080"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-mono placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">Model name</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="llama3.1:8b or any model ID"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-mono placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">
              API Key <span className="normal-case">(optional)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-... (leave empty if not required)"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-mono placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!name.trim() || !url.trim() || !model.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-accent text-white rounded-md hover:bg-accent-hover transition-colors font-sans font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3" />
              Add Endpoint
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-2 text-text-base rounded-md hover:bg-surface-3 transition-colors font-sans"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-[10px] bg-surface-0 border border-border-weak border-dashed text-text-weak rounded-lg hover:border-accent hover:text-accent transition-colors font-sans w-full justify-center"
        >
          <Plus className="w-3 h-3" />
          Add Custom Endpoint
        </button>
      )}
    </Section>
  )
}

// ─── Shared ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs text-text-strong font-medium mb-3 font-sans">{title}</h3>
      {children}
    </div>
  )
}
