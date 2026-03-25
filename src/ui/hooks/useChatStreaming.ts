import { useState, useRef, useCallback } from "react"
import { useSessionStore, type Message, type MessagePart, type ToolCallPart, type ReasoningPart } from "../stores/session"
import { useSettingsStore } from "../stores/settings"
import { useProjectStore } from "../stores/project"
import { useTerminalStore } from "../stores/terminal"
import { useChatContextStore } from "../stores/chatContext"
import { useContextStore } from "../stores/context"
import { useLocalAIStore } from "../stores/localAI"
import { useToolApprovalStore } from "../stores/toolApproval"
import { useStreamingStore } from "../stores/streaming"
import { SSEParser } from "../components/chat/SSEParser"
import { playSound } from "../utils/sound"
import { toast } from "sonner"

export function useChatStreaming(projectId: string) {
  const createSession = useSessionStore((s) => s.createSession)
  const addMessage = useSessionStore((s) => s.addMessage)
  const updateMessage = useSessionStore((s) => s.updateMessage)
  const renameSession = useSessionStore((s) => s.renameSession)

  const activeSessionId = useSessionStore((s) => s.activeSessionIdByProject[projectId] ?? null)

  const activeModel = useSettingsStore((s) => s.activeModel)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const activeMode = useSettingsStore((s) => s.activeMode)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const agentMode = useSettingsStore((s) => s.agentModeByProject[projectId] ?? s.agentMode)
  const getActiveProvider = useSettingsStore((s) => s.getActiveProvider)

  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  )
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)

  const quotes = useChatContextStore((s) => s.quotes)
  const clearQuotes = useChatContextStore((s) => s.clearQuotes)
  const images = useChatContextStore((s) => s.images)
  const clearImages = useChatContextStore((s) => s.clearImages)

  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const streamingMsgIdRef = useRef<string | null>(null)

  // onContentUpdate callback — caller can provide this via ref or we use a no-op
  // This will be set by the component that uses this hook
  const onContentUpdateRef = useRef<() => void>(() => {})

  /** Allow the parent to set the onContentUpdate callback */
  const setOnContentUpdate = useCallback((fn: () => void) => {
    onContentUpdateRef.current = fn
  }, [])

  // ── Auto-title generation (fire-and-forget) ─────────────────

  function generateTitle(sessionId: string, apiMessages: any[], provider: any) {
    fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: apiMessages.slice(-4), // Last 4 messages for context
        providerId: provider?.type === "custom" ? "custom" : activeProvider,
        modelId: activeModel,
        apiKey: provider?.apiKey || "local",
        baseUrl: provider?.baseUrl,
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.title) {
          renameSession(sessionId, data.title)
        }
      })
      .catch(() => {}) // Silent failure — title is cosmetic
  }

  // ── Auto-compaction (fire-and-forget with toast) ───────────

  function autoCompact(sessionId: string, provider: any) {
    const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
    if (!session || session.messages.length < 5) return

    const messages = session.messages.map((m) => ({ role: m.role, content: m.content }))
    toast("Compacting context...", { duration: 2000 })

    fetch("/api/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        providerId: provider?.type === "custom" ? "custom" : activeProvider,
        modelId: activeModel,
        apiKey: provider?.apiKey || "local",
        baseUrl: provider?.baseUrl,
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.compacted) {
          // Replace session messages with compacted version
          const store = useSessionStore.getState()
          const sess = store.sessions.find((s) => s.id === sessionId)
          if (sess) {
            const compactedMessages: Message[] = data.compacted.map((m: any, i: number) => ({
              id: sess.messages[i]?.id || crypto.randomUUID(),
              role: m.role,
              content: m.content,
              parts: [],
              createdAt: sess.messages[i]?.createdAt || Date.now(),
            }))
            useSessionStore.setState((s) => ({
              sessions: s.sessions.map((se) =>
                se.id === sessionId ? { ...se, messages: compactedMessages } : se,
              ),
            }))
            toast.success("Context compacted", { duration: 2000 })
          }
        }
      })
      .catch(() => toast.error("Compaction failed", { duration: 3000 }))
  }

  // ── Streaming with SSE parsing ──────────────────────────────

  async function handleSend(overrideInput?: string, opts?: {
    inputValue?: string
    setInput?: (v: string) => void
    historyRef?: React.MutableRefObject<string[]>
    historyIndexRef?: React.MutableRefObject<number>
    draftRef?: React.MutableRefObject<string>
    hasTerminals?: boolean
  }) {
    if (streaming) return

    const hasTerminals = opts?.hasTerminals ?? true
    if (!hasTerminals) return

    const inputValue = opts?.inputValue ?? ""
    const effectiveInput = overrideInput ?? inputValue
    if (!effectiveInput.trim() && quotes.length === 0 && images.length === 0) return

    const provider = getActiveProvider()
    const isLocal = activeProvider === "local"
    const skipKeyCheck = isLocal || provider?.type === "custom"
    if (!skipKeyCheck && !provider?.apiKey) {
      let sid = activeSessionId
      if (!sid) {
        const s = createSession(projectId)
        sid = s.id
      }
      addMessage(sid, {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "No API key configured. Go to Settings > Providers to connect a provider, or select a local model.",
        parts: [],
        createdAt: Date.now(),
      })
      return
    }

    let sid = activeSessionId
    if (!sid) {
      const s = createSession(projectId)
      sid = s.id
    }

    // Build message content with context quotes
    // Push to message history (dedup with last)
    const userText = effectiveInput.trim()
    if (opts?.historyRef && userText && opts.historyRef.current[opts.historyRef.current.length - 1] !== userText) {
      opts.historyRef.current.push(userText)
      if (opts.historyRef.current.length > 50) opts.historyRef.current.shift()
    }
    if (opts?.historyIndexRef) opts.historyIndexRef.current = -1
    if (opts?.draftRef) opts.draftRef.current = ""

    let messageContent = userText
    if (quotes.length > 0) {
      const contextBlock = quotes
        .map((q) => {
          const commentLine = q.comment ? `\nUser comment: ${q.comment}` : ""
          if (q.source === "terminal") {
            return `<terminal name="${q.terminalName}" lines="${q.lineCount}">${commentLine}\n${q.text}\n</terminal>`
          }
          const lineInfo = q.startLine ? ` startLine="${q.startLine}"` : ""
          return `<file path="${q.filePath}" container="${q.container}" language="${q.language}" lines="${q.lineCount}"${lineInfo}>${commentLine}\n${q.text}\n</file>`
        })
        .join("\n\n")
      messageContent = userText
        ? `${contextBlock}\n\n${userText}`
        : contextBlock
      clearQuotes()
    }

    // Include image references in message content
    if (images.length > 0) {
      const imageNote = images.map((img) => `[Image: ${img.filename}]`).join(" ")
      messageContent = messageContent ? `${messageContent}\n\n${imageNote}` : imageNote
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      parts: [],
      createdAt: Date.now(),
    }
    addMessage(sid, userMessage)
    opts?.setInput?.("")
    const attachedImages = [...images]
    if (attachedImages.length > 0) clearImages()

    const currentSession = useSessionStore
      .getState()
      .sessions.find((s) => s.id === sid)
    const apiMessages = (currentSession?.messages || [])
      .filter((m) => !m.isSystemNotice)
      .map((m) => ({ role: m.role, content: m.content }))

    const assistantId = crypto.randomUUID()
    addMessage(sid, {
      id: assistantId,
      role: "assistant",
      content: "",
      parts: [],
      createdAt: Date.now(),
    })
    streamingMsgIdRef.current = assistantId

    setStreaming(true)
    useToolApprovalStore.getState().clearResolved()
    const abort = new AbortController()
    abortRef.current = abort
    useStreamingStore.getState().start(() => abort.abort())

    // Local accumulator for parts during streaming
    const parts: MessagePart[] = []
    let fullText = ""
    let rafPending = false
    let shouldPinCurrentMessage = false

    // Auto-pin heuristic: detect critical findings in tool outputs
    const CRITICAL_PATTERNS = [
      /password[:\s=]+\S+/i,
      /flag\{[^}]+\}/,
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+\b/,
      /\b(credential|secret|token|api.?key)[:\s=]+\S+/i,
      /CVE-\d{4}-\d+/i,
    ]

    function flushToStore() {
      if (!sid) return
      updateMessage(sid, assistantId, {
        content: fullText,
        parts: [...parts],
      })
      onContentUpdateRef.current()
      rafPending = false
    }

    function scheduleFlush() {
      if (!rafPending) {
        rafPending = true
        requestAnimationFrame(flushToStore)
      }
    }

    function getOrCreateTextPart(): number {
      const last = parts[parts.length - 1]
      if (last && last.type === "text") {
        return parts.length - 1
      }
      parts.push({ type: "text", content: "" })
      return parts.length - 1
    }

    try {
      // Retry loop with exponential backoff (like OpenCode)
      const MAX_RETRIES = 3
      let res: Response | undefined
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            messages: apiMessages,
            providerId: provider?.type === "custom" ? "custom" : activeProvider,
            modelId: activeModel,
            apiKey: provider?.apiKey || "local",
            baseUrl: provider?.baseUrl,
            containerIds: project?.containerIds || [],
            activeTerminalId,
            mode: activeMode,
            agentMode,
            thinkingEffort,
            images: attachedImages.map((img) => ({
              mime: img.mime,
              dataUrl: img.dataUrl,
            })),
          }),
        })

        // Retryable errors: 429 (rate limit), 503 (overloaded), 529 (overloaded)
        if ((res.status === 429 || res.status === 503 || res.status === 529) && attempt < MAX_RETRIES && !abort.signal.aborted) {
          // Parse Retry-After header (seconds or ms)
          const retryAfterRaw = res.headers.get("retry-after")
          const retryAfterMs = res.headers.get("retry-after-ms")
          let delayMs: number
          if (retryAfterMs) {
            delayMs = Math.min(parseFloat(retryAfterMs), 30_000)
          } else if (retryAfterRaw) {
            const parsed = parseFloat(retryAfterRaw)
            delayMs = !isNaN(parsed) ? Math.min(parsed * 1000, 30_000) : 5000
          } else {
            // Exponential backoff: 2s, 4s, 8s — capped at 30s
            delayMs = Math.min(2000 * Math.pow(2, attempt), 30_000)
          }
          const delaySecs = Math.ceil(delayMs / 1000)
          toast(`Rate limited (${res.status}). Retrying in ${delaySecs}s... (${attempt + 1}/${MAX_RETRIES})`, { duration: delayMs })
          await new Promise((r) => setTimeout(r, delayMs))
          if (abort.signal.aborted) break
          continue
        }
        break // Success or non-retryable error
      }

      if (!res!.ok) {
        let errorMsg = `HTTP ${res!.status}`
        try {
          const contentType = res!.headers.get("content-type") || ""
          if (contentType.includes("json")) {
            const err = await res!.json()
            errorMsg = err.error || errorMsg
          } else {
            errorMsg = (await res!.text()) || errorMsg
          }
        } catch { /* ignore parse errors */ }
        throw new Error(errorMsg)
      }

      // Read context metadata from response header
      const contextHeader = res!.headers.get("X-Context-Info")
      if (contextHeader) {
        useContextStore.getState().updateFromHeader(contextHeader)
      }

      // Refresh local model status if needed
      if (activeProvider === "local") {
        useLocalAIStore.getState().fetchServerStatus()
      }

      const reader = res!.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      const parser = new SSEParser()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const events = parser.feed(chunk)

        for (const evt of events) {
          switch (evt.event) {
            case "text-delta": {
              // Close any open reasoning part when text starts
              const prevR = parts[parts.length - 1]
              if (prevR && prevR.type === "reasoning" && !(prevR as ReasoningPart).endTime) {
                (prevR as ReasoningPart).endTime = Date.now()
              }
              const idx = getOrCreateTextPart()
              const textPart = parts[idx] as { type: "text"; content: string }
              textPart.content += evt.data.text
              fullText += evt.data.text
              scheduleFlush()
              break
            }
            case "reasoning": {
              // Accumulate reasoning into a single ReasoningPart
              const lastPart = parts[parts.length - 1]
              if (lastPart && lastPart.type === "reasoning") {
                (lastPart as ReasoningPart).content += evt.data.text
              } else {
                parts.push({
                  type: "reasoning",
                  id: crypto.randomUUID(),
                  content: evt.data.text,
                  startTime: Date.now(),
                } as ReasoningPart)
              }
              scheduleFlush()
              break
            }
            case "tool-call": {
              // Close any open reasoning part
              const prevPart = parts[parts.length - 1]
              if (prevPart && prevPart.type === "reasoning" && !(prevPart as ReasoningPart).endTime) {
                (prevPart as ReasoningPart).endTime = Date.now()
              }
              const toolPart: ToolCallPart = {
                type: "tool-call",
                id: evt.data.id,
                tool: evt.data.tool,
                args: evt.data.args || {},
                status: "running",
                startTime: Date.now(),
              }
              parts.push(toolPart)
              useStreamingStore.getState().incrementStep()
              flushToStore()
              break
            }
            case "tool-result": {
              // Find matching tool-call part and update it
              const toolIdx = parts.findIndex(
                (p) => p.type === "tool-call" && p.id === evt.data.id,
              )
              if (toolIdx !== -1) {
                const tp = parts[toolIdx] as ToolCallPart
                tp.status = evt.data.isError ? "error" : "completed"
                tp.output = evt.data.output
                tp.isError = evt.data.isError
                tp.endTime = Date.now()
                if (evt.data.wasTruncated) {
                  tp.wasTruncated = true
                  tp.originalLength = evt.data.originalLength
                }
                // Auto-pin: check if output contains critical findings
                if (tp.output && !shouldPinCurrentMessage) {
                  if (CRITICAL_PATTERNS.some((p) => p.test(tp.output!))) {
                    shouldPinCurrentMessage = true
                  }
                }
              }
              flushToStore()
              break
            }
            case "error": {
              fullText += `\n\n⚠️ ${evt.data.message}`
              const idx = getOrCreateTextPart()
              const textPart = parts[idx] as { type: "text"; content: string }
              textPart.content += `\n\n⚠️ ${evt.data.message}`
              flushToStore()
              break
            }
            case "usage": {
              // Real token usage from the provider
              if (sid && assistantId) {
                useSessionStore.getState().updateMessageUsage(sid, assistantId, {
                  inputTokens: evt.data.inputTokens ?? 0,
                  outputTokens: evt.data.outputTokens ?? 0,
                  reasoningTokens: evt.data.reasoningTokens || undefined,
                  cacheReadTokens: evt.data.cacheReadTokens || undefined,
                  cacheWriteTokens: evt.data.cacheWriteTokens || undefined,
                  totalSteps: evt.data.totalSteps || undefined,
                })
              }
              break
            }
            case "done":
              break
          }
        }
      }

      // Final flush
      flushToStore()

      // Auto-pin message if critical findings detected
      if (shouldPinCurrentMessage && sid && assistantId) {
        useSessionStore.getState().updateMessage(sid, assistantId, { isPinned: true })
      }

      if (!fullText.trim() && parts.filter((p) => p.type === "tool-call").length === 0) {
        updateMessage(sid!, assistantId, {
          content: "⚠️ **Error:** Empty response from model. The API call may have failed silently.",
          parts: [{ type: "text", content: "⚠️ **Error:** Empty response from model." }],
        })
      }

      // ── Auto-title: generate LLM title after first exchange ──
      const session = useSessionStore.getState().sessions.find((s) => s.id === sid)
      const isFirstExchange = session && session.messages.filter((m) => m.role === "assistant" && m.content).length === 1
      if (isFirstExchange && session.title === session.messages[0]?.content.slice(0, 50) + (session.messages[0]?.content.length > 50 ? "..." : "")) {
        // Title is still the auto-generated truncation — generate a real one
        generateTitle(sid!, apiMessages, provider)
      }

      // ── Auto-compact: trigger if backend flagged needsCompaction ──
      const ctxInfo = useContextStore.getState().info as any
      if (ctxInfo?.needsCompaction && sid) {
        autoCompact(sid, provider)
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const errMsg = (err as Error).message || "Unknown error"
        const errorDisplay = `\n\n⚠️ **Error:** ${errMsg}`
        fullText += errorDisplay
        const idx = getOrCreateTextPart()
        const textPart = parts[idx] as { type: "text"; content: string }
        textPart.content += errorDisplay
        flushToStore()
        playSound("error")
      }
    } finally {
      if (fullText.trim() && !abortRef.current?.signal.aborted) {
        playSound("message-done")
      }
      setStreaming(false)
      useStreamingStore.getState().stop()
      abortRef.current = null
      streamingMsgIdRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
    // Immediately mark streaming as done so UI updates
    setStreaming(false)
    useStreamingStore.getState().stop()
    abortRef.current = null
    // Mark any in-flight tool calls as interrupted in the current message
    if (streamingMsgIdRef.current && activeSessionId) {
      const msgs = useSessionStore.getState().getActiveMessages(projectId)
      const msg = msgs.find((m) => m.id === streamingMsgIdRef.current)
      if (msg?.parts) {
        const updatedParts = msg.parts.map((p) =>
          p.type === "tool-call" && (p as ToolCallPart).status === "running"
            ? { ...p, status: "error" as const, output: "[Interrupted]", endTime: Date.now() }
            : p,
        )
        updateMessage(activeSessionId, streamingMsgIdRef.current, { parts: updatedParts })
      }
      streamingMsgIdRef.current = null
    }
  }

  return {
    streaming,
    handleSend,
    handleStop,
    streamingMsgIdRef,
    autoCompact,
    setOnContentUpdate,
  }
}
