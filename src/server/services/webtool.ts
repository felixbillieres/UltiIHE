/**
 * WebToolService — manages launching web tools inside Exegol containers
 * and provides reverse proxy target info.
 */

import { spawn, execSync } from "child_process"

// ── Tool definitions ─────────────────────────────────────────

export interface WebToolDef {
  id: string
  name: string
  basePort: number // base port — each instance gets basePort + instanceIndex
  /** Commands can use {{PORT}}, {{DISPLAY}}, {{VNC_PORT}} placeholders */
  setupCommands: string[]
  daemonCommand: string
  stopCommands?: string[]
  healthCheckPath?: string
  startTimeoutMs?: number
  execTimeoutMs?: number
  watchProcess?: string
}

export const TOOL_DEFS: WebToolDef[] = [
  {
    id: "desktop",
    name: "Desktop (noVNC)",
    basePort: 6080,
    setupCommands: [
      // Kill any stale websockify on our port
      "ps aux | grep '[w]ebsockify.*{{PORT}}' | awk '{print $2}' | xargs -r kill 2>/dev/null; true",
      // Start VNC server on allocated display (avoid conflicts with Exegol's own displays)
      "vncserver -list 2>/dev/null | grep -q ':{{DISPLAY}}' || vncserver :{{DISPLAY}} -geometry 1920x1080 -depth 24 -localhost no -SecurityTypes None --I-KNOW-THIS-IS-INSECURE 2>/dev/null || true",
      // Wait for VNC to be ready
      "for i in $(seq 1 15); do ss -tlnp 2>/dev/null | grep -q ':{{VNC_PORT}} ' && break; sleep 1; done",
    ],
    daemonCommand: "websockify --web /usr/share/novnc 0.0.0.0:{{PORT}} localhost:{{VNC_PORT}}",
    stopCommands: [
      "ps aux | grep '[w]ebsockify.*{{PORT}}' | awk '{print $2}' | xargs -r kill; true",
      "vncserver -kill :{{DISPLAY}} 2>/dev/null; true",
    ],
    healthCheckPath: "/vnc.html",
    startTimeoutMs: 25000,
    execTimeoutMs: 20000,
  },
  {
    id: "caido",
    name: "Caido",
    basePort: 8080,
    setupCommands: [
      "command -v caido-cli > /dev/null || { echo 'Installing caido-cli...'; curl -sL $(curl -sL https://caido.download/releases/latest | python3 -c \"import sys,json; links=json.load(sys.stdin)['links']; print([l['link'] for l in links if l['kind']=='cli' and l['platform']=='linux-x86_64'][0])\") | tar xz -C /usr/local/bin/ && chmod +x /usr/local/bin/caido-cli; }",
    ],
    daemonCommand: "caido-cli --listen 0.0.0.0:{{PORT}} --no-open",
    stopCommands: ["ps aux | grep '[c]aido-cli.*{{PORT}}' | awk '{print $2}' | xargs -r kill; true"],
    healthCheckPath: "/",
    execTimeoutMs: 120000,
  },
  {
    id: "bloodhound",
    name: "BloodHound",
    basePort: 1030,
    setupCommands: [
      "pg_isready -q || service postgresql start",
      "neo4j status | grep -q 'is running' || JAVA_HOME=/usr/lib/jvm/java-11-openjdk neo4j start",
      "for i in $(seq 1 30); do lsof -Pi :7687 -sTCP:LISTEN -t > /dev/null 2>&1 && break; sleep 2; done",
    ],
    daemonCommand: "/opt/tools/BloodHound-CE/bloodhound -configfile /opt/tools/BloodHound-CE/bloodhound.config.json",
    stopCommands: [
      "pkill -f '/opt/tools/BloodHound-CE/bloodhound'",
      "neo4j stop",
      "service postgresql stop",
    ],
    healthCheckPath: "/ui/login",
    startTimeoutMs: 60000,
    execTimeoutMs: 75000,
  },
]

// ── Template substitution ────────────────────────────────────

/** Track allocated in-container ports: key -> port */
const allocatedToolPorts = new Map<string, number>()

/**
 * Allocate a unique in-container port for a tool instance.
 * Desktop instance 0 → 6080, instance 1 → 6081, etc.
 */
function allocateToolPort(key: string, basePort: number): number {
  const existing = allocatedToolPorts.get(key)
  if (existing) return existing
  const usedPorts = new Set(allocatedToolPorts.values())
  let port = basePort
  while (usedPorts.has(port)) port++
  allocatedToolPorts.set(key, port)
  return port
}

function freeToolPort(key: string) {
  allocatedToolPorts.delete(key)
}

interface TemplateVars {
  PORT: number
  DISPLAY: number
  VNC_PORT: number
}

function resolveTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{PORT\}\}/g, String(vars.PORT))
    .replace(/\{\{DISPLAY\}\}/g, String(vars.DISPLAY))
    .replace(/\{\{VNC_PORT\}\}/g, String(vars.VNC_PORT))
}

// ── Running tool state ───────────────────────────────────────

export interface RunningTool {
  toolId: string
  container: string // docker container name (e.g. "exegol-HTBLabs")
  containerIp: string
  port: number // tool's port inside the container
  proxyPort: number // our local proxy port for iframe embedding
  hostNetwork: boolean
  status: "starting" | "ready" | "error"
  error?: string
  startedAt: number
}

/** Composite key: "toolId:container" */
function toolKey(toolId: string, container: string) {
  return `${toolId}:${container}`
}

// In-memory map: "toolId:container" -> RunningTool
const runningTools = new Map<string, RunningTool>()
// Proxy servers: "toolId:container" -> Bun.Server
const proxyServers = new Map<string, ReturnType<typeof Bun.serve>>()
// Process watchers: "toolId:container" -> timer
const processWatchers = new Map<string, ReturnType<typeof setInterval>>()

// Dynamic proxy port allocation — each tool:container combo gets a unique port
const PROXY_PORT_BASE = 13100
let nextProxyPort = PROXY_PORT_BASE
const allocatedPorts = new Map<string, number>() // key -> port

function allocateProxyPort(key: string): number {
  const existing = allocatedPorts.get(key)
  if (existing) return existing
  const port = nextProxyPort++
  allocatedPorts.set(key, port)
  return port
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Get the reachable address for a container.
 * Exegol containers typically use --network host, so services bind to localhost.
 * For bridged containers, we get the container IP.
 */
function getContainerAddress(containerName: string): { ip: string; hostNetwork: boolean } | null {
  try {
    const networkMode = execSync(
      `docker inspect -f '{{.HostConfig.NetworkMode}}' ${containerName}`,
      { timeout: 5000 },
    ).toString().trim()

    if (networkMode === "host") {
      return { ip: "127.0.0.1", hostNetwork: true }
    }

    const ip = execSync(
      `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`,
      { timeout: 5000 },
    ).toString().trim()

    return ip ? { ip, hostNetwork: false } : null
  } catch {
    return null
  }
}

async function dockerExec(
  container: string,
  command: string,
  timeout = 15000,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["exec", container, "bash", "-c", command], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let output = ""
    const timer = setTimeout(() => {
      proc.kill("SIGKILL")
      resolve({ ok: true, output }) // timeout is OK for bg processes
    }, timeout)

    proc.stdout?.on("data", (d) => (output += d.toString()))
    proc.stderr?.on("data", (d) => (output += d.toString()))

    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0 || code === null, output })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ ok: false, output: err.message })
    })
  })
}

/**
 * Launch a command in detached mode (docker exec -d).
 * The command runs as a daemon and survives after docker exec exits.
 */
async function dockerExecDetached(
  container: string,
  command: string,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      "docker",
      ["exec", "-d", container, "bash", "-c", `${command} > /tmp/webtool-daemon.log 2>&1`],
      { stdio: ["pipe", "pipe", "pipe"] },
    )

    let output = ""
    proc.stdout?.on("data", (d) => (output += d.toString()))
    proc.stderr?.on("data", (d) => (output += d.toString()))

    proc.on("close", (code) => {
      resolve({ ok: code === 0 || code === null, output })
    })

    proc.on("error", (err) => {
      resolve({ ok: false, output: err.message })
    })
  })
}

async function waitForReady(
  ip: string,
  port: number,
  healthPath: string,
  maxWait = 30000,
): Promise<boolean> {
  const start = Date.now()
  const url = `http://${ip}:${port}${healthPath}`

  while (Date.now() - start < maxWait) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(2000),
      })
      // Any response (even 401/403) means the service is up
      if (resp.status < 500) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

// ── Public API ───────────────────────────────────────────────

export function getToolDef(toolId: string): WebToolDef | undefined {
  return TOOL_DEFS.find((t) => t.id === toolId)
}

export function getRunningTool(toolId: string, container?: string): RunningTool | undefined {
  if (container) {
    return runningTools.get(toolKey(toolId, container))
  }
  // Legacy: find any running instance of this tool
  for (const tool of runningTools.values()) {
    if (tool.toolId === toolId) return tool
  }
  return undefined
}

export function getAllRunningTools(): RunningTool[] {
  return Array.from(runningTools.values())
}

