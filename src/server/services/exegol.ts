/**
 * ExegolManager — wraps the `exegol` CLI for container and image management.
 * Ported from IHE's Python ExegolManager to TypeScript/Bun.
 */

import { spawn } from "child_process"

// ── Types ────────────────────────────────────────────────────

export interface ExegolContainer {
  name: string // Short exegol tag name (e.g. "HTBLabs")
  dockerName: string // Full docker container name (e.g. "exegol-HTBLabs")
  state: string // "Running" | "Stopped"
  image: string
  config: string
  vpn: string
  network: string
}

export interface ExegolImage {
  name: string
  size: string
  status: string // "Up to date" | "Update available" | "Not installed"
}

export interface ExegolInfo {
  containers: ExegolContainer[]
  images: ExegolImage[]
  version: string
}

export interface ExegolContainerDetail {
  name: string
  fields: Record<string, string>
}

export interface CreateContainerRequest {
  name: string
  image: string
  workspace_path?: string
  cwd_mount?: boolean // -cwd: mount current working dir as /workspace
  update_fs?: boolean // -fs: fix permissions for host user access
  network?: string // host | docker | nat | disabled
  ports?: string[] // format: [host_ip:]host_port[-end]:container_port[-end][:proto]
  vpn_path?: string // .ovpn or .conf file path
  vpn_auth_path?: string // credentials file (user\npass)
  volumes?: string[] // format: /host/path:/container/path[:ro|rw]
  desktop?: boolean
  desktop_config?: string // format: proto[:ip[:port]]
  enable_logging?: boolean
  log_method?: string // asciinema | script
  log_compress?: boolean
  env_vars?: string[] // format: KEY=value
  hostname?: string
  shell?: string // zsh | bash | tmux
  privileged?: boolean
  capabilities?: string[]
  devices?: string[] // e.g. /dev/ttyACM0, /dev/bus/usb/
  comment?: string
  disable_x11?: boolean
  disable_my_resources?: boolean
  disable_exegol_resources?: boolean
  disable_shared_timezones?: boolean
}

// ── ANSI strip ───────────────────────────────────────────────

const ANSI_RE =
  /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][A-B0-2]|\x1b\[\?[0-9;]*[a-zA-Z]|\x1b[=>]|\x1b\[[0-9]*[ABCDJKP]|\r/g

// Braille spinner chars used by exegol progress indicators
const SPINNER_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*Waiting to \w+\s*\w*/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "").replace(SPINNER_RE, "")
}

// ── Safe name validation ─────────────────────────────────────

const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

function isValidName(name: string): boolean {
  return SAFE_NAME_RE.test(name)
}

/**
 * Extract the meaningful error from verbose exegol CLI output.
 * Exegol wraps long lines with leading spaces. We merge continuation lines
 * and collect [!] blocks plus lines containing "error".
 */
function extractError(raw: string): string {
  const clean = stripAnsi(raw)
  const rawLines = clean.split("\n")

  // Merge continuation lines: lines that don't start with [ are appended to previous
  const merged: string[] = []
  for (const rl of rawLines) {
    const trimmed = rl.trim()
    if (!trimmed) continue
    if (merged.length > 0 && !trimmed.startsWith("[")) {
      merged[merged.length - 1] += " " + trimmed
    } else {
      merged.push(trimmed)
    }
  }

  // Collect [!] lines and error-containing lines
  const errorLines: string[] = []
  for (const line of merged) {
    if (line.startsWith("[!]")) {
      errorLines.push(line.slice(3).trim())
    } else if (
      line.toLowerCase().includes("error") &&
      !line.startsWith("[*]") &&
      !line.startsWith("[>]") &&
      !line.startsWith("[Press")
    ) {
      errorLines.push(line)
    }
  }

  if (errorLines.length > 0) {
    return errorLines.join("\n")
  }

  // Fallback: last non-empty line
  const last = merged[merged.length - 1]
  return last || "Unknown error"
}

// ── Core execution ───────────────────────────────────────────

