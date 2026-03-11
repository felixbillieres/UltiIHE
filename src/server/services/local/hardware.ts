/**
 * GPU/hardware detection for local AI inference.
 * Detects CUDA, Vulkan, Metal and available VRAM.
 */

import { execSync } from "child_process"
import os from "os"

export type GpuBackend = "cuda" | "vulkan" | "metal" | "cpu"

export interface GpuInfo {
  backend: GpuBackend
  name: string
  vramMB: number
  vramFreeMB: number
  driverVersion?: string
}

export interface HardwareInfo {
  platform: NodeJS.Platform
  arch: string
  totalRAM_MB: number
  freeRAM_MB: number
  cpuCores: number
  gpus: GpuInfo[]
  recommendedBackend: GpuBackend
}

function tryExec(cmd: string, timeout = 5000): string | null {
  try {
    return execSync(cmd, { timeout, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch {
    return null
  }
}

function detectNvidia(): GpuInfo[] {
  const raw = tryExec(
    "nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits",
  )
  if (!raw) return []

  return raw.split("\n").filter(Boolean).map((line) => {
    const [name, totalStr, freeStr, driver] = line.split(", ").map((s) => s.trim())
    return {
      backend: "cuda" as const,
      name: name || "NVIDIA GPU",
      vramMB: parseInt(totalStr) || 0,
      vramFreeMB: parseInt(freeStr) || 0,
      driverVersion: driver,
    }
  })
}

function detectVulkan(): GpuInfo[] {
  // Try vulkaninfo for non-NVIDIA GPUs (AMD, Intel)
  const raw = tryExec("vulkaninfo --summary 2>/dev/null | grep -E '(deviceName|deviceType|heap)'")
  if (!raw) return []

  const nameMatch = raw.match(/deviceName\s*=\s*(.+)/i)
  if (!nameMatch) return []

  // Rough VRAM detection from vulkan heap info
  const heapMatch = raw.match(/size\s*=\s*(\d+)/i)
  const vramMB = heapMatch ? Math.round(parseInt(heapMatch[1]) / (1024 * 1024)) : 0

  return [{
    backend: "vulkan" as const,
    name: nameMatch[1].trim(),
    vramMB,
    vramFreeMB: vramMB, // Vulkan doesn't report free easily
  }]
}

function detectMetal(): GpuInfo[] {
  if (process.platform !== "darwin") return []

  const raw = tryExec("system_profiler SPDisplaysDataType 2>/dev/null")
  if (!raw) return []

  const nameMatch = raw.match(/Chipset Model:\s*(.+)/i) || raw.match(/Chip:\s*(.+)/i)
  // Apple Silicon shares system memory — report total RAM as "VRAM"
  const isAppleSilicon = os.arch() === "arm64"
  const totalRAM = Math.round(os.totalmem() / (1024 * 1024))

  // For Apple Silicon, GPU can use most of the unified memory
  // For Intel Macs with discrete GPU, try to parse VRAM
  let vramMB = 0
  if (isAppleSilicon) {
    // ~75% of unified memory is typically available to GPU
    vramMB = Math.round(totalRAM * 0.75)
  } else {
    const vramMatch = raw.match(/VRAM.*?:\s*(\d+)\s*(MB|GB)/i)
    if (vramMatch) {
      vramMB = parseInt(vramMatch[1]) * (vramMatch[2].toUpperCase() === "GB" ? 1024 : 1)
    }
  }

  return [{
    backend: "metal" as const,
    name: nameMatch?.[1]?.trim() || (isAppleSilicon ? "Apple Silicon" : "macOS GPU"),
    vramMB,
    vramFreeMB: vramMB, // Not easy to get free unified memory
  }]
}

export function detectHardware(): HardwareInfo {
  const platform = process.platform
  const arch = os.arch()
  const totalRAM_MB = Math.round(os.totalmem() / (1024 * 1024))
  const freeRAM_MB = Math.round(os.freemem() / (1024 * 1024))
  const cpuCores = os.cpus().length

  // Try GPU detection in priority order
  let gpus: GpuInfo[] = []

  if (platform === "darwin") {
    gpus = detectMetal()
  } else {
    // Linux/Windows — try NVIDIA first, then Vulkan
    gpus = detectNvidia()
    if (gpus.length === 0) {
      gpus = detectVulkan()
    }
  }

  // Determine best backend
  let recommendedBackend: GpuBackend = "cpu"
  if (gpus.length > 0) {
    recommendedBackend = gpus[0].backend
  }

  return {
    platform,
    arch,
    totalRAM_MB,
    freeRAM_MB,
    cpuCores,
    gpus,
    recommendedBackend,
  }
}

/**
 * Estimate whether a model of given size (MB) can run on this hardware.
 * Returns "ok" | "tight" | "too-large"
 */
export function assessModelFit(
  modelSizeMB: number,
  hardware: HardwareInfo,
): "ok" | "tight" | "too-large" {
  const bestGpu = hardware.gpus[0]
  const availableMB = bestGpu ? bestGpu.vramFreeMB : hardware.freeRAM_MB

  // Model needs ~1.2x its file size in memory for inference
  const requiredMB = modelSizeMB * 1.2

  if (requiredMB <= availableMB * 0.8) return "ok"
  if (requiredMB <= availableMB) return "tight"
  return "too-large"
}