export async function launchTool(
  toolId: string,
  container: string,
): Promise<RunningTool> {
  const def = getToolDef(toolId)
  if (!def) throw new Error(`Unknown tool: ${toolId}`)

  const key = toolKey(toolId, container)

  // If already running in this container, return existing
  const existing = runningTools.get(key)
  if (existing && existing.status === "ready") return existing

  // Get reachable address (localhost for host-network, container IP for bridged)
  const addr = getContainerAddress(container)
  if (!addr) throw new Error(`Cannot get address for container ${container}`)

  const proxyPort = allocateProxyPort(key)

  // Allocate a unique in-container port for this instance
  const toolPort = allocateToolPort(key, def.basePort)
  // For desktop: display = port offset from base + 3 (start at :3 to avoid Exegol's :0/:1/:2)
  const displayNum = 3 + (toolPort - def.basePort)
  const vncPort = 5900 + displayNum

  const vars: TemplateVars = { PORT: toolPort, DISPLAY: displayNum, VNC_PORT: vncPort }

  const tool: RunningTool = {
    toolId,
    container,
    containerIp: addr.ip,
    port: toolPort,
    proxyPort,
    hostNetwork: addr.hostNetwork,
    status: "starting",
    startedAt: Date.now(),
  }
  runningTools.set(key, tool)

  // Run setup commands sequentially (these complete before returning)
  const execTimeout = def.execTimeoutMs || 15000
  for (const cmd of def.setupCommands) {
    const resolved = resolveTemplate(cmd, vars)
    const result = await dockerExec(container, resolved, execTimeout)
    if (!result.ok) {
      tool.status = "error"
      tool.error = `Failed to run: ${resolved}\n${result.output}`
      return tool
    }
  }

  // Launch the daemon command in detached mode (survives docker exec exit)
  const daemonResolved = resolveTemplate(def.daemonCommand, vars)
  const daemonResult = await dockerExecDetached(container, daemonResolved)
  if (!daemonResult.ok) {
    tool.status = "error"
    tool.error = `Failed to start daemon: ${daemonResult.output}`
    return tool
  }

  // Wait for health check
  const startTimeout = def.startTimeoutMs || 30000
  const ready = await waitForReady(addr.ip, toolPort, def.healthCheckPath!, startTimeout)
  if (ready) {
    tool.status = "ready"
    startProxyServer(key, addr.ip, toolPort, proxyPort)
    if (def.watchProcess) {
      startProcessWatcher(key, toolId, container, def.watchProcess)
    }
  } else {
    tool.status = "error"
    tool.error = `Service did not become ready within ${Math.round(startTimeout / 1000)}s`
  }

  return tool
}

/**
 * Poll for a process inside the container. When it exits, auto-stop the tool.
 */
function startProcessWatcher(key: string, toolId: string, container: string, processName: string) {
  stopProcessWatcher(key)
  // Initial delay: give the process time to start before polling
  const startDelay = setTimeout(() => {
    const interval = setInterval(async () => {
      const result = await dockerExec(container, `pgrep -x ${processName}`, 3000)
      if (!result.ok || !result.output.trim()) {
        console.log(`[WebTool] ${processName} exited in ${container}, auto-stopping ${toolId}`)
        clearInterval(interval)
        processWatchers.delete(key)
        await stopTool(toolId, container)
      }
    }, 5000)
    processWatchers.set(key, interval)
  }, 10000) // wait 10s before first check
  // Store timeout so it can be cancelled on stop
  processWatchers.set(key, startDelay as any)
}

function stopProcessWatcher(key: string) {
  const timer = processWatchers.get(key)
  if (timer) {
    clearInterval(timer)
    processWatchers.delete(key)
  }
}

export async function stopTool(toolId: string, container?: string): Promise<void> {
  // If no container, find the first running instance
  if (!container) {
    for (const tool of runningTools.values()) {
      if (tool.toolId === toolId) {
        container = tool.container
        break
      }
    }
    if (!container) return
  }

  const key = toolKey(toolId, container)

  // Stop process watcher
  stopProcessWatcher(key)
  // Stop proxy server
  stopProxyServer(key)

  const tool = runningTools.get(key)
  if (!tool) return

  const def = getToolDef(toolId)
  if (def?.stopCommands) {
    // Reconstruct template vars from the running tool's port
    const displayNum = 3 + (tool.port - def.basePort)
    const vars: TemplateVars = { PORT: tool.port, DISPLAY: displayNum, VNC_PORT: 5900 + displayNum }
    for (const cmd of def.stopCommands) {
      const resolved = resolveTemplate(cmd, vars)
      await dockerExec(tool.container, resolved, 5000)
    }
  }

  runningTools.delete(key)
  freeToolPort(key)
}

/**
 * Get the internal proxy target URL for a running tool.
 */
