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
}

let serverProcess: Subprocess | null = null
let currentModelId: string | null = null
let currentModelPath: string | null = null
let currentPort: number | null = null

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
  ]

  // GPU layers: -1 means offload all, 0 means CPU only
  const ngl = opts.gpuLayers ?? 999
  args.push("-ngl", String(ngl))

  // CPU threads (default to core count / 2)
  if (opts.threads) {
    args.push("-t", String(opts.threads))
  }

  console.log(`[Local AI] Starting llama-server on port ${port}: ${binaryPath} ${args.join(" ")}`)

  serverProcess = Bun.spawn([binaryPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  })

  currentModelId = opts.modelId
  currentModelPath = opts.modelPath
  currentPort = port

  // Log server output
  if (serverProcess.stdout && typeof serverProcess.stdout !== "number") {
    const reader = (serverProcess.stdout as ReadableStream<Uint8Array>).getReader()
    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = new TextDecoder().decode(value)
          if (text.trim()) console.log(`[llama-server] ${text.trim()}`)
        }
      } catch {}
    })()
  }

  // Wait for server to be ready (poll /health)
  const baseUrl = `http://127.0.0.1:${port}`
  const maxWait = 60_000 // 60 seconds max — model loading can be slow
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const data = await res.json() as { status?: string }
        if (data.status === "ok" || data.status === "no slot available") {
          console.log(`[Local AI] Server ready on ${baseUrl} (${Date.now() - start}ms)`)
          return { port, baseUrl }
        }
      }
    } catch {
      // Not ready yet
    }

    // Check if process died
    if (serverProcess.exitCode !== null) {
      const exitCode = serverProcess.exitCode
      serverProcess = null
      currentModelId = null
      currentModelPath = null
      currentPort = null
      throw new Error(`llama-server exited with code ${exitCode}`)
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
  }

  return {
    running,
    modelId: currentModelId,
    modelPath: currentModelPath,
    port: currentPort,
    pid: serverProcess?.pid ?? null,
    baseUrl: currentPort ? `http://127.0.0.1:${currentPort}` : null,
  }
}
