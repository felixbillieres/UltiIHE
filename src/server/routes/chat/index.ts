import { Hono } from "hono"
import { streamText, stepCountIs } from "ai"
import { z } from "zod"
import { terminalManager } from "../../../terminal/manager"
import { allTools, readOnlyTools } from "../../../ai/tool"
import { createRegistry } from "./registry"
import type { ReasoningMode } from "./systemPrompt"
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
} from "../../../ai/context"
import { resolveContextWindow, resolveMaxOutput, preWarmModel } from "./contextResolver"
import { getPromptCacheOptions, supportsPromptCaching, getDefaultSampling, withProviderTransforms, applyCacheHints } from "./providerTransforms"
import { invalidTool, buildRepairCallback, createDoomLoopTracker } from "./toolResilience"
import { getMCPTools } from "../../../ai/mcp/client"

// ── Zod schema for chat request validation ────────────────────
const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  providerId: z.string(),
  modelId: z.string(),
  apiKey: z.string().optional().default(""),
  containerIds: z.array(z.string()).optional().default([]),
  activeTerminalId: z.string().optional(),
  baseUrl: z.string().optional(),
  mode: z.enum(["build", "plan", "deep"]).optional().default("build"),
  agentMode: z.enum(["ctf", "audit", "neutral"]).optional().default("neutral"),
  thinkingEffort: z.enum(["off", "low", "medium", "high"]).optional().default("off"),
  images: z.array(z.object({
    mime: z.string(),
    dataUrl: z.string(),
  })).optional().default([]),
})

