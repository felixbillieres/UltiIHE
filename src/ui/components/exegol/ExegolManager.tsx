import { useState, useEffect } from "react"
import {
  useExegolStore,
  type ExegolContainer,
  type ExegolImage,
} from "../../stores/exegol"
import { useProjectStore, type Project } from "../../stores/project"
import {
  Box,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Eye,
  RefreshCw,
  Loader2,
  Plus,
  X,
  Download,
  Check,
  AlertTriangle,
  Info,
} from "lucide-react"

// ── Main component ───────────────────────────────────────────

interface Props {
  project: Project
  onClose: () => void
  canClose: boolean
}

export function ExegolManager({ project, onClose, canClose }: Props) {
  const {
    containers,
    images,
    version,
    loading,
    error,
    fetchInfo,
  } = useExegolStore()

  const [tab, setTab] = useState<"containers" | "images">("containers")
  const [detailName, setDetailName] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  return (
    <div className="w-full max-w-2xl bg-surface-1 border border-border-base rounded-xl shadow-2xl mx-4 max-h-[85vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-accent" />
          <h3 className="text-sm text-text-strong font-sans font-medium">
            Exegol Manager
          </h3>
          {version && (
            <span className="text-[10px] text-text-weaker font-mono bg-surface-2 px-1.5 py-0.5 rounded">
              {version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchInfo()}
            disabled={loading}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-text-weaker ${loading ? "animate-spin" : ""}`}
            />
          </button>
          {canClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-surface-3 transition-colors"
            >
              <X className="w-4 h-4 text-text-weaker" />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mb-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-status-error/10 border border-status-error/20">
          <AlertTriangle className="w-3.5 h-3.5 text-status-error shrink-0 mt-0.5" />
          <pre className="text-xs text-status-error whitespace-pre-wrap break-words font-sans flex-1 min-w-0">
            {error}
          </pre>
          <button
            onClick={() => useExegolStore.setState({ error: null })}
            className="p-0.5 rounded hover:bg-status-error/20 shrink-0"
          >
            <X className="w-3 h-3 text-status-error" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 px-5 border-b border-border-weak shrink-0">
        <TabButton
          active={tab === "containers"}
          onClick={() => setTab("containers")}
          label={`Containers (${containers.length})`}
        />
        <TabButton
          active={tab === "images"}
          onClick={() => setTab("images")}
          label={`Images (${images.length})`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && containers.length === 0 && images.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-text-weaker animate-spin" />
            <span className="ml-2 text-xs text-text-weaker font-sans">
              Loading exegol info...
            </span>
          </div>
        ) : tab === "containers" ? (
          <ContainerSection
            project={project}
            containers={containers}
            onViewDetail={setDetailName}
            onCreateClick={() => setShowCreate(true)}
          />
        ) : (
          <ImageSection images={images} />
        )}
      </div>

      {/* Detail drawer */}
      {detailName && (
        <ContainerDetailDrawer
          name={detailName}
          onClose={() => setDetailName(null)}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateContainerModal
          images={images}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

// ── Tab button ───────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-sans font-medium transition-colors border-b-2 ${
        active
          ? "text-text-strong border-accent"
          : "text-text-weaker hover:text-text-weak border-transparent"
      }`}
    >
      {label}
    </button>
  )
}

// ── Container section ────────────────────────────────────────

function ContainerSection({
  project,
  containers,
  onViewDetail,
  onCreateClick,
}: {
  project: Project
  containers: ExegolContainer[]
  onViewDetail: (name: string) => void
  onCreateClick: () => void
}) {
  const actionLoading = useExegolStore((s) => s.actionLoading)
  const startContainer = useExegolStore((s) => s.startContainer)
  const stopContainer = useExegolStore((s) => s.stopContainer)
  const restartContainer = useExegolStore((s) => s.restartContainer)
  const removeContainer = useExegolStore((s) => s.removeContainer)
  const addToProject = useProjectStore((s) => s.addContainerToProject)
  const removeFromProject = useProjectStore(
    (s) => s.removeContainerFromProject,
  )

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const isActionLoading = (name: string, action: string) =>
    actionLoading === `${name}-${action}`

  const isLinked = (dockerName: string) =>
    project.containerIds.includes(dockerName)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-text-weaker font-sans">
          Manage Exegol containers. Add them to your project to open terminals.
        </p>
        <button
          onClick={onCreateClick}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded bg-accent text-white hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="w-3 h-3" />
          Create
        </button>
      </div>

      {containers.length === 0 ? (
        <div className="text-center py-8 text-xs text-text-weaker font-sans">
          No Exegol containers found. Create one to get started.
        </div>
      ) : (
        <div className="border border-border-weak rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_70px_1fr_auto] gap-2 px-3 py-1.5 bg-surface-2 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium">
            <span>Container</span>
            <span>State</span>
            <span>Image</span>
            <span>Config</span>
            <span className="w-[180px] text-right">Actions</span>
          </div>

          {containers.map((c) => {
            const isRunning = c.state.toLowerCase() === "running"
            const linked = isLinked(c.dockerName)
            const isConfirmingRemove = confirmRemove === c.name

            return (
              <div
                key={c.name}
                className={`grid grid-cols-[1fr_80px_70px_1fr_auto] gap-2 px-3 py-2 border-t border-border-weak items-center group hover:bg-surface-2/50 transition-colors ${
                  linked ? "bg-accent/3" : ""
                }`}
              >
                {/* Name + linked badge */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-text-strong font-mono truncate">
                    {c.name}
                  </span>
                  {linked && (
                    <span className="shrink-0 px-1 py-px text-[8px] rounded bg-accent/15 text-accent font-sans font-medium">
                      IN PROJECT
                    </span>
                  )}
                </div>

                {/* State */}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isRunning ? "bg-status-success" : "bg-text-weaker"
                    }`}
                  />
                  <span
                    className={`text-xs ${isRunning ? "text-status-success" : "text-text-weaker"}`}
                  >
                    {c.state}
                  </span>
                </div>

                {/* Image */}
                <span className="text-xs text-text-weak truncate">
                  {c.image}
                </span>

                {/* Config */}
                <span
                  className="text-xs text-text-weaker truncate"
                  title={c.config}
                >
                  {c.config || "Default"}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-0.5 justify-end w-[180px]">
                  {isConfirmingRemove ? (
                    <>
                      <span className="text-[10px] text-status-error mr-1 font-sans">
                        Remove?
                      </span>
                      <button
                        onClick={() => {
                          removeContainer(c.name, true)
                          setConfirmRemove(null)
                        }}
                        className="px-1.5 py-0.5 text-[10px] bg-status-error/20 text-status-error rounded hover:bg-status-error/30 font-sans"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="px-1.5 py-0.5 text-[10px] text-text-weaker hover:text-text-weak font-sans"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Add/Remove from project */}
                      {isRunning && (
                        <button
                          onClick={() =>
                            linked
                              ? removeFromProject(project.id, c.dockerName)
                              : addToProject(project.id, c.dockerName)
                          }
                          title={linked ? "Remove from project" : "Add to project"}
                          className={`p-1 rounded transition-colors ${
                            linked
                              ? "text-accent bg-accent/10 hover:bg-accent/20"
                              : "text-text-weaker hover:bg-surface-3 hover:text-accent"
                          }`}
                        >
                          {linked ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      {/* Start */}
                      {!isRunning && (
                        <ActionBtn
                          onClick={() => startContainer(c.name)}
                          loading={isActionLoading(c.name, "start")}
                          title="Start"
                          className="text-status-success hover:bg-status-success/10"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </ActionBtn>
                      )}
                      {/* Stop */}
                      {isRunning && (
                        <ActionBtn
                          onClick={() => stopContainer(c.name)}
                          loading={isActionLoading(c.name, "stop")}
                          title="Stop"
                          className="text-amber-400 hover:bg-amber-400/10"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </ActionBtn>
                      )}
                      {/* Restart */}
                      <ActionBtn
                        onClick={() => restartContainer(c.name)}
                        loading={isActionLoading(c.name, "restart")}
                        title="Restart"
                        className="text-blue-400 hover:bg-blue-400/10"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </ActionBtn>
                      {/* Detail */}
                      <ActionBtn
                        onClick={() => onViewDetail(c.name)}
                        title="View Details"
                        className="text-text-weak hover:bg-surface-3"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </ActionBtn>
                      {/* Remove */}
                      <ActionBtn
                        onClick={() => setConfirmRemove(c.name)}
                        title="Remove"
                        className="text-status-error hover:bg-status-error/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </ActionBtn>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Image section ────────────────────────────────────────────

function ImageSection({ images }: { images: ExegolImage[] }) {
  const actionLoading = useExegolStore((s) => s.actionLoading)
  const uninstallImage = useExegolStore((s) => s.uninstallImage)
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null)

  if (images.length === 0) {
    return (
      <div className="p-4 text-center py-8 text-xs text-text-weaker font-sans">
        No images found.
      </div>
    )
  }

  return (
    <div className="p-4">
      <p className="text-xs text-text-weaker font-sans mb-3">
        Exegol images available on this system.
      </p>

      <div className="border border-border-weak rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_1fr_100px] gap-2 px-3 py-1.5 bg-surface-2 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium">
          <span>Image</span>
          <span>Size</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {images.map((img) => {
          const isInstalled = !img.status.toLowerCase().includes("not installed")
          const hasUpdate = img.status.toLowerCase().includes("update available")
          const isConfirming = confirmUninstall === img.name
          const isUninstalling = actionLoading === `${img.name}-uninstall`

          return (
            <div
              key={img.name}
              className="grid grid-cols-[1fr_80px_1fr_100px] gap-2 px-3 py-2 border-t border-border-weak items-center group hover:bg-surface-2/50 transition-colors"
            >
              <span className="text-xs text-text-strong font-mono">
                {img.name}
              </span>
              <span className="text-xs text-text-weak">
                {img.size || "-"}
              </span>
              <span
                className={`text-xs ${
                  hasUpdate
                    ? "text-amber-400"
                    : isInstalled
                      ? "text-status-success"
                      : "text-text-weaker"
                }`}
              >
                {img.status}
              </span>

              <div className="flex items-center gap-1 justify-end">
                {isConfirming ? (
                  <>
                    <span className="text-[10px] text-status-error mr-1 font-sans">
                      Uninstall?
                    </span>
                    <button
                      onClick={() => {
                        uninstallImage(img.name, true)
                        setConfirmUninstall(null)
                      }}
                      className="px-1.5 py-0.5 text-[10px] bg-status-error/20 text-status-error rounded hover:bg-status-error/30 font-sans"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmUninstall(null)}
                      className="px-1.5 py-0.5 text-[10px] text-text-weaker hover:text-text-weak font-sans"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <>
                    {!isInstalled && (
                      <button
                        title="Install (coming soon)"
                        disabled
                        className="p-1 rounded text-status-success/50 cursor-not-allowed"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {hasUpdate && (
                      <button
                        title="Update (coming soon)"
                        disabled
                        className="p-1 rounded text-amber-400/50 cursor-not-allowed"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isInstalled && (
                      <button
                        onClick={() => setConfirmUninstall(img.name)}
                        disabled={isUninstalling}
                        title="Uninstall"
                        className="p-1 rounded text-status-error hover:bg-status-error/10 transition-colors disabled:opacity-30"
                      >
                        {isUninstalling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Action button ────────────────────────────────────────────

function ActionBtn({
  onClick,
  loading,
  title,
  className,
  children,
}: {
  onClick: () => void
  loading?: boolean
  title: string
  className: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`p-1 rounded transition-colors disabled:opacity-30 ${className}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        children
      )}
    </button>
  )
}

// ── Container detail drawer ──────────────────────────────────

function ContainerDetailDrawer({
  name,
  onClose,
}: {
  name: string
  onClose: () => void
}) {
  const { containerDetail, detailLoading, fetchContainerDetail } =
    useExegolStore()

  useEffect(() => {
    fetchContainerDetail(name)
  }, [name, fetchContainerDetail])

  return (
    <div className="border-t border-border-weak bg-surface-0 max-h-[40vh] overflow-y-auto shrink-0">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border-weak sticky top-0 bg-surface-0">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs text-text-strong font-sans font-medium">
            {name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-3 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-text-weaker" />
        </button>
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 text-text-weaker animate-spin" />
        </div>
      ) : containerDetail ? (
        <div className="p-4 space-y-1.5">
          {Object.entries(containerDetail.fields).map(([key, value]) => (
            <div key={key} className="flex gap-3">
              <span className="text-[10px] text-text-weaker font-sans w-32 shrink-0 text-right pt-0.5">
                {key}
              </span>
              <span className="text-xs text-text-base font-mono whitespace-pre-wrap break-all">
                {value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-xs text-text-weaker font-sans text-center">
          Failed to load details.
        </div>
      )}
    </div>
  )
}

// ── Create container modal ───────────────────────────────────

function CreateContainerModal({
  images,
  onClose,
}: {
  images: ExegolImage[]
  onClose: () => void
}) {
  const createContainer = useExegolStore((s) => s.createContainer)
  const actionLoading = useExegolStore((s) => s.actionLoading)

  const installedImages = images.filter(
    (i) => !i.status.toLowerCase().includes("not installed"),
  )

  const [name, setName] = useState("")
  const [image, setImage] = useState(installedImages[0]?.name || "")
  const [network, setNetwork] = useState("")
  const [vpnPath, setVpnPath] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [error, setError] = useState("")

  const isCreating = actionLoading === "create"

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    if (!image) {
      setError("Select an image")
      return
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name.trim())) {
      setError("Invalid name (alphanumeric, dots, dashes, underscores)")
      return
    }
    setError("")
    const ok = await createContainer({
      name: name.trim(),
      image,
      network: network || undefined,
      vpn_path: vpnPath || undefined,
      workspace_path: workspace || undefined,
    })
    if (ok) onClose()
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center">
      <div className="w-full max-w-md bg-surface-1 border border-border-base rounded-xl shadow-2xl mx-4">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h3 className="text-sm text-text-strong font-sans font-medium">
            Create Container
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-3 transition-colors"
          >
            <X className="w-4 h-4 text-text-weaker" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-error/10 border border-status-error/20">
              <AlertTriangle className="w-3 h-3 text-status-error shrink-0" />
              <span className="text-xs text-status-error">{error}</span>
            </div>
          )}

          <Field label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-container"
              className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker"
            />
          </Field>

          <Field label="Image" required>
            <select
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-sans focus:outline-none focus:border-accent/50"
            >
              {installedImages.length === 0 && (
                <option value="">No images installed</option>
              )}
              {installedImages.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name} ({i.size})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Network">
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-sans focus:outline-none focus:border-accent/50"
            >
              <option value="">Default (host)</option>
              <option value="host">Host</option>
              <option value="bridge">Bridge</option>
              <option value="nat">NAT</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>

          <Field label="VPN config path">
            <input
              value={vpnPath}
              onChange={(e) => setVpnPath(e.target.value)}
              placeholder="/path/to/vpn.ovpn"
              className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker"
            />
          </Field>

          <Field label="Workspace path">
            <input
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="/path/to/workspace"
              className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-text-weak rounded-lg hover:bg-surface-3 transition-colors font-sans"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating || !name.trim() || !image}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-sans font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
            >
              {isCreating && <Loader2 className="w-3 h-3 animate-spin" />}
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wide mb-1">
        {label}
        {required && <span className="text-status-error ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
