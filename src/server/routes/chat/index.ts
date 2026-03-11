import { Hono } from "hono"
import { streamText, stepCountIs } from "ai"
import { terminalManager } from "../../../terminal/manager"
import { allTools, readOnlyTools } from "../../../ai/tool"
import { createRegistry } from "./registry"
import type { ReasoningMode, AgentId } from "./systemPrompt"
import { buildSystemPrompt } from "./systemPrompt"
import { getReasoningOptions } from "./reasoning"
import type { ThinkingEffort } from "./reasoning"
import { extractErrorMessage, extractStatusCode } from "./errors"
import {
  calculateBudget,
  buildAdaptivePrompt,
  buildContextBreakdown,
  estimateMessagesTokens,
  shouldPrune,
  pruneMessages,
} from "../../../ai/context"
import { resolveContextWindow, preWarmModel } from "./contextResolver"

export const chatRoutes = new Hono()

// ── Context info endpoint ─────────────────────────────────────
// Returns token breakdown for the UI context indicator.
// Called by the frontend after each message to update the bar.

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

  // Resolve context window for the model
  const contextWindow = resolveContextWindow(providerId, modelId)
  const budget = calculateBudget(contextWindow)

  // Build the prompt that would be used (for accurate estimation)
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

  // Select tools for count estimation
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
  }

  if (!messages || !providerId || !modelId) {
    return c.json({ error: "Missing required fields" }, 400)
  }
  // Local/custom providers don't necessarily need an API key
  if (providerId !== "local" && providerId !== "custom" && !apiKey) {
    return c.json({ error: "Missing API key" }, 400)
  }

  // ── Pre-warm models.dev cache (async, non-blocking) ──────
  await preWarmModel(providerId, modelId)

  // ── Context budget ────────────────────────────────────────
  const contextWindow = resolveContextWindow(providerId, modelId)
  const budget = calculateBudget(contextWindow)

  // ── Terminal context ──────────────────────────────────────
  let terminalContext = ""
  if (activeTerminalId) {
    try {
      terminalContext = terminalManager.getOutput(activeTerminalId)
      // Adaptive line limit based on model size
      const maxLines = budget.promptTier === "minimal" ? 30 : budget.promptTier === "medium" ? 60 : 100
      const lines = terminalContext.split("\n")
      if (lines.length > maxLines) {
        terminalContext = lines.slice(-maxLines).join("\n")
      }
    } catch {
      // Terminal might not exist yet
    }
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

  // Limit tools for small models
  let tools: Record<string, any> = baseTools
  if (budget.maxTools < Object.keys(baseTools).length) {
    // Prioritize essential tools, drop niche ones
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

  // ── Message pruning ───────────────────────────────────────
  let processedMessages = messages
  const currentTokens = estimateMessagesTokens(messages)
  if (shouldPrune(currentTokens, budget)) {
    const { messages: pruned } = pruneMessages(messages)
    processedMessages = pruned
    console.log(`[Context] Pruned messages: ${currentTokens} → ${estimateMessagesTokens(pruned)} tokens`)
  }

  try {
    const registry = await createRegistry(providerId, apiKey, modelId, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    // Capture errors via onError — AI SDK errors are stream parts, not thrown
    let capturedError: unknown = null

    let result
    try {
      result = streamText({
        model,
        system: systemPrompt,
        messages: processedMessages,
        tools,
        stopWhen: stepCountIs(30),
        providerOptions: getReasoningOptions(providerId, mode, thinkingEffort),
        onError({ error }) {
          capturedError = error
        },
      })
    } catch (err) {
      // Some providers throw synchronously during streamText()
      const msg = extractErrorMessage(err)
      const status = (err as any)?.statusCode || 500
      return c.json({ error: msg }, status)
    }

    // Use fullStream to detect error parts before committing to 200 response.
    // AI SDK docs: "errors become part of the stream and are not thrown"
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

    // Log context info for debugging
    console.log(`[Context] ${budget.promptTier} tier | ${Object.keys(tools).length} tools | ~${estimateMessagesTokens(processedMessages)} msg tokens | ${contextWindow} ctx window`)

    // Buffer parts until we get real text content or an error
    const bufferedText: string[] = []
    let hasContent = false
    let earlyError: string | null = null
    let streamDone = false

    try {
      // Race the first stream read against the text promise (which rejects on API errors).
      // Some providers (Google, Groq) throw errors in an internal pipeline that
      // fullStream never surfaces as an error part — the iterator just ends.
      const textPromise = result.text.then(
        () => null,
        (err: unknown) => err,
      )

      while (!hasContent && !earlyError && !streamDone) {
        // Race iterator.next() against the error promise
        const iterResult = await Promise.race([
          iterator.next(),
          textPromise.then((err) => {
            if (err) throw err
            // text resolved without error — return a synthetic "done"
            return { done: true as const, value: undefined }
          }),
        ])

        if (iterResult.done) {
          streamDone = true
          break
        }
        const part = iterResult.value
        if (!part) continue
        // Log non-text parts for debugging (especially tool calls from local models)
        if (part.type !== "text-delta" && part.type !== "start") {
          console.log(`[Stream] part type: ${part.type}`, part.type === "tool-call" ? `tool: ${(part as any).toolName}` : "")
        }
        switch (part.type) {
          case "text-delta":
            bufferedText.push(part.text)
            if (part.text.length > 0 && !hasContent) {
              hasContent = true
              console.log(`[Stream] First text received: "${part.text.slice(0, 50)}..."`)
            }
            break
          case "error":
            earlyError = extractErrorMessage(part.error)
            break
          // skip other part types during buffering
        }
      }
    } catch (err) {
      earlyError = extractErrorMessage(err)
    }

    // Error before any content → proper HTTP error response
    if (earlyError && !hasContent) {
      const status = extractStatusCode(capturedError, earlyError)
      return c.json({ error: earlyError }, status)
    }

    // Empty stream — try to extract error from result promises
    if (streamDone && !hasContent && !earlyError) {
      // result.text rejects if the API call failed — this catches errors that
      // onError hasn't delivered yet (timing issue with async callbacks)
      try {
        await result.text
      } catch (err) {
        const msg = extractErrorMessage(err)
        const status = (err as any)?.statusCode || 500
        return c.json({ error: msg }, status)
      }

      // Fallback: check onError callback
      if (capturedError) {
        const msg = extractErrorMessage(capturedError)
        const status = (capturedError as any)?.statusCode || 500
        return c.json({ error: msg }, status)
      }
      return c.json({ error: "Model returned an empty response" }, 502)
    }

    // ── Stream response with context metadata in headers ────
    // The UI reads these headers to update the context indicator
    const toolCount = Object.keys(tools).length
    const breakdown = buildContextBreakdown(
      systemPrompt,
      toolCount,
      processedMessages,
      budget.inputBudget,
    )

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Flush buffered text
        for (const text of bufferedText) {
          controller.enqueue(encoder.encode(text))
        }
        // If there was an early error after some content, append it
        if (earlyError) {
          controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${earlyError}`))
          controller.close()
          return
        }
        if (streamDone) {
          controller.close()
          return
        }
        // Continue consuming fullStream
        try {
          for (;;) {
            const { done, value: part } = await iterator.next()
            if (done) break
            switch (part.type) {
              case "text-delta":
                controller.enqueue(encoder.encode(part.text))
                break
              case "error":
                controller.enqueue(
                  encoder.encode(`\n\n⚠️ Error: ${extractErrorMessage(part.error)}`),
                )
                break
              // tool-call, tool-result, etc. — skip for text stream
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`\n\n⚠️ Error: ${extractErrorMessage(err)}`),
          )
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        // Context metadata — JSON-encoded in a custom header
        "X-Context-Info": JSON.stringify({
          total: breakdown.total,
          limit: breakdown.limit,
          free: breakdown.free,
          percentUsed: breakdown.percentUsed,
          promptTier: budget.promptTier,
          toolCount,
          pruned: processedMessages !== messages,
        }),
      },
    })
  } catch (err) {
    const msg = extractErrorMessage(err)
    const status = (err as any)?.statusCode || 500
    return c.json({ error: msg }, status)
  }
})
