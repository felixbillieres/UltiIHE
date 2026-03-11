import { Hono } from "hono"
import { streamText, stepCountIs } from "ai"
import { terminalManager } from "../../../terminal/manager"
import { allTools, readOnlyTools } from "../../../ai/tool"
import { createRegistry } from "./registry"
import { buildSystemPrompt } from "./systemPrompt"
import type { ReasoningMode, AgentId } from "./systemPrompt"
import { getReasoningOptions } from "./reasoning"
import type { ThinkingEffort } from "./reasoning"
import { extractErrorMessage, extractStatusCode } from "./errors"

export const chatRoutes = new Hono()

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

  // Build terminal context from active terminal's ring buffer
  let terminalContext = ""
  if (activeTerminalId) {
    try {
      terminalContext = terminalManager.getOutput(activeTerminalId)
      // Keep last 100 lines for context
      const lines = terminalContext.split("\n")
      if (lines.length > 100) {
        terminalContext = lines.slice(-100).join("\n")
      }
    } catch {
      // Terminal might not exist yet
    }
  }

  // Gather all active terminals for context
  const activeTerminals = terminalManager.listTerminals()

  try {
    const registry = await createRegistry(providerId, apiKey, modelId, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    // Report agent and plan mode get read-only tools; others get everything
    const tools = agent === "report" || mode === "plan" ? readOnlyTools : allTools

    // Capture errors via onError — AI SDK errors are stream parts, not thrown
    let capturedError: unknown = null

    let result
    try {
      result = streamText({
        model,
        system: buildSystemPrompt(containerIds || [], terminalContext, activeTerminals, mode, agent),
        messages,
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
        switch (part.type) {
          case "text-delta":
            bufferedText.push(part.text)
            if (part.text.length > 0) hasContent = true
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

    // We have content — stream it all
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
      },
    })
  } catch (err) {
    const msg = extractErrorMessage(err)
    const status = (err as any)?.statusCode || 500
    return c.json({ error: msg }, status)
  }
})