async function runExegol(
  args: string[],
  timeout = 60000,
): Promise<{ stdout: string; stderr: string; code: number } | null> {
  const cmd = ["exegol", "--accept-eula", ...args]
  return new Promise((resolve) => {
    const proc = spawn(cmd[0], cmd.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let resolved = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        proc.kill("SIGKILL")
        resolve(null)
      }
    }, timeout)

    proc.stdout?.on("data", (d) => (stdout += d.toString()))
    proc.stderr?.on("data", (d) => (stderr += d.toString()))

    // Send newlines to dismiss interactive prompts
    proc.stdin?.write("\n".repeat(10))
    proc.stdin?.end()

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        resolve({ stdout, stderr, code: code ?? 1 })
      }
    })

    proc.on("error", () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        resolve(null)
      }
    })
  })
}

// ── Table parsing (same logic as IHE Python) ─────────────────

function parseTableRows(text: string): string[][] {
  const rows: string[][] = []
  let currentCells: string[] | null = null

  for (const rawLine of text.split("\n")) {
    const line = stripAnsi(rawLine).trim()
    // Skip border lines
    if (
      !line ||
      line[0] === "\u250c" ||
      line[0] === "\u251c" ||
      line[0] === "\u2514" ||
      line[0] === "\u2500" ||
      line[0] === "+" ||
      line[0] === "-"
    ) {
      if (currentCells !== null) {
        rows.push(currentCells)
        currentCells = null
      }
      continue
    }
    // Data rows contain │
    if (!line.includes("\u2502")) continue
    let parts = line.split("\u2502").map((c) => c.trim())
    if (parts[0] === "") parts = parts.slice(1)
    if (parts[parts.length - 1] === "") parts = parts.slice(0, -1)
    if (parts.length === 0) continue

    if (parts[0] || currentCells === null) {
      if (currentCells !== null) rows.push(currentCells)
      currentCells = parts
    } else {
      // Multi-line continuation
      for (let i = 0; i < parts.length; i++) {
        if (i < currentCells.length) {
          if (parts[i]) {
            currentCells[i] = currentCells[i]
              ? currentCells[i] + "\n" + parts[i]
              : parts[i]
          }
        } else {
          currentCells.push(parts[i])
        }
      }
    }
  }
  if (currentCells !== null) rows.push(currentCells)
  return rows
}

function findSection(text: string, marker: string): string {
  const idx = text.indexOf(marker)
  if (idx < 0) return ""
  let section = text.slice(idx + marker.length)
  // Find next emoji header
  const nextHeader = section.search(
    /^[^\S\n]*[\u{1F300}-\u{1FAFF}\u2B50\u2728\u2601]/mu,
  )
  if (nextHeader > 0) section = section.slice(0, nextHeader)
  return section
}

// ── Public API ───────────────────────────────────────────────

export async function getExegolInfo(): Promise<ExegolInfo> {
  const result = await runExegol(["info"])
  if (!result) return { containers: [], images: [], version: "" }

  const clean = stripAnsi(result.stdout)

  // Version
  let version = ""
  const verMatch = clean.match(/version\s+(v[\d.]+)/)
  if (verMatch) version = verMatch[1]

  // Parse images
  const images: ExegolImage[] = []
  const imgSection = findSection(clean, "Available images")
  if (imgSection) {
    for (const row of parseTableRows(imgSection)) {
      if (row.length >= 3 && row[0].toLowerCase() !== "image") {
        images.push({ name: row[0], size: row[1], status: row[2] })
      }
    }
  }

  // Parse containers
  const containers: ExegolContainer[] = []
  const ctrSection = findSection(clean, "Available containers")
  if (ctrSection) {
    for (const row of parseTableRows(ctrSection)) {
      if (row.length >= 4 && row[0].toLowerCase() !== "container tag") {
        const configLines = row[3] || ""
        let vpn = ""
        let network = ""
        for (const cl of configLines.split("\n")) {
          const s = cl.trim()
          if (s.startsWith("VPN:")) vpn = s.slice(4).trim()
          else if (s.includes("Network mode") || s.toLowerCase().includes("network"))
            network = s
        }
        containers.push({
          name: row[0],
          dockerName: `exegol-${row[0]}`,
          state: row[1],
          image: row[2],
          config: configLines.replace(/\n/g, " | "),
          vpn,
          network,
        })
      }
    }
  }

  return { containers, images, version }
}