export function getProxyTarget(toolId: string, container?: string): string | null {
  if (container) {
    const tool = runningTools.get(toolKey(toolId, container))
    if (!tool || tool.status !== "ready") return null
    return `http://${tool.containerIp}:${tool.port}`
  }
  // Legacy: find any running instance
  for (const tool of runningTools.values()) {
    if (tool.toolId === toolId && tool.status === "ready") {
      return `http://${tool.containerIp}:${tool.port}`
    }
  }
  return null
}

// ── Per-tool proxy servers ───────────────────────────────────

/**
 * Start a dedicated Bun HTTP server that proxies all requests to the tool,
 * stripping X-Frame-Options and CSP headers for iframe embedding.
 * Each tool gets its own port (e.g. 13100, 13101) so there are no
 * path-prefix issues with absolute URLs in the proxied app.
 *
 * Also supports WebSocket upgrade for tools that need it (e.g. noVNC/websockify).
 */
function startProxyServer(key: string, targetIp: string, targetPort: number, proxyPort: number) {
  // Stop existing proxy if any
  stopProxyServer(key)

  const targetBase = `http://${targetIp}:${targetPort}`
  const wsTarget = `ws://${targetIp}:${targetPort}`

  const server = Bun.serve<{ targetWsUrl: string }>({
    port: proxyPort,
    async fetch(req, server) {
      const url = new URL(req.url)

      // WebSocket upgrade — needed for noVNC/websockify
      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const targetWsUrl = `${wsTarget}${url.pathname}${url.search}`
        const ok = server.upgrade(req, { data: { targetWsUrl } })
        if (ok) return undefined as any
        return new Response("WebSocket upgrade failed", { status: 500 })
      }

      const targetUrl = `${targetBase}${url.pathname}${url.search}`

      try {
        const headers = new Headers(req.headers)
        headers.delete("host")
        headers.set("host", `${targetIp}:${targetPort}`)

        const hasBody = req.method !== "GET" && req.method !== "HEAD"
        const resp = await fetch(targetUrl, {
          method: req.method,
          headers,
          body: hasBody ? req.body : undefined,
          // @ts-ignore
          duplex: hasBody ? "half" : undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
        })

        const respHeaders = new Headers(resp.headers)
        // Strip iframe-blocking headers
        respHeaders.delete("x-frame-options")
        respHeaders.delete("content-security-policy")
        // Avoid encoding issues
        respHeaders.delete("content-encoding")
        respHeaders.delete("content-length")
        // CORS
        respHeaders.set("access-control-allow-origin", "*")

        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: respHeaders,
        })
      } catch (e) {
        return new Response(`Proxy error: ${(e as Error).message}`, { status: 502 })
      }
    },
    websocket: {
      // Bridge: client <-> upstream WebSocket (for noVNC)
      async open(ws) {
        const { targetWsUrl } = ws.data
        // Queue messages until upstream is connected
        const pendingQueue: (string | ArrayBuffer | Uint8Array)[] = []
        ;(ws as any)._queue = pendingQueue
        ;(ws as any)._upstreamReady = false

        try {
          const upstream = new WebSocket(targetWsUrl)
          ;(ws as any)._upstream = upstream
          upstream.binaryType = "arraybuffer"

          upstream.addEventListener("open", () => {
            ;(ws as any)._upstreamReady = true
            // Drain queued messages
            for (const msg of pendingQueue) {
              try { upstream.send(msg) } catch { /* */ }
            }
            pendingQueue.length = 0
          })

          upstream.addEventListener("message", (ev) => {
            try {
              if (ev.data instanceof ArrayBuffer) {
                ws.sendBinary(new Uint8Array(ev.data))
              } else {
                ws.send(ev.data as string)
              }
            } catch { /* client disconnected */ }
          })

          upstream.addEventListener("close", () => { ws.close() })
          upstream.addEventListener("error", () => { ws.close() })
        } catch {
          ws.close()
        }
      },
      message(ws, message) {
        const upstream = (ws as any)._upstream as WebSocket | undefined
        if (!upstream) return
        // If upstream isn't connected yet, queue the message
        if (!(ws as any)._upstreamReady) {
          ;(ws as any)._queue?.push(message)
          return
        }
        if (upstream.readyState !== WebSocket.OPEN) return
        try { upstream.send(message) } catch { /* upstream disconnected */ }
      },
      close(ws) {
        const upstream = (ws as any)._upstream as WebSocket | undefined
        if (upstream && upstream.readyState === WebSocket.OPEN) {
          upstream.close()
        }
      },
    },
  })

  proxyServers.set(key, server)
  console.log(`[WebTool] Proxy for ${key} listening on http://localhost:${proxyPort} -> ${targetBase} (WS enabled)`)
}

function stopProxyServer(key: string) {
  const server = proxyServers.get(key)
  if (server) {
    server.stop()
    proxyServers.delete(key)
    console.log(`[WebTool] Proxy for ${key} stopped`)
  }
}
