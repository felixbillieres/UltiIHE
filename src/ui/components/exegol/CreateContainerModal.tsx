import { useState } from "react"
import {
  useExegolStore,
  type ExegolImage,
  type CreateContainerRequest,
} from "../../stores/exegol"
import {
  X,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { Field, TextInput, Toggle } from "./exegolFormComponents"

export function CreateContainerModal({
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

    if (workspace.trim()) req.workspace_path = workspace.trim()
    if (updateFs) req.update_fs = true
    if (network) req.network = network
    if (hostname.trim()) req.hostname = hostname.trim()
    const ports = parseLines(portsInput)
    if (ports.length) req.ports = ports
    if (vpnPath.trim()) req.vpn_path = vpnPath.trim()
    if (vpnAuth.trim()) req.vpn_auth_path = vpnAuth.trim()
    const volumes = parseLines(volumesInput)
    if (volumes.length) req.volumes = volumes
    if (shell) req.shell = shell
    if (enableLogging) req.enable_logging = true
    if (logMethod) req.log_method = logMethod
    if (desktop) req.desktop = true
    if (privileged) req.privileged = true
    const caps = parseLines(capsInput)
    if (caps.length) req.capabilities = caps
    const devices = parseLines(devicesInput)
    if (devices.length) req.devices = devices
    if (disableX11) req.disable_x11 = true
    if (disableMyResources) req.disable_my_resources = true
    if (disableExegolResources) req.disable_exegol_resources = true
    if (disableSharedTimezones) req.disable_shared_timezones = true
    const envVars = parseLines(envInput)
    if (envVars.length) req.env_vars = envVars
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

          <Field label="Workspace" hint="Host folder mounted as /workspace in the container">
            <TextInput value={workspace} onChange={setWorkspace} placeholder="/path/to/workspace" mono />
          </Field>

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

          <Field label="VPN config" hint=".ovpn or .conf file on the host">
            <TextInput value={vpnPath} onChange={setVpnPath} placeholder="/home/user/vpn/lab.ovpn" mono />
          </Field>

          {vpnPath && (
            <Field label="VPN auth file" hint="File with username on line 1, password on line 2">
              <TextInput value={vpnAuth} onChange={setVpnAuth} placeholder="/home/user/vpn/auth.txt" mono />
            </Field>
          )}

          <Field label="Comment" hint="Visible in exegol info">
            <TextInput value={comment} onChange={setComment} placeholder="HTB lab environment" />
          </Field>

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
              <Field label="Hostname" hint="Custom hostname (default: exegol-<name>)">
                <TextInput value={hostname} onChange={setHostname} placeholder="exegol-mylab" mono />
              </Field>

              <Field label="Port mappings" hint="One per line: [host_ip:]host_port[:container_port[:proto]]">
                <textarea
                  value={portsInput}
                  onChange={(e) => setPortsInput(e.target.value)}
                  placeholder={"8080:80\n4443:443:tcp"}
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              <Field label="Extra volumes" hint="One per line: /host/path:/container/path[:ro|rw]">
                <textarea
                  value={volumesInput}
                  onChange={(e) => setVolumesInput(e.target.value)}
                  placeholder="/var/data:/data:ro"
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              <Field label="Environment variables" hint="One per line: KEY=value">
                <textarea
                  value={envInput}
                  onChange={(e) => setEnvInput(e.target.value)}
                  placeholder="API_KEY=abc123"
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              <Field label="Devices" hint="Host devices to share, one per line">
                <textarea
                  value={devicesInput}
                  onChange={(e) => setDevicesInput(e.target.value)}
                  placeholder={"/dev/ttyACM0\n/dev/bus/usb/"}
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

              <Field label="Capabilities" hint="Linux capabilities (e.g. NET_ADMIN), one per line">
                <textarea
                  value={capsInput}
                  onChange={(e) => setCapsInput(e.target.value)}
                  placeholder="NET_ADMIN"
                  rows={2}
                  className="w-full bg-surface-2 border border-border-weak rounded-lg px-3 py-1.5 text-xs text-text-strong font-mono focus:outline-none focus:border-accent/50 placeholder-text-weaker resize-none"
                />
              </Field>

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
