/**
 * WebToolService — manages launching web tools inside Exegol containers
 * and provides reverse proxy target info.
 */

import { spawn, execSync } from "child_process"

// ── Tool definitions ─────────────────────────────────────────

export interface WebToolDef {
  id: string
  name: string
  port: number
  setupCommands: string[] // shell commands to run (wait for completion) before daemon
  daemonCommand: string // the main service command, launched with docker exec -d
  healthCheckPath: string // path to GET for readiness check
  stopCommands?: string[] // optional cleanup on stop
  startTimeoutMs?: number // max time for health check (default 30s)
  execTimeoutMs?: number // max time per setup command (default 15s)
}

export const TOOL_DEFS: WebToolDef[] = [
  {
    id: "caido",
    name: "Caido",
    port: 8080,
    setupCommands: [],
    daemonCommand: "caido --listen 0.0.0.0:8080",
    healthCheckPath: "/",
  },
  {
    id: "bloodhound",
    name: "BloodHound",
    port: 1030,
    setupCommands: [
      // 1. Start PostgreSQL if not running
      "pg_isready -q || service postgresql start",
      // 2. Start neo4j if not running (needs JAVA_HOME)
      "neo4j status | grep -q 'is running' || JAVA_HOME=/usr/lib/jvm/java-11-openjdk neo4j start",
      // 3. Wait for neo4j bolt port (7687) to be ready
      "for i in $(seq 1 30); do lsof -Pi :7687 -sTCP:LISTEN -t > /dev/null 2>&1 && break; sleep 2; done",
    ],
    daemonCommand: "/opt/tools/BloodHound-CE/bloodhound -configfile /opt/tools/BloodHound-CE/bloodhound.config.json",
    stopCommands: [
      "pkill -f '/opt/tools/BloodHound-CE/bloodhound'",
      "neo4j stop",
      "service postgresql stop",
    ],
    healthCheckPath: "/ui/login",
    startTimeoutMs: 60000, // postgres + neo4j + BH startup
    execTimeoutMs: 75000, // neo4j wait loop can take up to 60s
  },
]

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

// In-memory map: toolId -> RunningTool
const runningTools = new Map<string, RunningTool>()
// Proxy servers: toolId -> Bun.Server
const proxyServers = new Map<string, ReturnType<typeof Bun.serve>>()

// Proxy ports start at 13100, one per tool
const PROXY_PORT_BASE = 13100
const toolProxyPorts: Record<string, number> = {
  caido: 13100,
  bloodhound: 13101,
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

export function getRunningTool(toolId: string): RunningTool | undefined {
  return runningTools.get(toolId)
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

  // If already running, return existing
  const existing = runningTools.get(toolId)
  if (existing && existing.status === "ready") return existing

  // Get reachable address (localhost for host-network, container IP for bridged)
  const addr = getContainerAddress(container)
  if (!addr) throw new Error(`Cannot get address for container ${container}`)

  const proxyPort = toolProxyPorts[toolId] || (PROXY_PORT_BASE + Object.keys(toolProxyPorts).length)

  const tool: RunningTool = {
    toolId,
    container,
    containerIp: addr.ip,
    port: def.port,
    proxyPort,
    hostNetwork: addr.hostNetwork,
    status: "starting",
    startedAt: Date.now(),
  }
  runningTools.set(toolId, tool)

  // Run setup commands sequentially (these complete before returning)
  const execTimeout = def.execTimeoutMs || 15000
  for (const cmd of def.setupCommands) {
    const result = await dockerExec(container, cmd, execTimeout)
    if (!result.ok) {
      tool.status = "error"
      tool.error = `Failed to run: ${cmd}\n${result.output}`
      return tool
    }
  }

  // Launch the daemon command in detached mode (survives docker exec exit)
  const daemonResult = await dockerExecDetached(container, def.daemonCommand)
  if (!daemonResult.ok) {
    tool.status = "error"
    tool.error = `Failed to start daemon: ${daemonResult.output}`
    return tool
  }

  // Wait for health check
  const startTimeout = def.startTimeoutMs || 30000
  const ready = await waitForReady(addr.ip, def.port, def.healthCheckPath, startTimeout)
  if (ready) {
    tool.status = "ready"
    // Start a dedicated proxy server for this tool
    startProxyServer(toolId, addr.ip, def.port, proxyPort)
  } else {
    tool.status = "error"
    tool.error = `Service did not become ready within ${Math.round(startTimeout / 1000)}s`
  }

  return tool
}

export async function stopTool(toolId: string): Promise<void> {
  // Stop proxy server
  stopProxyServer(toolId)

  const tool = runningTools.get(toolId)
  if (!tool) return

  const def = getToolDef(toolId)
  if (def?.stopCommands) {
    for (const cmd of def.stopCommands) {
      await dockerExec(tool.container, cmd, 5000)
    }
  }

  runningTools.delete(toolId)
}

/**
 * Get the internal proxy target URL for a running tool.
 */
export function getProxyTarget(toolId: string): string | null {
  const tool = runningTools.get(toolId)
  if (!tool || tool.status !== "ready") return null
  return `http://${tool.containerIp}:${tool.port}`
}

// ── Per-tool proxy servers ───────────────────────────────────

/**
 * Start a dedicated Bun HTTP server that proxies all requests to the tool,
 * stripping X-Frame-Options and CSP headers for iframe embedding.
 * Each tool gets its own port (e.g. 13100, 13101) so there are no
 * path-prefix issues with absolute URLs in the proxied app.
 */
function startProxyServer(toolId: string, targetIp: string, targetPort: number, proxyPort: number) {
  // Stop existing proxy if any
  stopProxyServer(toolId)

  const targetBase = `http://${targetIp}:${targetPort}`

  const server = Bun.serve({
    port: proxyPort,
    async fetch(req) {
      const url = new URL(req.url)
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
  })

  proxyServers.set(toolId, server)
  console.log(`[WebTool] Proxy for ${toolId} listening on http://localhost:${proxyPort} -> ${targetBase}`)
}

function stopProxyServer(toolId: string) {
  const server = proxyServers.get(toolId)
  if (server) {
    server.stop()
    proxyServers.delete(toolId)
    console.log(`[WebTool] Proxy for ${toolId} stopped`)
  }
}
