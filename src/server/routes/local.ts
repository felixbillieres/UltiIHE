/**
 * API routes for local AI management.
 * Hardware detection, model download, llama-server lifecycle.
 */

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { detectHardware, assessModelFit } from "../services/local/hardware"
import { getBinaryStatus, downloadBinary } from "../services/local/binary"
import {
  LOCAL_MODEL_CATALOG,
  listInstalledModels,
  deleteModel,
  downloadModel,
  isDownloading,
  cancelDownload,
} from "../services/local/models"
import { startServer, stopServer, getServerStatus } from "../services/local/server"

export const localRoutes = new Hono()

// ─── Hardware ────────────────────────────────────────────────

localRoutes.get("/local/hardware", (c) => {
  const hardware = detectHardware()
  return c.json(hardware)
})

// ─── Binary (llama-server) ──────────────────────────────────

localRoutes.get("/local/binary", (c) => {
  return c.json(getBinaryStatus())
})

localRoutes.post("/local/binary/install", async (c) => {
  const hardware = detectHardware()
  console.log(`[Local AI] Installing binary for ${hardware.platform}/${hardware.arch}, backend: ${hardware.recommendedBackend}`)

  return streamSSE(c, async (stream) => {
    for await (const progress of downloadBinary(hardware.recommendedBackend)) {
      console.log(`[Local AI] Binary install: ${progress.status} ${progress.percent}%${progress.error ? ` — ${progress.error}` : ""}`)
      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify(progress),
      })
    }
  })
})

// ─── Models ──────────────────────────────────────────────────

localRoutes.get("/local/models", (c) => {
  const hardware = detectHardware()
  const installed = listInstalledModels()
  const installedIds = new Set(installed.map((m) => m.id))

  const catalog = LOCAL_MODEL_CATALOG.map((model) => ({
    ...model,
    installed: installedIds.has(model.id),
    downloading: isDownloading(model.id),
    fit: assessModelFit(model.fileSizeMB, hardware),
  }))

  return c.json({ catalog, installed })
})

localRoutes.post("/local/models/download", async (c) => {
  const { modelId } = await c.req.json() as { modelId: string }
  const modelDef = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId)
  if (!modelDef) {
    return c.json({ error: "Model not found in catalog" }, 404)
  }

  return streamSSE(c, async (stream) => {
    for await (const progress of downloadModel(modelDef)) {
      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify(progress),
      })
    }
  })
})

localRoutes.post("/local/models/cancel", async (c) => {
  const { modelId } = await c.req.json() as { modelId: string }
  cancelDownload(modelId)
  return c.json({ ok: true })
})

localRoutes.delete("/local/models/:id", (c) => {
  const id = c.req.param("id")
  const success = deleteModel(id)
  if (!success) {
    return c.json({ error: "Model not found or delete failed" }, 404)
  }
  return c.json({ ok: true })
})

// ─── Server (llama-server process) ──────────────────────────

localRoutes.get("/local/server/status", (c) => {
  return c.json(getServerStatus())
})

localRoutes.post("/local/server/start", async (c) => {
  const { modelId, contextSize, gpuLayers } = await c.req.json() as {
    modelId: string
    contextSize?: number
    gpuLayers?: number
  }

  // Find installed model
  const installed = listInstalledModels()
  const model = installed.find((m) => m.id === modelId)
  if (!model) {
    return c.json({ error: "Model not installed" }, 404)
  }

  try {
    const result = await startServer({
      modelId,
      modelPath: model.filePath,
      contextSize,
      gpuLayers,
    })
    return c.json(result)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

localRoutes.post("/local/server/stop", async (c) => {
  await stopServer()
  return c.json({ ok: true })
})
