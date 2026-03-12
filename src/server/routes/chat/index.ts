import { Hono } from "hono"
import { streamText, generateText, stepCountIs } from "ai"
import { terminalManager } from "../../../terminal/manager"
import { allTools, readOnlyTools } from "../../../ai/tool"
import { createRegistry } from "./registry"
import type { ReasoningMode, AgentId } from "./systemPrompt"
import { getReasoningOptions } from "./reasoning"
import type { ThinkingEffort } from "./reasoning"
import { extractErrorMessage, extractStatusCode } from "./errors"
import {
  calculateBudget,
  buildAdaptivePrompt,
  buildContextBreakdown,
  estimateMessagesTokens,
  shouldPrune,
  shouldCompact,
  pruneMessages,
  buildCompactionRequest,
  applyCompaction,
} from "../../../ai/context"
import { resolveContextWindow, preWarmModel } from "./contextResolver"
import { normalizeMessages, getPromptCacheOptions, supportsPromptCaching, getDefaultSampling, withProviderTransforms, sanitizeSchema } from "./providerTransforms"
import { invalidTool, buildRepairCallback, createDoomLoopTracker } from "./toolResilience"
import { getMCPTools } from "../../../ai/mcp/client"

export const chatRoutes = new Hono()

// ── Context info endpoint ─────────────────────────────────────

chatRoutes.post("/context", async (c) => {
  const body = await c.req.json()
  const {
    messages = [],
    providerId,
    modelId,
    containerIds,
    activeTerminalId,
    mode = "build",
    agent = "build",
  } = body as {
    messages: Array<{ role: string; content: string }>
    providerId: string
    modelId: string
    containerIds?: string[]
    activeTerminalId?: string
    mode?: ReasoningMode
    agent?: AgentId
  }

  const contextWindow = resolveContextWindow(providerId, modelId)
  const budget = calculateBudget(contextWindow)

  let terminalContext = ""
  if (activeTerminalId) {
    try {
      terminalContext = terminalManager.getOutput(activeTerminalId)
      const lines = terminalContext.split("\n")
      const maxLines = budget.promptTier === "minimal" ? 30 : budget.promptTier === "medium" ? 60 : 100
      if (lines.length > maxLines) {
        terminalContext = lines.slice(-maxLines).join("\n")
      }
    } catch {}
  }
  const activeTerminals = terminalManager.listTerminals()

  const systemPrompt = buildAdaptivePrompt({
    containerIds: containerIds || [],
    terminalContext,
    activeTerminals,
    mode,
    agent,
    tier: budget.promptTier,
  })

  const tools = agent === "report" || mode === "plan" ? readOnlyTools : allTools
  const toolCount = Math.min(Object.keys(tools).length, budget.maxTools)
  const breakdown = buildContextBreakdown(systemPrompt, toolCount, messages, budget.inputBudget)

  return c.json({
    ...breakdown,
    contextWindow,
    outputReserve: budget.outputReserve,
    promptTier: budget.promptTier,
    maxTools: budget.maxTools,
    pruneNeeded: shouldPrune(breakdown.total, budget),
  })
})

// ── Compaction endpoint ───────────────────────────────────────
// The frontend calls this when context is near-full. It generates
// an LLM summary and returns compacted messages.

chatRoutes.post("/compact", async (c) => {
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
      maxRetries: 1,
    })

    const summary = await result.text
    const compacted = applyCompaction(messages, summary)

    return c.json({ compacted, summary })
  } catch (err) {
    const msg = extractErrorMessage(err)
    return c.json({ error: `Compaction failed: ${msg}` }, 500)
  }
})

// ── Title generation endpoint ─────────────────────────────────
// Generates a short, descriptive title for a chat session.
// Called by the frontend after the first assistant response.

