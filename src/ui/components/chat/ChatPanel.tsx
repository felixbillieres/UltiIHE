import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useSessionStore, type Message, type MessagePart, type ToolCallPart, type ReasoningPart } from "../../stores/session"
import { useSettingsStore } from "../../stores/settings"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { useToolApprovalStore } from "../../stores/toolApproval"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useProjectStore } from "../../stores/project"
import { useTerminalStore } from "../../stores/terminal"
import { useChatContextStore } from "../../stores/chatContext"
import { useContextStore } from "../../stores/context"
import { useLocalAIStore } from "../../stores/localAI"
import { useAutoScroll } from "../../hooks/useAutoScroll"
import { Send, Bot, Loader2, Square, ArrowDown, Search, X } from "lucide-react"
import { toast } from "sonner"

import { playSound } from "../../utils/sound"
import { useSlashCommands, useAtOptions, type SlashCommand, type AtOption } from "./chatCommands"
import { ControlBar } from "./ControlBar"
import { ContextQuotes } from "./ContextQuotes"
import { CommandPopover } from "./CommandPopover"
import { MessageBubble, CompactionMessage } from "./MessageBubble"
import { PermissionBanner, ToolPermissionBanner } from "./PermissionBanners"
import { FileApprovalBanner, ResolvedFilesSummary } from "./FileApprovalBanner"
import { ImageAttachments } from "./ImageAttachments"
import { OperationsTracker } from "./OperationsTracker"
import { SSEParser } from "./SSEParser"

// Stable reference for empty arrays (avoids infinite re-render loops)
const EMPTY_MESSAGES: Message[] = []

// ── Component ────────────────────────────────────────────────

interface Props {
  projectId: string
}