export async function getContainerDetail(
  name: string,
): Promise<ExegolContainerDetail | null> {
  if (!isValidName(name)) return null
  const result = await runExegol(["info", name])
  if (!result || result.code !== 0) return null

  const clean = stripAnsi(result.stdout)
  const fields: Record<string, string> = {}
  for (const row of parseTableRows(clean)) {
    if (row.length >= 2) {
      const key = row[0].trim()
      const val = row[1].trim()
      if (key) fields[key] = val
    }
  }

  return { name, fields }
}

export async function startContainer(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidName(name)) return { ok: false, error: "Invalid container name" }
  const result = await runExegol(["start", name], 60000)
  if (!result) return { ok: false, error: "Command timed out" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

export async function stopContainer(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidName(name)) return { ok: false, error: "Invalid container name" }
  const result = await runExegol(["stop", name], 30000)
  if (!result) return { ok: false, error: "Command timed out" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

export async function restartContainer(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidName(name)) return { ok: false, error: "Invalid container name" }
  const result = await runExegol(["restart", name], 60000)
  if (!result) return { ok: false, error: "Command timed out" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

export async function removeContainer(
  name: string,
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidName(name)) return { ok: false, error: "Invalid container name" }
  const args = ["remove", name]
  if (force) args.push("-F")
  const result = await runExegol(args, 60000)
  if (!result) return { ok: false, error: "Command timed out" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

export async function createContainer(
  req: CreateContainerRequest,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidName(req.name))
    return { ok: false, error: "Invalid container name" }

  const args = ["start", req.name, req.image]

  // Workspace
  if (req.workspace_path) args.push("-w", req.workspace_path)
  if (req.cwd_mount) args.push("-cwd")
  if (req.update_fs) args.push("-fs")

  // Network
  if (req.network) args.push("--network", req.network)
  for (const p of req.ports || []) args.push("-p", p)
  if (req.hostname) args.push("--hostname", req.hostname)

  // VPN
  if (req.vpn_path) args.push("--vpn", req.vpn_path)
  if (req.vpn_auth_path) args.push("--vpn-auth", req.vpn_auth_path)

  // Volumes & devices
  for (const v of req.volumes || []) args.push("-V", v)
  for (const d of req.devices || []) args.push("--device", d)

  // Desktop
  if (req.desktop) args.push("--desktop")
  if (req.desktop_config) args.push("--desktop-config", req.desktop_config)

  // Logging
  if (req.enable_logging) args.push("--log")
  if (req.log_method) args.push("--log-method", req.log_method)
  if (req.log_compress === false) args.push("--log-compress")

  // Environment & shell
  for (const e of req.env_vars || []) args.push("-e", e)
  if (req.shell) args.push("--shell", req.shell)

  // Privileges
  if (req.privileged) args.push("--privileged")
  for (const c of req.capabilities || []) args.push("--cap", c)

  // Metadata
  if (req.comment) args.push("--comment", req.comment)

  // Disable defaults
  if (req.disable_x11) args.push("--disable-X11")
  if (req.disable_my_resources) args.push("--disable-my-resources")
  if (req.disable_exegol_resources) args.push("--disable-exegol-resources")
  if (req.disable_shared_timezones) args.push("--disable-shared-timezones")

  const result = await runExegol(args, 120000)
  if (!result) return { ok: false, error: "Command timed out" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

// ── Image lifecycle ─────────────────────────────────────────

export async function installImage(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const args = ["install", name]
  // Image installs can take a very long time (downloading GBs)
  const result = await runExegol(args, 600000)
  if (!result) return { ok: false, error: "Command timed out (10min limit)" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

export async function updateImage(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const args = ["update", name]
  const result = await runExegol(args, 600000)
  if (!result) return { ok: false, error: "Command timed out (10min limit)" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

export async function uninstallImage(
  name: string,
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  const args = ["uninstall", name]
  if (force) args.push("-F")
  const result = await runExegol(args, 120000)
  if (!result) return { ok: false, error: "Command timed out" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}

// ── Container upgrade ───────────────────────────────────────

export async function upgradeContainer(
  name: string,
  imageTag?: string,
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidName(name)) return { ok: false, error: "Invalid container name" }
  const args = ["upgrade", name]
  if (imageTag) args.push("--image", imageTag)
  if (force) args.push("-F")
  const result = await runExegol(args, 300000)
  if (!result) return { ok: false, error: "Command timed out (5min limit)" }
  if (result.code === 0) return { ok: true }
  return { ok: false, error: extractError(result.stderr || result.stdout) }
}