// ── Stream part interfaces for type-safe access ───────────────
interface StreamToolCallPart {
  type: "tool-call"
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

interface StreamToolResultPart {
  type: "tool-result"
  toolCallId: string
  result: unknown
}

interface StreamReasoningDeltaPart {
  type: "reasoning-delta"
  text: string
}

// Sub-routes
import { contextRoute } from "./contextRoute"
import { compactRoute } from "./compactRoute"
import { titleRoute } from "./titleRoute"

export const chatRoutes = new Hono()

// Mount sub-routes
chatRoutes.route("/", contextRoute)
chatRoutes.route("/", compactRoute)
chatRoutes.route("/", titleRoute)

// ── Chat endpoint ─────────────────────────────────────────────

chatRoutes.post("/chat", async (c) => {
  const body = await c.req.json()
  const parsed = ChatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid request: " + parsed.error.issues[0]?.message }, 400)
  }
  const {
    messages,
    providerId,
    modelId,
    apiKey,
    containerIds,
    activeTerminalId,
    baseUrl,
    mode,
    agentMode,
    thinkingEffort,
    images,
  } = parsed.data

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
  const maxOutput = resolveMaxOutput(providerId, modelId)
  const budget = calculateBudget(contextWindow, maxOutput)

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
    containerIds,
    terminalContext,
    activeTerminals,
    mode,
    agentMode,
    tier: budget.promptTier,
  })

  // ── Tool selection ────────────────────────────────────────
  const baseTools = mode === "plan" ? readOnlyTools : allTools

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      "exh_read_creds", "exh_read_hosts", "exh_read_env",
      "exh_add_cred", "exh_add_host",
    ]

    const prioritized = [...ESSENTIAL_TOOLS, ...SECONDARY_TOOLS, ...TERTIARY_TOOLS]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // Messages start as Zod-validated but content may become multipart (image injection)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processedMessages: any[] = [...messages]

  // ── Inject images into last user message ─────────────────
  if (images.length > 0) {
    for (let i = processedMessages.length - 1; i >= 0; i--) {
      if (processedMessages[i].role === "user") {
        const msg = processedMessages[i]
        const textContent = typeof msg.content === "string" ? msg.content : ""
        const parts: Array<{ type: string; image?: string; mimeType?: string; text?: string }> = []
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerOptions: Record<string, any> = {
      ...getReasoningOptions(providerId, mode, thinkingEffort),
    }

    // Merge prompt cache hints into providerOptions (for system prompt)
    if (supportsPromptCaching(providerId)) {
      const cacheOpts = getPromptCacheOptions(providerId)
      for (const [key, value] of Object.entries(cacheOpts)) {
        providerOptions[key] = { ...providerOptions[key], ...value }
      }
      // Also apply cache hints on last 2 conversation messages
      // This makes the conversation prefix cacheable across steps
      applyCacheHints(processedMessages, providerId)
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
        maxOutputTokens: maxOutput,
        // Hide InvalidTool from model's active tools
        activeTools: Object.keys(tools).filter((t) => t !== "invalid"),
        // Adaptive steps based on context budget tier:
        // minimal (≤8K): 5 steps — small models
        // medium (8-32K): 15 steps — balanced
        // full (>32K): 25 steps — pentest workflows need many tool rounds
        //   (nmap → read output → smb enum → read → kerberoast → read → crack → read...)
        stopWhen: stepCountIs(
          budget.promptTier === "minimal" ? 5 : budget.promptTier === "medium" ? 15 : 25,
        ),
        // No automatic retries — errors bubble up immediately to the user.
        // AI SDK defaults to 2 retries (3 total attempts), which silently burns quota.
        maxRetries: 0,
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
      const status = ((err as { statusCode?: number })?.statusCode || 500) as 400 | 500 | 502
      return c.json({ error: msg }, status)
    }

    // ── SSE helper ──────────────────────────────────────────
    function sse(event: string, data: Record<string, unknown>): string {
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
      const status = ((err as { statusCode?: number })?.statusCode || 500) as 400 | 500 | 502
      return c.json({ error: msg }, status)
    }

    console.log(`[Context] ${budget.promptTier} tier | ${Object.keys(tools).length - 1} tools | ~${estimateMessagesTokens(processedMessages)} msg tokens | ${contextWindow} ctx window`)

    // Buffer initial events to detect early errors before committing to SSE stream
    const bufferedEvents: string[] = []
    let hasContent = false
    let earlyError: string | null = null
    let streamDone = false
    let doomLoopAborted = false
    let stepCount = 0
    let toolCallCount = 0

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
          const toolPart = part as unknown as StreamToolCallPart
          console.log(`[Stream] part type: ${part.type}`, part.type === "tool-call" ? `tool: ${toolPart.toolName}` : "")
        }

        switch (part.type) {
          case "text-delta":
            bufferedEvents.push(sse("text-delta", { text: part.text }))
            if (part.text.length > 0 && !hasContent) {
              hasContent = true
            }
            doomTracker.resetOnText()
            break
          case "reasoning-delta": {
            hasContent = true
            const reasoningPart = part as unknown as StreamReasoningDeltaPart
            bufferedEvents.push(sse("reasoning", {
              text: reasoningPart.text || "",
            }))
            break
          }
          case "tool-call": {
            hasContent = true
            toolCallCount++
            const tcPart = part as unknown as StreamToolCallPart
            bufferedEvents.push(sse("tool-call", {
              id: tcPart.toolCallId,
              tool: tcPart.toolName,
              args: tcPart.args,
            }))
            // Doom loop detection — Cline-style escalating response
            const earlyDoomResult = doomTracker.check(tcPart.toolName, tcPart.args)
            if (earlyDoomResult.action === "abort") {
              console.warn(`[Doom Loop] Aborting: "${earlyDoomResult.toolName}" — ${doomTracker.mistakes} consecutive mistakes`)
              earlyError = earlyDoomResult.message
              doomLoopAborted = true
            } else if (earlyDoomResult.action === "warn") {
              // Inject warning as tool result so the model can adapt (Cline pattern: feedback, not abort)
              console.warn(`[Doom Loop] Warning: "${earlyDoomResult.toolName}" — ${doomTracker.mistakes} consecutive mistakes`)
              bufferedEvents.push(sse("tool-result", {
                id: tcPart.toolCallId,
                output: earlyDoomResult.message,
                isError: true,
              }))
            }
            break
          }
          case "tool-result": {
            const trPart = part as unknown as StreamToolResultPart
            bufferedEvents.push(sse("tool-result", {
              id: trPart.toolCallId,
              output: truncateOutput(String(trPart.result ?? "")),
              isError: false,
            }))
            // Cline pattern: reset consecutive mistake counter on successful tool result
            doomTracker.resetOnSuccess()
            break
          }
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
        const status = ((err as { statusCode?: number })?.statusCode || 500) as 400 | 500 | 502
        return c.json({ error: msg }, status)
      }
      if (capturedError) {
        const msg = extractErrorMessage(capturedError)
        const status = ((capturedError as { statusCode?: number })?.statusCode || 500) as 400 | 500 | 502
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
              case "reasoning-delta": {
                const reasoningPart = part as unknown as StreamReasoningDeltaPart
                controller.enqueue(encoder.encode(sse("reasoning", {
                  text: reasoningPart.text || "",
                })))
                break
              }
              case "tool-call": {
                toolCallCount++
                const tcPart = part as unknown as StreamToolCallPart
                const toolCallId = tcPart.toolCallId
                runningToolCalls.add(toolCallId)
                controller.enqueue(encoder.encode(sse("tool-call", {
                  id: toolCallId,
                  tool: tcPart.toolName,
                  args: tcPart.args,
                })))
                // Doom loop detection — Cline-style escalating response
                const doomResult = doomTracker.check(tcPart.toolName, tcPart.args)
                if (doomResult.action === "abort") {
                  // Level 3: hard abort after MAX_CONSECUTIVE_MISTAKES
                  console.warn(`[Doom Loop] Aborting mid-stream: "${doomResult.toolName}" — ${doomTracker.mistakes} consecutive mistakes`)
                  controller.enqueue(encoder.encode(sse("error", { message: doomResult.message })))
                  controller.enqueue(encoder.encode(sse("done", {})))
                  controller.close()
                  return
                } else if (doomResult.action === "warn") {
                  // Level 1-2: inject feedback as tool result so the model can adapt
                  console.warn(`[Doom Loop] Warning mid-stream: "${doomResult.toolName}" — ${doomTracker.mistakes} consecutive mistakes`)
                  controller.enqueue(encoder.encode(sse("tool-result", {
                    id: toolCallId,
                    output: doomResult.message,
                    isError: true,
                  })))
                }
                break
              }
              case "tool-result": {
                const trPart = part as unknown as StreamToolResultPart
                const resultId = trPart.toolCallId
                runningToolCalls.delete(resultId)
                controller.enqueue(encoder.encode(sse("tool-result", {
                  id: resultId,
                  output: truncateOutput(String(trPart.result ?? "")),
                  isError: false,
                })))
                // Cline pattern: reset consecutive mistake counter on successful tool result
                doomTracker.resetOnSuccess()
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
        if (toolCallCount > 0) {
          console.log(`[Chat] Stream done | ${toolCallCount} tool calls`)
        }
        // Extract real usage from AI SDK result (resolves when stream completes)
        try {
          const usage = await result.usage
          const usageInfo = {
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
            cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
            cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
            totalSteps: (await result.steps)?.length ?? 1,
          }
          controller.enqueue(encoder.encode(sse("usage", usageInfo)))
          const totalTokens = usageInfo.inputTokens + usageInfo.outputTokens
          const cacheHit = usageInfo.cacheReadTokens > 0
            ? ` | cache: ${usageInfo.cacheReadTokens} read, ${usageInfo.cacheWriteTokens} write`
            : ""
          console.log(`[Usage] ${usageInfo.inputTokens} in + ${usageInfo.outputTokens} out = ${totalTokens} total${cacheHit}`)
        } catch {
          // Usage extraction is best-effort — don't fail the stream
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
    const status = ((err as { statusCode?: number })?.statusCode || 500) as 400 | 500 | 502
    return c.json({ error: msg }, status)
  }
})
