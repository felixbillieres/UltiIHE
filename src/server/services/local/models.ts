/**
 * Local model catalog and download management.
 * Models are stored in ~/.ultiIHE/models/ as GGUF files.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs"
import { join } from "path"
import { homedir } from "os"

// ─── Paths ───────────────────────────────────────────────────

const BASE_DIR = join(homedir(), ".ultiIHE")
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

// ─── Model Catalog ───────────────────────────────────────────

export interface LocalModelDef {
  id: string
  name: string
  description: string
  parameterSize: string // "1B", "3B", "7B", "8B", "13B", "14B", "70B"
  quantization: string  // "Q4_K_M", "Q5_K_M", "Q8_0"
  fileSizeMB: number
  vramRequiredMB: number
  contextWindow: number
  toolCalling: boolean
  reasoning: boolean
  hfRepo: string      // HuggingFace repo
  hfFile: string      // Filename in the repo
  tags: string[]      // "fast", "coding", "general", "reasoning"
}

/**
 * Curated catalog of popular open-source GGUF models.
 * Includes general, coding, reasoning, and uncensored variants.
 */
export const LOCAL_MODEL_CATALOG: LocalModelDef[] = [
  // ═══════════════════════════════════════════════════════════
  // Small (1-3B) — works on any machine, 2-4 GB VRAM
  // ═══════════════════════════════════════════════════════════
  {
    id: "qwen2.5-1.5b",
    name: "Qwen 2.5 1.5B Instruct",
    description: "Ultra-lightweight, fast responses. Good for simple tasks and autocomplete.",
    parameterSize: "1.5B",
    quantization: "Q4_K_M",
    fileSizeMB: 1100,
    vramRequiredMB: 1400,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    hfFile: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    tags: ["fast", "general"],
  },
  {
    id: "gemma2-2b",
    name: "Gemma 2 2B Instruct",
    description: "Google's compact model. Excellent quality for its size.",
    parameterSize: "2B",
    quantization: "Q4_K_M",
    fileSizeMB: 1600,
    vramRequiredMB: 2000,
    contextWindow: 8_192,
    toolCalling: false,
    reasoning: false,
    hfRepo: "bartowski/gemma-2-2b-it-GGUF",
    hfFile: "gemma-2-2b-it-Q4_K_M.gguf",
    tags: ["fast", "general"],
  },
  {
    id: "llama3.2-3b",
    name: "Llama 3.2 3B Instruct",
    description: "Good balance of speed and quality. 128k context window.",
    parameterSize: "3B",
    quantization: "Q4_K_M",
    fileSizeMB: 2000,
    vramRequiredMB: 2500,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    hfFile: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    tags: ["fast", "general"],
  },
  {
    id: "phi-3.5-mini",
    name: "Phi 3.5 Mini 3.8B Instruct",
    description: "Microsoft's efficient small model. Strong reasoning for its size.",
    parameterSize: "3.8B",
    quantization: "Q4_K_M",
    fileSizeMB: 2300,
    vramRequiredMB: 3000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Phi-3.5-mini-instruct-GGUF",
    hfFile: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    tags: ["fast", "general", "coding"],
  },

  // ═══════════════════════════════════════════════════════════
  // Medium (7-9B) — needs 6-8 GB VRAM
  // ═══════════════════════════════════════════════════════════
  {
    id: "llama3.1-8b",
    name: "Llama 3.1 8B Instruct",
    description: "Meta's workhorse model. Great tool calling, 128k context.",
    parameterSize: "8B",
    quantization: "Q4_K_M",
    fileSizeMB: 4900,
    vramRequiredMB: 6000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    hfFile: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "qwen2.5-7b",
    name: "Qwen 2.5 7B Instruct",
    description: "Excellent coding and tool use. Strong multilingual support.",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    fileSizeMB: 4700,
    vramRequiredMB: 5800,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    hfFile: "qwen2.5-7b-instruct-q4_k_m.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "mistral-7b-v03",
    name: "Mistral 7B v0.3 Instruct",
    description: "Fast, good at following instructions. Native function calling.",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    fileSizeMB: 4400,
    vramRequiredMB: 5400,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Mistral-7B-Instruct-v0.3-GGUF",
    hfFile: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    tags: ["fast", "general"],
  },
  {
    id: "gemma2-9b",
    name: "Gemma 2 9B Instruct",
    description: "Google's mid-range model. Top-tier quality at 9B parameters.",
    parameterSize: "9B",
    quantization: "Q4_K_M",
    fileSizeMB: 5500,
    vramRequiredMB: 7000,
    contextWindow: 8_192,
    toolCalling: false,
    reasoning: false,
    hfRepo: "bartowski/gemma-2-9b-it-GGUF",
    hfFile: "gemma-2-9b-it-Q4_K_M.gguf",
    tags: ["general"],
  },
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen 2.5 Coder 7B Instruct",
    description: "Specialized for code generation and analysis. Best coding model at 7B.",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    fileSizeMB: 4700,
    vramRequiredMB: 5800,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    hfFile: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    tags: ["coding"],
  },
  {
    id: "deepseek-r1-distill-qwen-7b",
    name: "DeepSeek R1 Distill Qwen 7B",
    description: "Reasoning model distilled from DeepSeek R1. Chain-of-thought built-in.",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    fileSizeMB: 4700,
    vramRequiredMB: 5800,
    contextWindow: 32_768,
    toolCalling: false,
    reasoning: true,
    hfRepo: "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF",
    hfFile: "DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
    tags: ["reasoning"],
  },
  {
    id: "dolphin-2.9.3-llama3.1-8b",
    name: "Dolphin 2.9.3 Llama 3.1 8B",
    description: "Uncensored model based on Llama 3.1. No alignment filters — ideal for pentest.",
    parameterSize: "8B",
    quantization: "Q4_K_M",
    fileSizeMB: 4900,
    vramRequiredMB: 6000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/dolphin-2.9.3-llama-3.1-8B-GGUF",
    hfFile: "dolphin-2.9.3-llama-3.1-8B-Q4_K_M.gguf",
    tags: ["uncensored", "general"],
  },
  {
    id: "nous-hermes2-llama3.1-8b",
    name: "Nous Hermes 2 Llama 3.1 8B",
    description: "Community favorite. Strong function calling and instruction following.",
    parameterSize: "8B",
    quantization: "Q4_K_M",
    fileSizeMB: 4900,
    vramRequiredMB: 6000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "NousResearch/Hermes-3-Llama-3.1-8B-GGUF",
    hfFile: "Hermes-3-Llama-3.1-8B.Q4_K_M.gguf",
    tags: ["general", "coding"],
  },

  // ═══════════════════════════════════════════════════════════
  // Large (13-14B) — needs 10-16 GB VRAM
  // ═══════════════════════════════════════════════════════════
  {
    id: "qwen2.5-14b",
    name: "Qwen 2.5 14B Instruct",
    description: "Significantly smarter than 7B. Excellent for complex analysis.",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    fileSizeMB: 9000,
    vramRequiredMB: 11000,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-14B-Instruct-GGUF",
    hfFile: "qwen2.5-14b-instruct-q4_k_m.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "phi-4-14b",
    name: "Phi 4 14B Instruct",
    description: "Microsoft's latest. Exceptional reasoning and math for its size.",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    fileSizeMB: 8400,
    vramRequiredMB: 10500,
    contextWindow: 16_384,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/phi-4-GGUF",
    hfFile: "phi-4-Q4_K_M.gguf",
    tags: ["general", "reasoning", "coding"],
  },
  {
    id: "qwen2.5-coder-14b",
    name: "Qwen 2.5 Coder 14B Instruct",
    description: "Best open-source coding model at 14B. Rivals GPT-4 on code tasks.",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    fileSizeMB: 9000,
    vramRequiredMB: 11000,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF",
    hfFile: "qwen2.5-coder-14b-instruct-q4_k_m.gguf",
    tags: ["coding"],
  },
  {
    id: "deepseek-r1-distill-qwen-14b",
    name: "DeepSeek R1 Distill Qwen 14B",
    description: "Reasoning powerhouse. Chain-of-thought for complex pentest planning.",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    fileSizeMB: 9000,
    vramRequiredMB: 11000,
    contextWindow: 32_768,
    toolCalling: false,
    reasoning: true,
    hfRepo: "bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF",
    hfFile: "DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf",
    tags: ["reasoning"],
  },

  // ═══════════════════════════════════════════════════════════
  // XL (27-32B) — needs 16-24 GB VRAM
  // ═══════════════════════════════════════════════════════════
  {
    id: "gemma2-27b",
    name: "Gemma 2 27B Instruct",
    description: "Google's largest open model. Near-frontier quality.",
    parameterSize: "27B",
    quantization: "Q4_K_M",
    fileSizeMB: 16300,
    vramRequiredMB: 19000,
    contextWindow: 8_192,
    toolCalling: false,
    reasoning: false,
    hfRepo: "bartowski/gemma-2-27b-it-GGUF",
    hfFile: "gemma-2-27b-it-Q4_K_M.gguf",
    tags: ["general"],
  },
  {
    id: "qwen2.5-32b",
    name: "Qwen 2.5 32B Instruct",
    description: "Strong all-rounder. Great for complex tasks with tool calling.",
    parameterSize: "32B",
    quantization: "Q4_K_M",
    fileSizeMB: 19900,
    vramRequiredMB: 22000,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-32B-Instruct-GGUF",
    hfFile: "qwen2.5-32b-instruct-q4_k_m.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "qwen2.5-coder-32b",
    name: "Qwen 2.5 Coder 32B Instruct",
    description: "Best open-source coding model period. Rivals Claude on code.",
    parameterSize: "32B",
    quantization: "Q4_K_M",
    fileSizeMB: 19900,
    vramRequiredMB: 22000,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-Coder-32B-Instruct-GGUF",
    hfFile: "qwen2.5-coder-32b-instruct-q4_k_m.gguf",
    tags: ["coding"],
  },
  {
    id: "deepseek-r1-distill-qwen-32b",
    name: "DeepSeek R1 Distill Qwen 32B",
    description: "Best reasoning model under 70B. Excellent for exploit analysis.",
    parameterSize: "32B",
    quantization: "Q4_K_M",
    fileSizeMB: 19900,
    vramRequiredMB: 22000,
    contextWindow: 32_768,
    toolCalling: false,
    reasoning: true,
    hfRepo: "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF",
    hfFile: "DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf",
    tags: ["reasoning"],
  },

  // ═══════════════════════════════════════════════════════════
  // XXL (47-70B+) — needs 24-48 GB VRAM
  // ═══════════════════════════════════════════════════════════
  {
    id: "mixtral-8x7b",
    name: "Mixtral 8x7B Instruct v0.1",
    description: "Mixture-of-Experts — 47B total but only 13B active. Fast for its quality.",
    parameterSize: "47B",
    quantization: "Q4_K_M",
    fileSizeMB: 26400,
    vramRequiredMB: 30000,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF",
    hfFile: "mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf",
    tags: ["general", "fast"],
  },
  {
    id: "llama3.3-70b",
    name: "Llama 3.3 70B Instruct",
    description: "Near-frontier quality. Needs 40+ GB VRAM or CPU offloading.",
    parameterSize: "70B",
    quantization: "Q4_K_M",
    fileSizeMB: 42000,
    vramRequiredMB: 44000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Llama-3.3-70B-Instruct-GGUF",
    hfFile: "Llama-3.3-70B-Instruct-Q4_K_M.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 Distill Llama 70B",
    description: "Most powerful local reasoning model. For serious exploit chain analysis.",
    parameterSize: "70B",
    quantization: "Q4_K_M",
    fileSizeMB: 42000,
    vramRequiredMB: 44000,
    contextWindow: 128_000,
    toolCalling: false,
    reasoning: true,
    hfRepo: "bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF",
    hfFile: "DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf",
    tags: ["reasoning"],
  },
  {
    id: "qwen2.5-72b",
    name: "Qwen 2.5 72B Instruct",
    description: "Top-tier open model. Excellent tool calling and multilingual.",
    parameterSize: "72B",
    quantization: "Q4_K_M",
    fileSizeMB: 43000,
    vramRequiredMB: 46000,
    contextWindow: 32_768,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-72B-Instruct-GGUF",
    hfFile: "qwen2.5-72b-instruct-q4_k_m.gguf",
    tags: ["general", "coding"],
  },
]

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
