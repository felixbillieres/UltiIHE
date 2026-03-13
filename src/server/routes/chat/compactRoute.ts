import { Hono } from "hono"
import { streamText } from "ai"
import { createRegistry } from "./registry"
import { extractErrorMessage } from "./errors"
import { buildCompactionRequest, applyCompaction } from "../../../ai/context"

export const compactRoute = new Hono()

// The frontend calls this when context is near-full. It generates
// an LLM summary and returns compacted messages.

compactRoute.post("/compact", async (c) => {
  const body = await c.req.json()
  const { messages, providerId, modelId, apiKey, baseUrl } = body as {
    messages: Array<{ role: string; content: string }>
    providerId: string
    modelId: string
    apiKey: string
    baseUrl?: string
  }

  if (!messages || messages.length < 5) {
    return c.json({ error: "Not enough messages to compact" }, 400)
  }

  try {
    const registry = await createRegistry(providerId, apiKey, modelId, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    const { system, messages: compactionMessages } = buildCompactionRequest(messages)
    const result = streamText({
      model,
      system,
      messages: compactionMessages as any,
      maxRetries: 0,
    })

    const summary = await result.text
    const compacted = applyCompaction(messages, summary)

    return c.json({ compacted, summary })
  } catch (err) {
    const msg = extractErrorMessage(err)
    return c.json({ error: `Compaction failed: ${msg}` }, 500)
  }
})