chatRoutes.post("/title", async (c) => {
  const body = await c.req.json()
  const { messages, providerId, modelId, apiKey, baseUrl } = body as {
    messages: Array<{ role: string; content: string }>
    providerId: string
    modelId: string
    apiKey: string
    baseUrl?: string
  }

  if (!messages || messages.length < 2) {
    return c.json({ error: "Need at least 2 messages" }, 400)
  }

  try {
    const registry = await createRegistry(providerId, apiKey, modelId, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    const result = await generateText({
      model,
      system: `Generate a short title (max 50 characters) for this conversation.
Rules:
- Single line, no quotes, no punctuation at the end
- Same language as the user's message
- Describe the topic/intent, not the tools used
- No meta descriptions like "Chat about..." or "Discussion of..."
- Be specific and concise`,
      messages: [
        {
          role: "user" as const,
          content: messages.map((m) => `[${m.role}]: ${m.content.slice(0, 300)}`).join("\n"),
        },
      ],
      maxRetries: 1,
    })

    let title = result.text
      .replace(/<think>[\s\S]*?<\/think>\s*/g, "") // Strip reasoning tags
      .split("\n")[0] // First line only
      .replace(/^["']|["']$/g, "") // Strip wrapping quotes
      .trim()

    if (title.length > 60) title = title.slice(0, 57) + "..."
    if (!title) title = "New chat"

    return c.json({ title })
  } catch (err) {
    const msg = extractErrorMessage(err)
    return c.json({ error: msg }, 500)
  }
})

// ── Chat endpoint ─────────────────────────────────────────────

chatRoutes.post("/chat", async (c) => {
  const body = await c.req.json()
  const {
    messages,
    providerId,
    modelId,
    apiKey,
    containerIds,
    activeTerminalId,
    baseUrl,
    mode = "build",
    agent = "build",
    thinkingEffort = "off",
    images = [],
  } = body as {
    messages: any[]
    providerId: string
    modelId: string
    apiKey: string
    containerIds?: string[]
    activeTerminalId?: string
    baseUrl?: string
    mode?: ReasoningMode
    agent?: AgentId
    thinkingEffort?: ThinkingEffort
    images?: Array<{ mime: string; dataUrl: string }>
  }

  if (!messages || !providerId || !modelId) {
    return c.json({ error: "Missing required fields" }, 400)
  }
  if (messages.length > 500) {
    return c.json({ error: "Message history too large (max 500)" }, 413)
  }
  if (images.length > 20) {
    return c.json({ error: "Too many images (max 20)" }, 413)
  }
  if (providerId !== "local" && providerId !== "custom" && !apiKey) {
    return c.json({ error: "Missing API key" }, 400)
  }

  // ── Pre-warm models.dev cache ─────────────────────────────
  await preWarmModel(providerId, modelId)

  // ── Context budget ────────────────────────────────────────
  const contextWindow = resolveContextWindow(providerId, modelId)
  const budget = calculateBudget(contextWindow)

  // ── Terminal context ──────────────────────────────────────
  let terminalContext = ""
  if (activeTerminalId) {
    try {
      terminalContext = terminalManager.getOutput(activeTerminalId)
      const maxLines = budget.promptTier === "minimal" ? 30 : budget.promptTier === "medium" ? 60 : 100
      const lines = terminalContext.split("\n")
      if (lines.length > maxLines) {
        terminalContext = lines.slice(-maxLines).join("\n")
      }
    } catch {}
  }

  const activeTerminals = terminalManager.listTerminals()

  // ── Adaptive system prompt ────────────────────────────────
  const systemPrompt = buildAdaptivePrompt({
    containerIds: containerIds || [],
    terminalContext,
    activeTerminals,
    mode,
    agent,
    tier: budget.promptTier,
  })

  // ── Tool selection ────────────────────────────────────────
  const baseTools = agent === "report" || mode === "plan" ? readOnlyTools : allTools

  let tools: Record<string, any> = baseTools
  if (budget.maxTools < Object.keys(baseTools).length) {
    const ESSENTIAL_TOOLS = [
      "terminal_read", "terminal_write", "terminal_list", "terminal_create",
      "file_read", "search_grep",
      "user_question",
    ]
    const SECONDARY_TOOLS = [
      "file_write", "file_edit", "search_find",
      "web_search", "web_fetch",
      "batch",
    ]
    const TERTIARY_TOOLS = [
      "file_create_dir", "file_delete",
      "todo_read", "todo_write",
      "caido_read", "caido_scope",
    ]

    const prioritized = [...ESSENTIAL_TOOLS, ...SECONDARY_TOOLS, ...TERTIARY_TOOLS]
    const limited: Record<string, any> = {}
    let count = 0
    for (const name of prioritized) {
      if (count >= budget.maxTools) break
      if (baseTools[name]) {
        limited[name] = baseTools[name]
        count++
      }
    }
    tools = limited
  }

  // Merge MCP tools from connected servers
  const mcpTools = getMCPTools()
  tools = { ...tools, ...mcpTools }

  // Add InvalidTool for repair fallback (hidden from model via activeTools)
  tools = { ...tools, invalid: invalidTool }

  // ── Message pruning ───────────────────────────────────────
  // Note: message normalization (empty content, tool IDs, etc.) is now handled
  // by the wrapLanguageModel middleware — applied at the AI SDK level like OpenCode.
  let processedMessages = [...messages]

  // ── Inject images into last user message ─────────────────
  if (images.length > 0) {
    for (let i = processedMessages.length - 1; i >= 0; i--) {
      if (processedMessages[i].role === "user") {
        const msg = processedMessages[i]
        const textContent = typeof msg.content === "string" ? msg.content : ""
        const parts: any[] = []
        for (const img of images) {
          const match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            parts.push({ type: "image", image: match[2], mimeType: match[1] })
          }
        }
        parts.push({ type: "text", text: textContent })
        processedMessages[i] = { ...msg, content: parts }
        break
      }
    }
  }

  const currentTokens = estimateMessagesTokens(processedMessages)
  if (shouldPrune(currentTokens, budget)) {
    const { messages: pruned } = pruneMessages(processedMessages)
    processedMessages = pruned
    console.log(`[Context] Pruned messages: ${currentTokens} → ${estimateMessagesTokens(pruned)} tokens`)
  }

  try {
    const registry = await createRegistry(providerId, apiKey, modelId, baseUrl)
    const rawModel = registry.languageModel(`${providerId}:${modelId}`)
    // Wrap with provider-specific middleware (message normalization, unsupported parts)
    // Applied at the AI SDK level before HTTP call — like OpenCode's wrapLanguageModel
    const model = withProviderTransforms(rawModel, providerId, modelId)

    // ── Sampling defaults per provider ────────────────────
    const sampling = getDefaultSampling(providerId, modelId)

    // ── Prompt caching ────────────────────────────────────
    const providerOptions: Record<string, any> = {
      ...getReasoningOptions(providerId, mode, thinkingEffort),
    }

    // Merge prompt cache hints into providerOptions
    if (supportsPromptCaching(providerId)) {
      const cacheOpts = getPromptCacheOptions(providerId)
      for (const [key, value] of Object.entries(cacheOpts)) {
        providerOptions[key] = { ...providerOptions[key], ...value }
      }
    }

    // ── Build repair callback ─────────────────────────────
    const repairCallback = buildRepairCallback(tools)

    // ── Doom loop tracker ─────────────────────────────────
    const doomTracker = createDoomLoopTracker()

    let capturedError: unknown = null

    // Abort signal: cancels streamText when client disconnects
    const abortController = new AbortController()
    const clientSignal = c.req.raw.signal
    if (clientSignal) {
      clientSignal.addEventListener("abort", () => abortController.abort(), { once: true })
    }

    let result
    try {
      result = streamText({
        model,
        system: systemPrompt,
        messages: processedMessages,
        tools,
        // Hide InvalidTool from model's active tools
        activeTools: Object.keys(tools).filter((t) => t !== "invalid"),
        stopWhen: stepCountIs(30),
        providerOptions,
        abortSignal: abortController.signal,
        // Sampling defaults (provider-specific)
        ...(sampling.temperature !== undefined && { temperature: sampling.temperature }),
        ...(sampling.topP !== undefined && { topP: sampling.topP }),
        ...(sampling.topK !== undefined && { topK: sampling.topK }),
        // Tool call repair for malformed calls
        experimental_repairToolCall: repairCallback,
        onError({ error }) {
          capturedError = error
        },
      })
    } catch (err) {
      const msg = extractErrorMessage(err)
      const status = (err as any)?.statusCode || 500
      return c.json({ error: msg }, status)
    }

    // ── SSE helper ──────────────────────────────────────────
    function sse(event: string, data: any): string {
      return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    }

    const MAX_TOOL_OUTPUT = 3000

    function truncateOutput(output: string): string {
      if (output.length <= MAX_TOOL_OUTPUT) return output
      return output.slice(0, MAX_TOOL_OUTPUT) + `\n\n[... truncated ${output.length - MAX_TOOL_OUTPUT} chars]`
    }

    // ── Stream processing ─────────────────────────────────
    let fullStream
    let iterator
    try {
      fullStream = result.fullStream
      iterator = fullStream[Symbol.asyncIterator]()
    } catch (err) {
      const msg = extractErrorMessage(err)
      const status = (err as any)?.statusCode || 500
      return c.json({ error: msg }, status)
    }

    console.log(`[Context] ${budget.promptTier} tier | ${Object.keys(tools).length - 1} tools | ~${estimateMessagesTokens(processedMessages)} msg tokens | ${contextWindow} ctx window`)

    // Buffer initial events to detect early errors before committing to SSE stream
    const bufferedEvents: string[] = []
    let hasContent = false
    let earlyError: string | null = null
    let streamDone = false
    let doomLoopAborted = false

    try {
      const textPromise = result.text.then(
        () => null,
        (err: unknown) => err,
      )

      while (!hasContent && !earlyError && !streamDone) {
        const iterResult = await Promise.race([
          iterator.next(),
          textPromise.then((err) => {
            if (err) throw err
            return { done: true as const, value: undefined }
          }),
        ])

        if (iterResult.done) {
          streamDone = true
          break
        }
        const part = iterResult.value
        if (!part) continue

        if (part.type !== "text-delta" && part.type !== "start") {
          console.log(`[Stream] part type: ${part.type}`, part.type === "tool-call" ? `tool: ${(part as any).toolName}` : "")
        }

        switch (part.type) {
          case "text-delta":
            bufferedEvents.push(sse("text-delta", { text: part.text }))
            if (part.text.length > 0 && !hasContent) {
              hasContent = true
            }
            doomTracker.resetOnText()
            break
          case "reasoning-delta":
            hasContent = true
            bufferedEvents.push(sse("reasoning", {
              text: (part as any).text || "",
            }))
            break
          case "tool-call":
            hasContent = true
            bufferedEvents.push(sse("tool-call", {
              id: (part as any).toolCallId,
              tool: (part as any).toolName,
              args: (part as any).args,
            }))
            // Doom loop detection
            if (doomTracker.check((part as any).toolName, (part as any).args)) {
              const loopTool = doomTracker.getLoopTool()
              console.warn(`[Doom Loop] Detected: "${loopTool}" called ${3}x with identical args — aborting`)
              earlyError = `Stopped: tool "${loopTool}" was called repeatedly with identical arguments. This usually means the approach isn't working — try a different strategy.`
              doomLoopAborted = true
            }
            break
          case "tool-result":
            bufferedEvents.push(sse("tool-result", {
              id: (part as any).toolCallId,
              output: truncateOutput(String((part as any).result ?? "")),
              isError: false,
            }))
            break
          case "error":
            earlyError = extractErrorMessage(part.error)
            break
        }
      }
    } catch (err) {
      earlyError = extractErrorMessage(err)
    }

    // Error before any content → proper HTTP error response
    if (earlyError && !hasContent) {
      if (doomLoopAborted) {
        return new Response(`⚠️ ${earlyError}`, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
      const status = extractStatusCode(capturedError, earlyError)
      return c.json({ error: earlyError }, status)
    }

    // Empty stream — try to extract error from result promises
    if (streamDone && !hasContent && !earlyError) {
      try {
        await result.text
      } catch (err) {
        const msg = extractErrorMessage(err)
        const status = (err as any)?.statusCode || 500
        return c.json({ error: msg }, status)
      }
      if (capturedError) {
        const msg = extractErrorMessage(capturedError)
        const status = (capturedError as any)?.statusCode || 500
        return c.json({ error: msg }, status)
      }
      return c.json({ error: "Model returned an empty response" }, 502)
    }

    // ── SSE stream response ─────────────────────────────────
    const toolCount = Object.keys(tools).length - 1 // exclude InvalidTool
    const breakdown = buildContextBreakdown(
      systemPrompt,
      toolCount,
      processedMessages,
      budget.inputBudget,
    )

    const postTokens = estimateMessagesTokens(processedMessages)
    const needsCompaction = shouldCompact(postTokens, budget)

    // Track running tool call IDs for abort cleanup
    const runningToolCalls = new Set<string>()

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      cancel() {
        // Client disconnected — abort the AI stream so tool calls stop
        abortController.abort()
        // Note: running tool calls will be marked as interrupted on the frontend
        // via the handleStop() cleanup (ChatPanel.tsx)
        console.log(`[Chat] Client disconnected, aborting stream (${runningToolCalls.size} tool calls interrupted)`)
      },
      async start(controller) {
        // Emit buffered events
        for (const evt of bufferedEvents) {
          controller.enqueue(encoder.encode(evt))
        }
        if (earlyError) {
          controller.enqueue(encoder.encode(sse("error", { message: earlyError })))
          controller.enqueue(encoder.encode(sse("done", {})))
          controller.close()
          return
        }
        if (streamDone) {
          controller.enqueue(encoder.encode(sse("done", {})))
          controller.close()
          return
        }
        try {
          for (;;) {
            const { done, value: part } = await iterator.next()
            if (done) break
            switch (part.type) {
              case "text-delta":
                controller.enqueue(encoder.encode(sse("text-delta", { text: part.text })))
                doomTracker.resetOnText()
                break
              case "reasoning-delta":
                controller.enqueue(encoder.encode(sse("reasoning", {
                  text: (part as any).text || "",
                })))
                break
              case "tool-call": {
                const toolCallId = (part as any).toolCallId
                runningToolCalls.add(toolCallId)
                controller.enqueue(encoder.encode(sse("tool-call", {
                  id: toolCallId,
                  tool: (part as any).toolName,
                  args: (part as any).args,
                })))
                // Doom loop detection
                if (doomTracker.check((part as any).toolName, (part as any).args)) {
                  const loopTool = doomTracker.getLoopTool()
                  console.warn(`[Doom Loop] Detected mid-stream: "${loopTool}" — aborting`)
                  controller.enqueue(encoder.encode(sse("error", {
                    message: `Stopped: tool "${loopTool}" was called repeatedly with identical arguments. Try a different approach.`,
                  })))
                  controller.enqueue(encoder.encode(sse("done", {})))
                  controller.close()
                  return
                }
                break
              }
              case "tool-result": {
                const resultId = (part as any).toolCallId
                runningToolCalls.delete(resultId)
                controller.enqueue(encoder.encode(sse("tool-result", {
                  id: resultId,
                  output: truncateOutput(String((part as any).result ?? "")),
                  isError: false,
                })))
                break
              }
              case "error":
                controller.enqueue(encoder.encode(sse("error", {
                  message: extractErrorMessage(part.error),
                })))
                break
            }
          }
        } catch (err) {
          // If aborted, emit abort events for any running tool calls
          if (abortController.signal.aborted && runningToolCalls.size > 0) {
            for (const id of runningToolCalls) {
              controller.enqueue(encoder.encode(sse("tool-result", {
                id,
                output: "[Interrupted by user]",
                isError: true,
              })))
            }
            runningToolCalls.clear()
          } else {
            controller.enqueue(encoder.encode(sse("error", {
              message: extractErrorMessage(err),
            })))
          }
        }
        controller.enqueue(encoder.encode(sse("done", {})))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Context-Info": JSON.stringify({
          total: breakdown.total,
          limit: breakdown.limit,
          free: breakdown.free,
          percentUsed: breakdown.percentUsed,
          promptTier: budget.promptTier,
          toolCount,
          pruned: processedMessages !== messages,
          needsCompaction,
        }),
      },
    })
  } catch (err) {
    const msg = extractErrorMessage(err)
    const status = (err as any)?.statusCode || 500
    return c.json({ error: msg }, status)
  }
})
