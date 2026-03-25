/**
 * Local model download and management logic.
 * Models are stored in ~/.exegol-ihe/models/ as GGUF files.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { LOCAL_MODEL_CATALOG } from "./modelCatalog"
import type { LocalModelDef } from "./modelCatalog"

// Re-export catalog data so existing imports from this module keep working
export { LOCAL_MODEL_CATALOG, type LocalModelDef } from "./modelCatalog"

// ─── Paths ───────────────────────────────────────────────────

const BASE_DIR = join(homedir(), ".exegol-ihe")
const MODELS_DIR = join(BASE_DIR, "models")

export function ensureModelsDir() {
  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true })
  }
}

export function getModelsDir(): string {
  ensureModelsDir()
  return MODELS_DIR
}

// ─── Installed models ────────────────────────────────────────

export interface InstalledModel {
  id: string
  filePath: string
  fileSizeMB: number
  catalogEntry?: LocalModelDef
}

export function listInstalledModels(): InstalledModel[] {
  ensureModelsDir()
  const files = readdirSync(MODELS_DIR).filter((f) => f.endsWith(".gguf"))

  return files
    .filter((file) => {
      // Skip files that are currently being downloaded
      const catalogEntry = LOCAL_MODEL_CATALOG.find((m) => m.hfFile === file)
      if (catalogEntry && isDownloading(catalogEntry.id)) return false

      // Skip suspiciously small files (likely partial downloads that were interrupted)
      const filePath = join(MODELS_DIR, file)
      const stats = statSync(filePath)
      const fileSizeMB = Math.round(stats.size / (1024 * 1024))
      if (catalogEntry && fileSizeMB < catalogEntry.fileSizeMB * 0.9) return false

      return true
    })
    .map((file) => {
      const filePath = join(MODELS_DIR, file)
      const stats = statSync(filePath)
      const fileSizeMB = Math.round(stats.size / (1024 * 1024))
      const catalogEntry = LOCAL_MODEL_CATALOG.find((m) => m.hfFile === file)

      return {
        id: catalogEntry?.id || file.replace(".gguf", ""),
        filePath,
        fileSizeMB,
        catalogEntry,
      }
    })
}

export function deleteModel(modelId: string): boolean {
  const installed = listInstalledModels()
  const model = installed.find((m) => m.id === modelId)
  if (!model) return false

  try {
    unlinkSync(model.filePath)
    return true
  } catch {
    return false
  }
}

// ─── Download from HuggingFace ───────────────────────────────

export interface DownloadProgress {
  modelId: string
  status: "downloading" | "complete" | "error"
  downloadedMB: number
  totalMB: number
  percent: number
  error?: string
}

// Active downloads tracked for SSE progress
const activeDownloads = new Map<string, AbortController>()

export function isDownloading(modelId: string): boolean {
  return activeDownloads.has(modelId)
}

export function cancelDownload(modelId: string): void {
  const controller = activeDownloads.get(modelId)
  if (controller) {
    controller.abort()
    activeDownloads.delete(modelId)
  }
}

/**
 * Download a model from HuggingFace. Returns an async generator of progress events.
 */
export async function* downloadModel(
  modelDef: LocalModelDef,
): AsyncGenerator<DownloadProgress> {
  if (activeDownloads.has(modelDef.id)) {
    yield {
      modelId: modelDef.id,
      status: "error",
      downloadedMB: 0,
      totalMB: modelDef.fileSizeMB,
      percent: 0,
      error: "Download already in progress",
    }
    return
  }

  ensureModelsDir()
  const destPath = join(MODELS_DIR, modelDef.hfFile)

  const controller = new AbortController()
  activeDownloads.set(modelDef.id, controller)

  const url = `https://huggingface.co/${modelDef.hfRepo}/resolve/main/${modelDef.hfFile}`

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const totalBytes = parseInt(response.headers.get("content-length") || "0")
    const totalMB = totalBytes ? Math.round(totalBytes / (1024 * 1024)) : modelDef.fileSizeMB

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const file = Bun.file(destPath)
    const writer = file.writer()
    let downloadedBytes = 0
    let lastYield = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      writer.write(value)
      downloadedBytes += value.byteLength

      // Yield progress every ~2MB to avoid flooding
      const downloadedMB = Math.round(downloadedBytes / (1024 * 1024))
      if (downloadedMB - lastYield >= 2 || done) {
        lastYield = downloadedMB
        yield {
          modelId: modelDef.id,
          status: "downloading",
          downloadedMB,
          totalMB,
          percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
        }
      }
    }

    await writer.end()

    yield {
      modelId: modelDef.id,
      status: "complete",
      downloadedMB: totalMB,
      totalMB,
      percent: 100,
    }
  } catch (err) {
    // Clean up partial file
    try { unlinkSync(destPath) } catch {}

    const msg = (err as Error).name === "AbortError"
      ? "Download cancelled"
      : (err as Error).message || "Unknown error"

    yield {
      modelId: modelDef.id,
      status: "error",
      downloadedMB: 0,
      totalMB: modelDef.fileSizeMB,
      percent: 0,
      error: msg,
    }
  } finally {
    activeDownloads.delete(modelDef.id)
  }
}