export function ChatPanel({ projectId }: Props) {
  // Use individual selectors — never bare useSessionStore() which subscribes to everything
  const createSession = useSessionStore((s) => s.createSession)
  const addMessage = useSessionStore((s) => s.addMessage)
  const updateMessage = useSessionStore((s) => s.updateMessage)
  const updateMessageContent = useSessionStore((s) => s.updateMessageContent)
  const renameSession = useSessionStore((s) => s.renameSession)

  // Per-project active session
  const activeSessionId = useSessionStore((s) => s.activeSessionIdByProject[projectId] ?? null)
  const activeSession = useSessionStore((s) => {
    const sid = s.activeSessionIdByProject[projectId]
    return sid ? s.sessions.find((sess) => sess.id === sid) : undefined
  })
  const messages = useSessionStore((s) => {
    const sid = s.activeSessionIdByProject[projectId]
    if (!sid) return EMPTY_MESSAGES
    const session = s.sessions.find((sess) => sess.id === sid)
    return session?.messages || EMPTY_MESSAGES
  })

  const activeModel = useSettingsStore((s) => s.activeModel)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const activeMode = useSettingsStore((s) => s.activeMode)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const agentMode = useSettingsStore((s) => s.agentModeByProject[projectId] ?? s.agentMode)
  const getActiveProvider = useSettingsStore((s) => s.getActiveProvider)

  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  )
  // Only show terminals for this project
  const allTerminals = useTerminalStore((s) => s.terminals)
  const terminals = useMemo(
    () => allTerminals.filter((t) => t.projectId === projectId),
    [allTerminals, projectId],
  )
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)

  const quotes = useChatContextStore((s) => s.quotes)
  const removeQuote = useChatContextStore((s) => s.removeQuote)
  const clearQuotes = useChatContextStore((s) => s.clearQuotes)
  const images = useChatContextStore((s) => s.images)
  const addImage = useChatContextStore((s) => s.addImage)
  const removeImage = useChatContextStore((s) => s.removeImage)
  const clearImages = useChatContextStore((s) => s.clearImages)

  const pendingCommands = useCommandApprovalStore((s) => s.pending)
  const approvalMode = useCommandApprovalStore((s) => s.mode)
  const removePendingCommand = useCommandApprovalStore((s) => s.removePending)
  const setApprovalMode = useCommandApprovalStore((s) => s.setMode)
  const pendingTools = useToolApprovalStore((s) => s.pending)
  const resolvedTools = useToolApprovalStore((s) => s.resolved)
  const removePendingTool = useToolApprovalStore((s) => s.removePending)
  const resolveTool = useToolApprovalStore((s) => s.resolveTool)
  const { send: wsSend } = useWebSocket()

  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgIdRef = useRef<string | null>(null)

  // Message history (ArrowUp/Down)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const draftRef = useRef("")

  // Image drag state
  const [draggingOver, setDraggingOver] = useState(false)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Model picker trigger ref
  const [showModelPickerFromSlash, setShowModelPickerFromSlash] = useState(false)

  // Slash & @ popover state
  const [popover, setPopover] = useState<"slash" | "at" | null>(null)
  const [popoverIndex, setPopoverIndex] = useState(0)
  const [popoverFilter, setPopoverFilter] = useState("")
  const slashCommands = useSlashCommands()
  const atOptions = useAtOptions()

  const filteredSlash = useMemo(
    () =>
      slashCommands.filter(
        (c) =>
          !popoverFilter ||
          c.trigger.toLowerCase().includes(popoverFilter.toLowerCase()) ||
          c.title.toLowerCase().includes(popoverFilter.toLowerCase()),
      ),
    [slashCommands, popoverFilter],
  )

  const filteredAt = useMemo(
    () =>
      atOptions.filter(
        (o) =>
          !popoverFilter ||
          o.display.toLowerCase().includes(popoverFilter.toLowerCase()),
      ),
    [atOptions, popoverFilter],
  )

  // Smart auto-scroll
  const { containerRef, showScrollButton, scrollToBottom, scrollToLastUserMessage, onContentUpdate } =
    useAutoScroll(streaming)

  // On new user message: scroll so it's at the top (clean context). Otherwise follow streaming.
  const prevMsgCountRef = useRef(messages.length)
  useEffect(() => {
    const prev = prevMsgCountRef.current
    prevMsgCountRef.current = messages.length
    if (messages.length > prev) {
      const last = messages[messages.length - 1]
      if (last?.role === "user") {
        // Delay to let React render the message + spacer first
        requestAnimationFrame(() => scrollToLastUserMessage())
        return
      }
    }
    onContentUpdate()
  }, [messages.length, onContentUpdate, scrollToLastUserMessage])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px"
    }
  }, [input])

  const hasTerminals = terminals.length > 0

  // Global keyboard shortcuts for the chat panel
  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      // Ctrl+F: open message search (when chat panel is focused)
      if (e.key === "f" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        // Only intercept if focus is within the chat panel
        const chatPanel = containerRef.current?.closest(".h-full.flex.flex-col")
        if (chatPanel?.contains(document.activeElement) || document.activeElement === textareaRef.current) {
          e.preventDefault()
          setSearchOpen(true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
        }
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown)
    return () => window.removeEventListener("keydown", onGlobalKeyDown)
  }, [])

  // Filtered messages for search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return messages.filter((m) => m.content.toLowerCase().includes(q)).map((m) => m.id)
  }, [searchQuery, messages])

  // ── Image paste/drop handlers ─────────────────────────────────
  const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

  function processFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!ALLOWED_IMAGE_MIMES.has(file.type)) continue
      const reader = new FileReader()
      reader.onload = () => {
        addImage({
          filename: file.name,
          mime: file.type,
          dataUrl: reader.result as string,
          size: file.size,
        })
      }
      reader.readAsDataURL(file)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter((f) => ALLOWED_IMAGE_MIMES.has(f.type))
      if (imageFiles.length > 0) {
        e.preventDefault()
        processFiles(imageFiles)
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)

    // Handle drag from file manager panel (container images)
    const exegolData = e.dataTransfer?.getData("application/x-exegol-file")
    if (exegolData) {
      try {
        const { container, path, name } = JSON.parse(exegolData) as { container: string; path: string; name: string }
        // Fetch image from container via API and convert to data URL
        fetch(`/api/files/${container}/read?path=${encodeURIComponent(path)}&base64=true`)
          .then((r) => r.json())
          .then((data) => {
            if (data.base64 && data.mime) {
              addImage({
                filename: name,
                mime: data.mime,
                dataUrl: `data:${data.mime};base64,${data.base64}`,
                size: data.size || 0,
              })
            }
          })
          .catch(() => {})
      } catch {}
      return
    }

    // Handle native file drops (from OS file manager)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      processFiles(files)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
  }

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

  async function handleSend(overrideInput?: string) {
    if (streaming) return
    if (!hasTerminals) return
    const effectiveInput = overrideInput ?? input
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
    if (userText && historyRef.current[historyRef.current.length - 1] !== userText) {
      historyRef.current.push(userText)
      if (historyRef.current.length > 50) historyRef.current.shift()
    }
    historyIndexRef.current = -1
    draftRef.current = ""

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
    setInput("")
    const attachedImages = [...images]
    if (attachedImages.length > 0) clearImages()

    const currentSession = useSessionStore
      .getState()
      .sessions.find((s) => s.id === sid)
    const apiMessages = (currentSession?.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }))

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

    // Local accumulator for parts during streaming
    const parts: MessagePart[] = []
    let fullText = ""
    let rafPending = false

    function flushToStore() {
      if (!sid) return
      updateMessage(sid, assistantId, {
        content: fullText,
        parts: [...parts],
      })
      onContentUpdate()
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
      abortRef.current = null
      streamingMsgIdRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
    // Immediately mark streaming as done so UI updates
    setStreaming(false)
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

  function handleInputChange(value: string) {
    setInput(value)

    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      setPopover("slash")
      setPopoverFilter(slashMatch[1])
      setPopoverIndex(0)
      return
    }

    const atMatch = value.match(/@(\S*)$/)
    if (atMatch) {
      setPopover("at")
      setPopoverFilter(atMatch[1])
      setPopoverIndex(0)
      return
    }

    if (popover) setPopover(null)
  }

  function handleSlashSelect(cmd: SlashCommand) {
    setPopover(null)
    cmd.action({
      setInput,
      cycleThinkingEffort: useSettingsStore.getState().cycleThinkingEffort,
      newSession: () => useSessionStore.getState().startNewChat(projectId),
      compact: () => {
        const provider = getActiveProvider()
        if (activeSessionId) autoCompact(activeSessionId, provider)
      },
      undo: () => {
        if (activeSessionId) {
          const ok = useSessionStore.getState().undoLastExchange(activeSessionId)
          if (ok) toast.success("Undone last exchange")
          else toast.error("Nothing to undo")
        }
      },
      openModelPicker: () => setShowModelPickerFromSlash(true),
      focusTerminal: () => {
        const term = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement
        term?.focus()
      },
    })
    textareaRef.current?.focus()
  }

  function handleAtSelect(option: AtOption) {
    setPopover(null)
    if (option.type === "terminal") {
      setInput(input.replace(/@\S*$/, `@${option.display} `))
    } else if (option.id === "__url__") {
      // @url: prompt user for URL, then fetch content
      const url = prompt("Enter URL to fetch:")
      setInput(input.replace(/@\S*$/, ""))
      if (url) {
        toast("Fetching URL...", { duration: 2000 })
        fetch("/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.content) {
              const lines = data.content.split("\n")
              useChatContextStore.getState().addQuote({
                source: "file",
                container: "web",
                filePath: url,
                fileName: new URL(url).hostname + new URL(url).pathname.slice(0, 30),
                language: data.contentType?.includes("json") ? "json" : data.contentType?.includes("html") ? "html" : "text",
                text: data.content,
                lineCount: lines.length,
              })
              toast.success("URL content attached")
            } else {
              toast.error(data.error || "Failed to fetch URL")
            }
          })
          .catch(() => toast.error("Failed to fetch URL"))
      }
    } else if (option.type === "file" && option.fileMeta) {
      // Fetch file content and add as context quote
      const meta = option.fileMeta
      setInput(input.replace(/@\S*$/, ""))
      fetch(`/api/files/${meta.container}/read?path=${encodeURIComponent(meta.path)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.content) {
            const lines = data.content.split("\n")
            useChatContextStore.getState().addQuote({
              source: "file",
              container: meta.container,
              filePath: meta.path,
              fileName: meta.path.split("/").pop() || meta.path,
              language: meta.language,
              text: data.content,
              lineCount: lines.length,
            })
          }
        })
        .catch(() => {})
    }
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (popover) {
      const items = popover === "slash" ? filteredSlash : filteredAt
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setPopoverIndex((i) => Math.min(i + 1, items.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setPopoverIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        if (items.length > 0) {
          if (popover === "slash") {
            handleSlashSelect(items[popoverIndex] as SlashCommand)
          } else {
            handleAtSelect(items[popoverIndex] as AtOption)
          }
        }
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setPopover(null)
        return
      }
    }

    // Message history navigation (ArrowUp/Down when no popover)
    if (e.key === "ArrowUp" && historyRef.current.length > 0) {
      const ta = textareaRef.current
      const cursorAtStart = !ta || ta.selectionStart === 0
      if (cursorAtStart) {
        e.preventDefault()
        if (historyIndexRef.current === -1) {
          draftRef.current = input
          historyIndexRef.current = historyRef.current.length - 1
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--
        }
        setInput(historyRef.current[historyIndexRef.current])
        return
      }
    }
    if (e.key === "ArrowDown" && historyIndexRef.current !== -1) {
      const ta = textareaRef.current
      const cursorAtEnd = !ta || ta.selectionStart === ta.value.length
      if (cursorAtEnd) {
        e.preventDefault()
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++
          setInput(historyRef.current[historyIndexRef.current])
        } else {
          historyIndexRef.current = -1
          setInput(draftRef.current)
        }
        return
      }
    }

    // Escape: clear input or close search
    if (e.key === "Escape") {
      if (searchOpen) {
        setSearchOpen(false)
        setSearchQuery("")
        textareaRef.current?.focus()
        return
      }
      if (input) {
        e.preventDefault()
        setInput("")
        return
      }
    }

    // Ctrl+Shift+Backspace: undo last exchange
    if (e.key === "Backspace" && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      if (activeSessionId) {
        const ok = useSessionStore.getState().undoLastExchange(activeSessionId)
        if (ok) toast.success("Undone last exchange")
        else toast.error("Nothing to undo")
      }
      return
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Fork & Retry handlers ──────────────────────────────────
  const handleFork = useCallback((messageId: string) => {
    if (!activeSessionId) return
    const forked = useSessionStore.getState().forkSession(activeSessionId, messageId)
    if (forked) toast.success(`Forked: ${forked.title}`)
  }, [activeSessionId])

  const handleRetry = useCallback(() => {
    if (!activeSessionId || streaming) return
    const msgs = useSessionStore.getState().getActiveMessages(projectId)
    if (msgs.length < 2) return
    const lastAssistant = msgs[msgs.length - 1]
    if (lastAssistant.role !== "assistant") return
    useSessionStore.getState().removeLastMessages(activeSessionId, 1)
    const lastUser = msgs[msgs.length - 2]
    if (lastUser?.role === "user") {
      setInput(lastUser.content)
      setTimeout(() => { handleSend() }, 100)
    }
  }, [activeSessionId, streaming])

  // Quote a previous message (Cline-style) — prepend as context to next message
  const handleQuoteMessage = useCallback((_messageId: string, content: string) => {
    setInput((prev) => {
      const quote = `> ${content.split("\n").join("\n> ")}\n\n`
      return prev ? `${quote}${prev}` : quote
    })
    // Focus the input
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  // Find last assistant message id for retry button
  // NOTE: Must be called before the early return to maintain consistent hook ordering
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id
    }
    return null
  }, [messages])


  // No active session — empty state
  if (!activeSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <Bot className="w-8 h-8 text-text-weaker mb-3" />
        <p className="text-sm text-text-weak mb-1 font-sans">
          No session selected
        </p>
        <p className="text-xs text-text-weaker max-w-[200px] font-sans">
          Select a session from the left panel or create a new one
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search bar */}
      {searchOpen && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-surface-1 border-b border-border-weak">
          <Search className="w-3.5 h-3.5 text-text-weaker shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false)
                setSearchQuery("")
                textareaRef.current?.focus()
              }
            }}
            placeholder="Search messages..."
            className="flex-1 text-xs bg-transparent text-text-base placeholder-text-weaker focus:outline-none font-sans"
            autoFocus
          />
          {searchResults && (
            <span className="text-[10px] text-text-weaker font-sans tabular-nums">
              {searchResults.length} match{searchResults.length !== 1 ? "es" : ""}
            </span>
          )}
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery("") }}
            className="p-0.5 rounded hover:bg-surface-2 text-text-weaker"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Messages — Cline pattern: grow to fill, min-h-0 for flex overflow */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-none p-4 space-y-4 relative"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Bot className="w-8 h-8 text-text-weaker mb-3" />
            <p className="text-sm text-text-weak mb-1 font-sans">
              Ready to assist
            </p>
            <p className="text-xs text-text-weaker max-w-[200px] font-sans">
              Ask me to run commands, scan targets, or analyze results
            </p>
          </div>
        ) : (
          messages
            .filter((msg) => !searchResults || searchResults.includes(msg.id))
            .map((msg) => {
              // Detect compaction summary messages and render them specially
              if (msg.content.startsWith("[Context Summary")) {
                return <CompactionMessage key={msg.id} content={msg.content} />
              }
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={
                    streaming &&
                    msg.id === streamingMsgIdRef.current &&
                    (!msg.parts || msg.parts.length === 0) &&
                    msg.content === ""
                  }
                  isLastAssistant={msg.id === lastAssistantId}
                  onFork={handleFork}
                  onRetry={handleRetry}
                  onEdit={!streaming ? handleQuoteMessage : undefined}
                />
              )
            })
        )}
        {/* Spacer — Cline-style: full spacer when idle (lets user msg scroll to top),
            shrinks during streaming so the AI answer stays at the bottom of the viewport
            instead of floating mid-page with empty space below */}
        {messages.length > 0 && (
          <div style={{ minHeight: streaming ? "1rem" : "50vh" }} className="transition-[min-height] duration-300" />
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-[180px] left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-border-weak text-text-weak hover:text-text-strong hover:bg-surface-3 transition-all shadow-lg text-xs font-sans"
          >
            <ArrowDown className="w-3 h-3" />
            Scroll to bottom
          </button>
        </div>
      )}

      {/* Approval banners — sequential: show only first pending command */}
      {pendingCommands.length > 0 && (
        <PermissionBanner
          key={`cmd-${pendingCommands[0].id}`}
          command={pendingCommands[0]}
          queueSize={pendingCommands.length}
          onAllowOnce={() => {
            wsSend({
              type: "command:approve",
              data: { commandId: pendingCommands[0].id },
            })
            removePendingCommand(pendingCommands[0].id)
          }}
          onAllowAlways={() => {
            wsSend({
              type: "command:approve",
              data: { commandId: pendingCommands[0].id, allowAll: true },
            })
            removePendingCommand(pendingCommands[0].id)
            setApprovalMode("allow-all-session")
            wsSend({ type: "command:set-mode", data: { mode: "allow-all-session" } })
          }}
          onDeny={() => {
            wsSend({
              type: "command:reject",
              data: { commandId: pendingCommands[0].id },
            })
            removePendingCommand(pendingCommands[0].id)
          }}
        />
      )}
      {/* File change approvals + resolved summary */}
      {(() => {
        const FILE_TOOLS = new Set(["file_write", "file_edit", "file_delete", "file_create_dir"])
        const fileTools = pendingTools.filter((t) => FILE_TOOLS.has(t.toolName))
        const otherTools = pendingTools.filter((t) => !FILE_TOOLS.has(t.toolName))
        const resolvedFiles = resolvedTools.filter((t) => FILE_TOOLS.has(t.toolName))
        return (
          <>
            <ResolvedFilesSummary resolved={resolvedFiles} />
            <FileApprovalBanner
              tools={fileTools}
              onApprove={(id) => {
                const t = fileTools.find((f) => f.id === id)
                wsSend({ type: "tool:approve", data: { id } })
                resolveTool(id, "approved")
                toast.success(`Accepted: ${(t?.args.filePath || t?.args.targetPath || t?.args.dirPath || "") as string}`)
              }}
              onApproveAlways={(id) => {
                wsSend({ type: "tool:approve", data: { id, allowAlways: true } })
                resolveTool(id, "approved")
              }}
              onDeny={(id) => {
                const t = fileTools.find((f) => f.id === id)
                wsSend({ type: "tool:reject", data: { id } })
                resolveTool(id, "denied")
                toast.error(`Denied: ${(t?.args.filePath || t?.args.targetPath || t?.args.dirPath || "") as string}`)
              }}
              onApproveAll={() => {
                wsSend({ type: "tool:approve-all", data: { allowAlways: false } })
                for (const t of fileTools) resolveTool(t.id, "approved")
                toast.success(`Accepted all ${fileTools.length} file changes`)
              }}
              onDenyAll={() => {
                wsSend({ type: "tool:reject-all", data: {} })
                for (const t of fileTools) resolveTool(t.id, "denied")
                toast.error(`Denied all ${fileTools.length} file changes`)
              }}
            />
            {/* Other tools — sequential: show only first */}
            {otherTools.length > 0 && (
              <ToolPermissionBanner
                key={`tool-${otherTools[0].id}`}
                tool={otherTools[0]}
                queueSize={otherTools.length}
                onAllowOnce={() => {
                  wsSend({ type: "tool:approve", data: { id: otherTools[0].id } })
                  removePendingTool(otherTools[0].id)
                }}
                onAllowAlways={() => {
                  wsSend({ type: "tool:approve", data: { id: otherTools[0].id, allowAlways: true } })
                  removePendingTool(otherTools[0].id)
                }}
                onDeny={() => {
                  wsSend({ type: "tool:reject", data: { id: otherTools[0].id } })
                  removePendingTool(otherTools[0].id)
                }}
              />
            )}
          </>
        )
      })()}

      {/* Operations tracker */}
      <OperationsTracker />

      {/* Input area */}
      <div
        className="shrink-0 border-t border-border-weak relative"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag overlay */}
        {draggingOver && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent rounded-lg pointer-events-none">
            <span className="text-xs text-accent font-sans font-medium">Drop image here</span>
          </div>
        )}
        {/* Image attachments */}
        <ImageAttachments images={images} onRemove={removeImage} />
        {/* Terminal context quotes */}
        {quotes.length > 0 && (
          <ContextQuotes quotes={quotes} onRemove={removeQuote} onClear={clearQuotes} />
        )}
        {/* Editor */}
        <div className="p-3">
          <div className="relative flex items-end gap-2 bg-surface-1 border border-border-base rounded-lg p-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition-colors">
            {/* Popover */}
            {popover === "slash" && filteredSlash.length > 0 && (
              <CommandPopover
                items={filteredSlash.map((cmd, i) => ({
                  key: cmd.id,
                  icon: cmd.icon,
                  title: `/${cmd.trigger}`,
                  description: cmd.description,
                  selected: i === popoverIndex,
                  onClick: () => handleSlashSelect(cmd),
                }))}
              />
            )}
            {popover === "at" && filteredAt.length > 0 && (
              <CommandPopover
                items={filteredAt.map((opt, i) => ({
                  key: opt.id,
                  icon: opt.icon,
                  title: `@${opt.display}`,
                  description: opt.description,
                  selected: i === popoverIndex,
                  onClick: () => handleAtSelect(opt),
                }))}
              />
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={hasTerminals ? "Message, /command, or @mention..." : "Open a terminal to start chatting..."}
              rows={1}
              disabled={!hasTerminals}
              className={`flex-1 bg-transparent text-sm placeholder-text-weaker resize-none focus:outline-none min-h-[24px] max-h-[120px] font-sans ${hasTerminals ? "text-text-strong" : "text-text-weaker cursor-not-allowed"}`}
            />
            {streaming ? (
              <button
                onClick={handleStop}
                className="p-1.5 rounded-lg bg-status-error/15 hover:bg-status-error/25 text-status-error transition-colors shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!hasTerminals || (!input.trim() && quotes.length === 0 && images.length === 0)}
                className="p-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Control bar */}
        <ControlBar />
      </div>
    </div>
  )
}
