import { useState, useEffect } from "react"
import {
  useExegolStore,
  type ExegolContainer,
  type ExegolImage,
  type CreateContainerRequest,
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
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
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
    <div className="w-full max-w-3xl bg-surface-1 border border-border-base rounded-xl shadow-2xl mx-4 max-h-[85vh] flex flex-col">
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
  const upgradeContainer = useExegolStore((s) => s.upgradeContainer)
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
            <span className="w-[200px] text-right">Actions</span>
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
                <div className="flex items-center gap-0.5 justify-end w-[200px]">
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
                        <ActionBtn
                          onClick={() =>
                            linked
                              ? removeFromProject(project.id, c.dockerName)
                              : addToProject(project.id, c.dockerName)
                          }
                          title={linked ? "Remove from project" : "Add to project"}
                          className={
                            linked
                              ? "text-accent bg-accent/10 hover:bg-accent/20"
                              : "text-text-weaker hover:bg-surface-3 hover:text-accent"
                          }
                        >
                          {linked ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </ActionBtn>
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
                      {/* Upgrade */}
                      <ActionBtn
                        onClick={() => upgradeContainer(c.name, undefined, true)}
                        loading={isActionLoading(c.name, "upgrade")}
                        title="Upgrade container to latest image"
                        className="text-purple-400 hover:bg-purple-400/10"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
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
  const installImage = useExegolStore((s) => s.installImage)
  const updateImage = useExegolStore((s) => s.updateImage)
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
        Exegol images available on this system. Install images to create containers from them.
      </p>

      <div className="border border-border-weak rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_1fr_120px] gap-2 px-3 py-1.5 bg-surface-2 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium">
          <span>Image</span>
          <span>Size</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {images.map((img) => {
          const statusLower = img.status.toLowerCase()
          const isInstalled = !statusLower.includes("not installed")
          const hasUpdate = statusLower.includes("update available")
          const isConfirming = confirmUninstall === img.name
          const isUninstalling = actionLoading === `${img.name}-uninstall`
          const isInstalling = actionLoading === `${img.name}-install`
          const isUpdating = actionLoading === `${img.name}-update`

          return (
            <div
              key={img.name}
              className="grid grid-cols-[1fr_80px_1fr_120px] gap-2 px-3 py-2 border-t border-border-weak items-center group hover:bg-surface-2/50 transition-colors"
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
                    {/* Install */}
                    {!isInstalled && (
                      <ActionBtn
                        onClick={() => installImage(img.name)}
                        loading={isInstalling}
                        title="Install image"
                        className="text-status-success hover:bg-status-success/10"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </ActionBtn>
                    )}
                    {/* Update */}
                    {hasUpdate && (
                      <ActionBtn
                        onClick={() => updateImage(img.name)}
                        loading={isUpdating}
                        title="Update image"
                        className="text-amber-400 hover:bg-amber-400/10"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </ActionBtn>
                    )}
                    {/* Uninstall */}
                    {isInstalled && (
                      <ActionBtn
                        onClick={() => setConfirmUninstall(img.name)}
                        loading={isUninstalling}
                        title="Uninstall image"
                        className="text-status-error hover:bg-status-error/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </ActionBtn>
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

  // Basic
  const [name, setName] = useState("")
  const [image, setImage] = useState(installedImages[0]?.name || "")
  const [comment, setComment] = useState("")

  // Workspace
  const [workspace, setWorkspace] = useState("")
  const [updateFs, setUpdateFs] = useState(false)

  // Network
  const [network, setNetwork] = useState("")
  const [hostname, setHostname] = useState("")
  const [portsInput, setPortsInput] = useState("")

  // VPN
  const [vpnPath, setVpnPath] = useState("")
  const [vpnAuth, setVpnAuth] = useState("")

  // Volumes
  const [volumesInput, setVolumesInput] = useState("")

  // Shell & Logging
  const [shell, setShell] = useState("")
  const [enableLogging, setEnableLogging] = useState(false)
  const [logMethod, setLogMethod] = useState("")

  // Desktop
  const [desktop, setDesktop] = useState(false)

  // Security
  const [privileged, setPrivileged] = useState(false)
  const [capsInput, setCapsInput] = useState("")
  const [devicesInput, setDevicesInput] = useState("")

  // Disable defaults
  const [disableX11, setDisableX11] = useState(false)
  const [disableMyResources, setDisableMyResources] = useState(false)
  const [disableExegolResources, setDisableExegolResources] = useState(false)
  const [disableSharedTimezones, setDisableSharedTimezones] = useState(false)

  // Environment
  const [envInput, setEnvInput] = useState("")

  // Advanced section toggle
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [error, setError] = useState("")
  const isCreating = actionLoading === "create"

  function parseLines(input: string): string[] {
    return input
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  }

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

    const req: CreateContainerRequest = {
      name: name.trim(),
      image,
    }

    // Workspace
    if (workspace.trim()) req.workspace_path = workspace.trim()
    if (updateFs) req.update_fs = true

    // Network
    if (network) req.network = network
    if (hostname.trim()) req.hostname = hostname.trim()
    const ports = parseLines(portsInput)
    if (ports.length) req.ports = ports

    // VPN
    if (vpnPath.trim()) req.vpn_path = vpnPath.trim()
    if (vpnAuth.trim()) req.vpn_auth_path = vpnAuth.trim()

    // Volumes
    const volumes = parseLines(volumesInput)
    if (volumes.length) req.volumes = volumes

    // Shell & Logging
    if (shell) req.shell = shell
    if (enableLogging) req.enable_logging = true
    if (logMethod) req.log_method = logMethod

    // Desktop
    if (desktop) req.desktop = true

    // Security
    if (privileged) req.privileged = true
    const caps = parseLines(capsInput)
    if (caps.length) req.capabilities = caps
    const devices = parseLines(devicesInput)
    if (devices.length) req.devices = devices

    // Disable defaults
    if (disableX11) req.disable_x11 = true
    if (disableMyResources) req.disable_my_resources = true
    if (disableExegolResources) req.disable_exegol_resources = true
    if (disableSharedTimezones) req.disable_shared_timezones = true

    // Environment
    const envVars = parseLines(envInput)
    if (envVars.length) req.env_vars = envVars

    // Comment
    if (comment.trim()) req.comment = comment.trim()

    const ok = await createContainer(req)
    if (ok) onClose()
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center">
      <div className="w-full max-w-lg bg-surface-1 border border-border-base rounded-xl shadow-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
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

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3 min-h-0">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-error/10 border border-status-error/20">
              <AlertTriangle className="w-3 h-3 text-status-error shrink-0" />
              <span className="text-xs text-status-error font-sans">{error}</span>
            </div>
          )}

          {/* ── Essential fields ── */}
          <Field label="Name" required hint="Alphanumeric, dots, dashes, underscores">
            <TextInput value={name} onChange={setName} placeholder="my-container" mono />
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

          {/* ── Workspace ── */}
          <Field label="Workspace" hint="Host folder mounted as /workspace in the container">
            <TextInput value={workspace} onChange={setWorkspace} placeholder="/path/to/workspace" mono />
          </Field>

          {/* ── Network ── */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Network">
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-sans focus:outline-none focus:border-accent/50"
              >
                <option value="">Default (host)</option>
                <option value="host">Host</option>
                <option value="docker">Docker (bridge with VPN)</option>
                <option value="nat">NAT</option>
                <option value="disabled">Disabled</option>
              </select>
            </Field>

            <Field label="Shell">
              <select
                value={shell}
                onChange={(e) => setShell(e.target.value)}
                className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-sans focus:outline-none focus:border-accent/50"
              >
                <option value="">Default (zsh)</option>
                <option value="zsh">zsh</option>
                <option value="bash">bash</option>
                <option value="tmux">tmux</option>
              </select>
            </Field>
          </div>

          {/* ── VPN ── */}
          <Field label="VPN config" hint=".ovpn or .conf file on the host">
            <TextInput value={vpnPath} onChange={setVpnPath} placeholder="/home/user/vpn/lab.ovpn" mono />
          </Field>

          {vpnPath && (
            <Field label="VPN auth file" hint="File with username on line 1, password on line 2">
              <TextInput value={vpnAuth} onChange={setVpnAuth} placeholder="/home/user/vpn/auth.txt" mono />
            </Field>
          )}

          {/* ── Comment ── */}
          <Field label="Comment" hint="Visible in exegol info">
            <TextInput value={comment} onChange={setComment} placeholder="HTB lab environment" />
          </Field>

          {/* ── Advanced section ── */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-text-weak hover:text-text-base font-sans font-medium transition-colors w-full pt-1"
          >
            {showAdvanced ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l-2 border-border-weak">
              {/* Hostname */}
              <Field label="Hostname" hint="Custom hostname (default: exegol-<name>)">
                <TextInput value={hostname} onChange={setHostname} placeholder="exegol-mylab" mono />
              </Field>

              {/* Ports */}
              <Field label="Port mappings" hint="One per line: [host_ip:]host_port[:container_port[:proto]]">
                <textarea
                  value={portsInput}
                  onChange={(e) => setPortsInput(e.target.value)}
                  placeholder={"8080:80\n4443:443:tcp"}
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              {/* Volumes */}
              <Field label="Extra volumes" hint="One per line: /host/path:/container/path[:ro|rw]">
                <textarea
                  value={volumesInput}
                  onChange={(e) => setVolumesInput(e.target.value)}
                  placeholder="/var/data:/data:ro"
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              {/* Env vars */}
              <Field label="Environment variables" hint="One per line: KEY=value">
                <textarea
                  value={envInput}
                  onChange={(e) => setEnvInput(e.target.value)}
                  placeholder="API_KEY=abc123"
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              {/* Devices */}
              <Field label="Devices" hint="Host devices to share, one per line">
                <textarea
                  value={devicesInput}
                  onChange={(e) => setDevicesInput(e.target.value)}
                  placeholder={"/dev/ttyACM0\n/dev/bus/usb/"}
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              {/* Capabilities */}
              <Field label="Capabilities" hint="Linux capabilities (e.g. NET_ADMIN), one per line">
                <textarea
                  value={capsInput}
                  onChange={(e) => setCapsInput(e.target.value)}
                  placeholder="NET_ADMIN"
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              {/* Toggles */}
              <div className="space-y-2">
                <Toggle label="Desktop mode" hint="Enable Exegol desktop (VNC/HTTP)" checked={desktop} onChange={setDesktop} />
                <Toggle label="Shell logging" hint="Log commands to /workspace/logs/" checked={enableLogging} onChange={setEnableLogging} />
                {enableLogging && (
                  <Field label="Log method">
                    <select
                      value={logMethod}
                      onChange={(e) => setLogMethod(e.target.value)}
                      className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-sans focus:outline-none focus:border-accent/50"
                    >
                      <option value="">Default (asciinema)</option>
                      <option value="asciinema">asciinema</option>
                      <option value="script">script</option>
                    </select>
                  </Field>
                )}
                <Toggle label="Fix workspace permissions" hint="Adjust permissions for host user access (-fs)" checked={updateFs} onChange={setUpdateFs} />
                <Toggle label="Privileged mode" hint="Give ALL admin privileges (dangerous)" checked={privileged} onChange={setPrivileged} danger />
              </div>

              {/* Disable defaults */}
              <div className="pt-1">
                <p className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wide mb-2">
                  Disable defaults
                </p>
                <div className="space-y-2">
                  <Toggle label="Disable X11" hint="No GUI app forwarding" checked={disableX11} onChange={setDisableX11} />
                  <Toggle label="Disable my-resources" hint="Don't mount ~/.exegol/my-resources" checked={disableMyResources} onChange={setDisableMyResources} />
                  <Toggle label="Disable exegol-resources" hint="Don't mount /opt/resources" checked={disableExegolResources} onChange={setDisableExegolResources} />
                  <Toggle label="Disable shared timezones" hint="Don't share host timezone" checked={disableSharedTimezones} onChange={setDisableSharedTimezones} />
                </div>
              </div>
            </div>
          )}

          {/* ── Submit ── */}
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

// ── Shared form components ───────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wide mb-1">
        {label}
        {required && <span className="text-status-error ml-0.5">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-text-weaker/60 font-sans mt-0.5">{hint}</p>
      )}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong focus:outline-none focus:border-accent/50 placeholder-text-weaker ${
        mono ? "font-mono" : "font-sans"
      }`}
    />
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  danger,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  danger?: boolean
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-border-weak bg-surface-2 text-accent focus:ring-accent/30 w-3.5 h-3.5"
      />
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-sans ${danger && checked ? "text-status-error" : "text-text-base"}`}>
          {label}
        </span>
        {hint && (
          <span className="text-[10px] text-text-weaker/60 font-sans ml-1.5">
            {hint}
          </span>
        )}
      </div>
    </label>
  )
}
