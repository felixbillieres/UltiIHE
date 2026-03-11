/**
 * llama-server process management.
 * Spawns llama-server as a child process and manages its lifecycle.
 */

import type { Subprocess } from "bun"
import { getLlamaServerPath } from "./binary"

export interface LocalServerStatus {
  running: boolean
  modelId: string | null
  modelPath: string | null
  port: number | null
  pid: number | null
  baseUrl: string | null
  contextSize: number | null
}

let serverProcess: Subprocess | null = null
let currentModelId: string | null = null
let currentModelPath: string | null = null
let currentPort: number | null = null
let currentContextSize: number | null = null

/**
 * Kill any orphaned llama-server processes.
 * This handles the case where bun --watch restarts the server
 * but the child llama-server process keeps running.
 */
async function killOrphanedServers(): Promise<void> {
  try {
    if (process.platform === "win32") {
      // Windows: taskkill by name
      Bun.spawn(["taskkill", "/F", "/IM", "llama-server.exe"], {
        stdout: "ignore", stderr: "ignore",
      })
    } else {
      // Unix: pkill by name (SIGTERM, graceful)
      const proc = Bun.spawn(["pkill", "-f", "llama-server"], {
        stdout: "ignore", stderr: "ignore",
      })
      await proc.exited
      // Brief wait for processes to die
      await Bun.sleep(500)
    }
  } catch {
    // pkill/taskkill might not exist or no processes found — that's fine
  }
}

/**
 * Find an available port in the ephemeral range.
 */
async function findFreePort(): Promise<number> {
  // Use Bun's built-in server to find a free port
  const server = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = server.port!
  server.stop()
  return port
}

/**
 * Start the llama-server with a given model file.
 */
export async function startServer(opts: {
  modelId: string
  modelPath: string
  contextSize?: number
  gpuLayers?: number  // -1 = auto (all layers), 0 = CPU only
  threads?: number
}): Promise<{ port: number; baseUrl: string }> {
  // Stop existing server first
  if (serverProcess) {
    await stopServer()
  }

  // Kill any orphaned llama-server processes from previous hot-reloads.
  // In dev mode, bun --watch resets module vars but doesn't kill child processes.
  await killOrphanedServers()

  const binaryPath = getLlamaServerPath()
  if (!binaryPath) {
    throw new Error("llama-server binary not installed. Install it from Settings > Local AI.")
  }

  const port = await findFreePort()
  const args = [
    "-m", opts.modelPath,
    "--host", "127.0.0.1",
    "--port", String(port),
    "-c", String(opts.contextSize || 4096),
    "--alias", opts.modelId,
    // Enable Jinja template rendering — required for tool/function calling.
    // Without this, tools sent via OpenAI API are ignored by the model.
    "--jinja",
    // Use only 1 parallel slot to maximize context per request on CPU
    "-np", "1",
  ]

  // GPU layers: -1 means offload all, 0 means CPU only
  const ngl = opts.gpuLayers ?? 999
  args.push("-ngl", String(ngl))

  // CPU threads (default to core count / 2)
  if (opts.threads) {
    args.push("-t", String(opts.threads))
  }

  console.log(`[Local AI] Starting llama-server on port ${port}: ${binaryPath} ${args.join(" ")}`)

  // Set library path so llama-server finds its shared libraries (.so/.dylib)
  // Include bin dir + subdirectories where libs live after extraction
  const binDir = binaryPath.substring(0, binaryPath.lastIndexOf("/"))
  const extraEnv: Record<string, string> = {}

  if (process.platform !== "win32") {
    const { readdirSync, statSync: statSyncFs } = await import("fs")
    const { join: joinPath } = await import("path")
    const subDirs = readdirSync(binDir)
      .map((d) => joinPath(binDir, d))
      .filter((p) => { try { return statSyncFs(p).isDirectory() } catch { return false } })
    const ldKey = process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH"
    const sep = process.platform === "darwin" ? ":" : ":"
    extraEnv[ldKey] = [binDir, ...subDirs, process.env[ldKey]].filter(Boolean).join(sep)
  }
  // Windows: DLLs in the same directory as the exe are found automatically

  serverProcess = Bun.spawn([binaryPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...extraEnv },
  })

  currentModelId = opts.modelId
  currentModelPath = opts.modelPath
  currentPort = port
  currentContextSize = opts.contextSize || 4096

  // Log server output — capture stderr too for error diagnosis
  const streamOutput = (stream: ReadableStream<Uint8Array> | null, label: string) => {
    if (!stream) return
    const reader = stream.getReader()
    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = new TextDecoder().decode(value)
          if (text.trim()) console.log(`[llama-server ${label}] ${text.trim()}`)
        }
      } catch {}
    })()
  }
  streamOutput(serverProcess.stdout as ReadableStream<Uint8Array> | null, "stdout")
  streamOutput(serverProcess.stderr as ReadableStream<Uint8Array> | null, "stderr")

  // Wait for server to be ready (poll /health)
  const baseUrl = `http://127.0.0.1:${port}`
  const maxWait = 60_000 // 60 seconds max — model loading can be slow
  const start = Date.now()

  let lastHealthStatus = ""
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const data = await res.json() as { status?: string }
        if (data.status && data.status !== lastHealthStatus) {
          lastHealthStatus = data.status
          console.log(`[Local AI] Health: ${data.status} (${Math.round((Date.now() - start) / 1000)}s)`)
        }
        if (data.status === "ok" || data.status === "no slot available") {
          console.log(`[Local AI] Server ready on ${baseUrl} (${Date.now() - start}ms)`)
          return { port, baseUrl }
        }
        // "loading model" status means server is alive but still loading — keep waiting
      }
    } catch {
      // Not ready yet — server not accepting connections
    }

    // Check if process died
    if (serverProcess.exitCode !== null) {
      const exitCode = serverProcess.exitCode
      serverProcess = null
      currentModelId = null
      currentModelPath = null
      currentPort = null
      throw new Error(`llama-server crashed on startup (exit code ${exitCode}). Check server logs for details.`)
    }

    await Bun.sleep(500)
  }

  // Timeout — kill and report
  await stopServer()
  throw new Error("llama-server failed to start within 60 seconds")
}

/**
 * Stop the running llama-server.
 */
export async function stopServer(): Promise<void> {
  if (!serverProcess) return

  console.log("[Local AI] Stopping llama-server...")
  try {
    serverProcess.kill()
    // Wait for graceful exit
    const exitPromise = serverProcess.exited
    const timeout = setTimeout(() => {
      try { serverProcess?.kill(9) } catch {}
    }, 5000)
    await exitPromise
    clearTimeout(timeout)
  } catch {}

  serverProcess = null
  currentModelId = null
  currentModelPath = null
  currentPort = null
  currentContextSize = null
}

/**
 * Get current server status.
 */
export function getServerStatus(): LocalServerStatus {
  const running = serverProcess !== null && serverProcess.exitCode === null

  // If process has exited unexpectedly, clean up state
  if (serverProcess && serverProcess.exitCode !== null) {
    serverProcess = null
    currentModelId = null
    currentModelPath = null
    currentPort = null
    currentContextSize = null
  }

  return {
    running,
    modelId: currentModelId,
    modelPath: currentModelPath,
    port: currentPort,
    pid: serverProcess?.pid ?? null,
    baseUrl: currentPort ? `http://127.0.0.1:${currentPort}` : null,
    contextSize: currentContextSize,
  }
}
