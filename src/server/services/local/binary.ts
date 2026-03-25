/**
 * llama-server binary management.
 * Downloads the correct pre-compiled binary for the current platform + GPU backend.
 */

import { existsSync, mkdirSync, chmodSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { GpuBackend } from "./hardware"

const BASE_DIR = join(homedir(), ".exegol-ihe")
const BIN_DIR = join(BASE_DIR, "bin")

// Latest stable release — update this periodically
const LLAMA_CPP_VERSION = "b8272"
const GITHUB_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}`

/**
 * Map (platform, arch, backend) → release archive filename.
 * Based on actual release assets from ggml-org/llama.cpp.
 */
function getArchiveName(
  platform: NodeJS.Platform,
  arch: string,
  backend: GpuBackend,
): string | null {
  const v = LLAMA_CPP_VERSION

  if (platform === "darwin") {
    if (arch === "arm64") return `llama-${v}-bin-macos-arm64.tar.gz`
    if (arch === "x64") return `llama-${v}-bin-macos-x64.tar.gz`
    return null
  }

  if (platform === "linux" && arch === "x64") {
    // Linux has: CPU, Vulkan, ROCm — no CUDA (CUDA is Windows only)
    if (backend === "vulkan") return `llama-${v}-bin-ubuntu-vulkan-x64.tar.gz`
    return `llama-${v}-bin-ubuntu-x64.tar.gz` // CPU fallback (also for cuda — not available on Linux)
  }

  if (platform === "win32") {
    if (arch === "x64") {
      if (backend === "cuda") return `llama-${v}-bin-win-cuda-12.4-x64.zip`
      if (backend === "vulkan") return `llama-${v}-bin-win-vulkan-x64.zip`
      return `llama-${v}-bin-win-cpu-x64.zip`
    }
    if (arch === "arm64") return `llama-${v}-bin-win-cpu-arm64.zip`
  }

  return null
}

function ensureBinDir() {
  if (!existsSync(BIN_DIR)) {
    mkdirSync(BIN_DIR, { recursive: true })
  }
}

/**
 * Get the path to the llama-server binary (if it exists).
 */
export function getLlamaServerPath(): string | null {
  const ext = process.platform === "win32" ? ".exe" : ""
  const binaryPath = join(BIN_DIR, `llama-server${ext}`)
  return existsSync(binaryPath) ? binaryPath : null
}

export function getBinaryVersion(): string | null {
  const versionFile = join(BIN_DIR, ".version")
  if (!existsSync(versionFile)) return null
  try {
    return Bun.file(versionFile).text().then(() => null) as unknown as string
    // Sync read for simplicity
  } catch {
    return null
  }
}

export interface BinaryStatus {
  installed: boolean
  version: string | null
  path: string | null
  expectedVersion: string
}

export function getBinaryStatus(): BinaryStatus {
  const path = getLlamaServerPath()

  // Auto-repair: ensure shared libraries are alongside the binary
  if (path) {
    repairSharedLibraries()
  }

  return {
    installed: path !== null,
    version: path ? LLAMA_CPP_VERSION : null,
    path,
    expectedVersion: LLAMA_CPP_VERSION,
  }
}

/**
 * Ensure shared libraries from archive subdirectories are available to llama-server.
 * - Linux: copies .so files + creates versioned symlinks (libmtmd.so.0.0.8272 → libmtmd.so.0)
 * - macOS: copies .dylib files
 * - Windows: copies .dll files (DLLs are resolved from the exe's directory automatically)
 * All done with pure Node/Bun APIs — no shell commands — portable across all OSes.
 */
function repairSharedLibraries() {
  try {
    const { readdirSync, statSync: statSyncLocal, copyFileSync, symlinkSync } = require("fs") as typeof import("fs")
    const { join: joinPath } = require("path") as typeof import("path")

    const ext = process.platform === "darwin" ? ".dylib"
      : process.platform === "win32" ? ".dll"
      : ".so"

    // Walk one level of subdirectories in BIN_DIR
    const entries = readdirSync(BIN_DIR)
    for (const entry of entries) {
      const subDir = joinPath(BIN_DIR, entry)
      try {
        if (!statSyncLocal(subDir).isDirectory()) continue
      } catch { continue }

      const files = readdirSync(subDir)
      for (const file of files) {
        if (!file.includes(ext)) continue

        const src = joinPath(subDir, file)
        const dest = joinPath(BIN_DIR, file)
        if (!existsSync(dest)) {
          try { copyFileSync(src, dest) } catch {}
        }

        // Linux: create versioned symlinks (libfoo.so.0.0.1234 → libfoo.so.0 → libfoo.so)
        if (process.platform !== "win32" && file.includes(".so.")) {
          const parts = file.split(".so.")
          const baseName = parts[0] + ".so"
          const versionParts = parts[1]?.split(".") || []

          if (versionParts.length > 1) {
            const majorLink = joinPath(BIN_DIR, `${baseName}.${versionParts[0]}`)
            if (!existsSync(majorLink)) {
              try { symlinkSync(file, majorLink) } catch {}
            }
          }

          const baseLink = joinPath(BIN_DIR, baseName)
          if (!existsSync(baseLink)) {
            try { symlinkSync(file, baseLink) } catch {}
          }
        }
      }
    }
  } catch {}
}

/**
 * Download and extract the llama-server binary for the current platform.
 * Returns an async generator of progress messages.
 */
export async function* downloadBinary(
  backend: GpuBackend,
): AsyncGenerator<{ status: string; percent: number; error?: string }> {
  const platform = process.platform
  const arch = process.arch

  const archiveName = getArchiveName(platform, arch, backend)
  if (!archiveName) {
    yield { status: "error", percent: 0, error: `Unsupported platform: ${platform}/${arch}` }
    return
  }

  ensureBinDir()

  const url = `${GITHUB_BASE}/${archiveName}`
  yield { status: "downloading", percent: 5 }

  try {
    const response = await fetch(url, { redirect: "follow" })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to download from ${url}`)
    }

    const totalBytes = parseInt(response.headers.get("content-length") || "0")
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    // Download to temp file
    const tempPath = join(BIN_DIR, archiveName)
    const writer = Bun.file(tempPath).writer()
    let downloaded = 0
    let lastYieldMB = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      writer.write(value)
      downloaded += value.byteLength
      const downloadedMB = Math.round(downloaded / (1024 * 1024))
      // Yield every ~1MB to avoid flooding
      if (downloadedMB > lastYieldMB) {
        lastYieldMB = downloadedMB
        const percent = totalBytes > 0
          ? Math.round((downloaded / totalBytes) * 80) + 5
          : Math.min(5 + downloadedMB * 2, 80) // Estimate: assume ~40MB total
        yield { status: "downloading", percent }
      }
    }
    await writer.end()

    yield { status: "extracting", percent: 85 }

    // Extract — all platforms now use tar.gz except Windows (zip)
    const ext = process.platform === "win32" ? ".exe" : ""
    const binaryName = `llama-server${ext}`

    if (archiveName.endsWith(".tar.gz")) {
      // Extract everything first
      const proc = Bun.spawn(
        ["tar", "xzf", tempPath, "-C", BIN_DIR],
        { cwd: BIN_DIR, stdout: "pipe", stderr: "pipe" },
      )
      await proc.exited
    } else {
      // Windows — unzip
      const proc = Bun.spawn(
        ["unzip", "-o", tempPath, "-d", BIN_DIR],
        { cwd: BIN_DIR, stdout: "pipe", stderr: "pipe" },
      )
      await proc.exited
    }

    // Find the binary — it's usually in a subdirectory like build/bin/ or bin/
    const binaryPath = join(BIN_DIR, binaryName)
    if (!existsSync(binaryPath)) {
      // Walk subdirectories to find the binary (portable, no shell commands)
      const { readdirSync: readDirLocal, statSync: statLocal, renameSync } = await import("fs")
      const findBinary = (dir: string): string | null => {
        try {
          for (const entry of readDirLocal(dir)) {
            const full = join(dir, entry)
            try {
              const st = statLocal(full)
              if (st.isFile() && entry === binaryName) return full
              if (st.isDirectory()) {
                const found = findBinary(full)
                if (found) return found
              }
            } catch {}
          }
        } catch {}
        return null
      }
      const found = findBinary(BIN_DIR)
      if (found) {
        renameSync(found, binaryPath)
      }
    }

    // Copy shared libraries + create symlinks (portable, no shell commands)
    repairSharedLibraries()

    // Make executable on Unix
    if (platform !== "win32" && existsSync(binaryPath)) {
      chmodSync(binaryPath, 0o755)
    }

    // Write version marker
    await Bun.write(join(BIN_DIR, ".version"), LLAMA_CPP_VERSION)

    // Cleanup temp archive
    try {
      const { unlinkSync } = await import("fs")
      unlinkSync(tempPath)
    } catch {}

    if (!existsSync(binaryPath)) {
      yield { status: "error", percent: 0, error: "Binary not found after extraction" }
      return
    }

    yield { status: "complete", percent: 100 }
  } catch (err) {
    yield { status: "error", percent: 0, error: (err as Error).message }
  }
}
