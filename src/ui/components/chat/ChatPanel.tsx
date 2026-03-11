import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useSessionStore, type Message, type MessagePart, type ToolCallPart, type ReasoningPart } from "../../stores/session"
import { useSettingsStore, type AgentId } from "../../stores/settings"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { useToolApprovalStore } from "../../stores/toolApproval"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useProjectStore } from "../../stores/project"
import { useTerminalStore } from "../../stores/terminal"
import { useChatContextStore } from "../../stores/chatContext"
import { useContextStore } from "../../stores/context"
import { useLocalAIStore } from "../../stores/localAI"
import { useAutoScroll } from "../../hooks/useAutoScroll"
import { Send, Bot, Loader2, Square, ArrowDown } from "lucide-react"
import { toast } from "sonner"

import { useSlashCommands, useAtOptions, type SlashCommand, type AtOption } from "./chatCommands"
import { ControlBar } from "./ControlBar"
import { ContextQuotes } from "./ContextQuotes"
import { CommandPopover } from "./CommandPopover"
import { MessageBubble } from "./MessageBubble"
import { PermissionBanner, ToolPermissionBanner } from "./PermissionBanners"
import { FileApprovalBanner } from "./FileApprovalBanner"

// ── SSE parser ────────────────────────────────────────────────

interface SSEEvent {
  event: string
  data: any
}

class SSEParser {
  private buffer = ""

  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk
    const events: SSEEvent[] = []
    const parts = this.buffer.split("\n\n")
    this.buffer = parts.pop() || ""

    for (const part of parts) {
      if (!part.trim()) continue
      let event = ""
      let data = ""
      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7)
        else if (line.startsWith("data: ")) data = line.slice(6)
      }
      if (event && data) {
        try {
          events.push({ event, data: JSON.parse(data) })
        } catch {}
      }
    }
    return events
  }
}

// ── Component ────────────────────────────────────────────────

interface Props {
  projectId: string
}

export function ChatPanel({ projectId }: Props) {
  const {
    activeSessionId,
    createSession,
    addMessage,
    updateMessage,
    updateMessageContent,
    renameSession,
    getActiveMessages,
    getActiveSession,
  } = useSessionStore()

  const {
    activeModel,
    activeProvider,
    activeMode,
    activeAgent,
    thinkingEffort,
    getActiveProvider,
  } = useSettingsStore()

  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  )
  const terminals = useTerminalStore((s) => s.terminals)
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)

  const quotes = useChatContextStore((s) => s.quotes)
  const removeQuote = useChatContextStore((s) => s.removeQuote)
  const clearQuotes = useChatContextStore((s) => s.clearQuotes)

  const pendingCommands = useCommandApprovalStore((s) => s.pending)
  const approvalMode = useCommandApprovalStore((s) => s.mode)
  const removePendingCommand = useCommandApprovalStore((s) => s.removePending)
  const setApprovalMode = useCommandApprovalStore((s) => s.setMode)
  const pendingTools = useToolApprovalStore((s) => s.pending)
  const removePendingTool = useToolApprovalStore((s) => s.removePending)
  const { send: wsSend } = useWebSocket()

  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgIdRef = useRef<string | null>(null)

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

  const messages = getActiveMessages()
  const activeSession = getActiveSession()

  // Smart auto-scroll
  const { containerRef, showScrollButton, scrollToBottom, onContentUpdate } =
    useAutoScroll(streaming)

  // Trigger scroll on message changes (for non-streaming updates)
  useEffect(() => {
    onContentUpdate()
  }, [messages.length, onContentUpdate])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px"
    }
  }, [input])

  const hasTerminals = terminals.length > 0

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

  async function handleSend() {
    if (streaming) return
    if (!hasTerminals) return
    if (!input.trim() && quotes.length === 0) return

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
    const userText = input.trim()
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

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      parts: [],
      createdAt: Date.now(),
    }
    addMessage(sid, userMessage)
    setInput("")

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
      const res = await fetch("/api/chat", {
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
          agent: activeAgent,
          thinkingEffort,
        }),
      })

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`
        try {
          const contentType = res.headers.get("content-type") || ""
          if (contentType.includes("json")) {
            const err = await res.json()
            errorMsg = err.error || errorMsg
          } else {
            errorMsg = (await res.text()) || errorMsg
          }
        } catch {}
        throw new Error(errorMsg)
      }

      // Read context metadata from response header
      const contextHeader = res.headers.get("X-Context-Info")
      if (contextHeader) {
        useContextStore.getState().updateFromHeader(contextHeader)
      }

      // Refresh local model status if needed
      if (activeProvider === "local") {
        useLocalAIStore.getState().fetchServerStatus()
      }

      const reader = res.body?.getReader()
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
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      streamingMsgIdRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
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
      setAgent: useSettingsStore.getState().setActiveAgent,
      cycleThinkingEffort: useSettingsStore.getState().cycleThinkingEffort,
    })
    textareaRef.current?.focus()
  }

  function handleAtSelect(option: AtOption) {
    setPopover(null)
    if (option.type === "agent") {
      useSettingsStore.getState().setActiveAgent(option.id as AgentId)
      setInput(input.replace(/@\S*$/, ""))
    } else if (option.type === "terminal") {
      setInput(input.replace(/@\S*$/, `@${option.display} `))
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

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

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
      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4 relative"
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
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={
                streaming &&
                msg.id === streamingMsgIdRef.current &&
                (!msg.parts || msg.parts.length === 0) &&
                msg.content === ""
              }
            />
          ))
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

      {/* Approval banners */}
      {pendingCommands.map((cmd) => (
        <PermissionBanner
          key={`cmd-${cmd.id}`}
          command={cmd}
          queueSize={pendingCommands.length}
          onAllowOnce={() => {
            wsSend({
              type: "command:approve",
              data: { commandId: cmd.id },
            })
            removePendingCommand(cmd.id)
          }}
          onAllowAlways={() => {
            wsSend({
              type: "command:approve",
              data: { commandId: cmd.id, allowAll: true },
            })
            removePendingCommand(cmd.id)
            setApprovalMode("allow-all-session")
            wsSend({ type: "command:set-mode", data: { mode: "allow-all-session" } })
          }}
          onDeny={() => {
            wsSend({
              type: "command:reject",
              data: { commandId: cmd.id },
            })
            removePendingCommand(cmd.id)
          }}
        />
      ))}
      {/* File change approvals */}
      {(() => {
        const FILE_TOOLS = new Set(["file_write", "file_edit", "file_delete", "file_create_dir"])
        const fileTools = pendingTools.filter((t) => FILE_TOOLS.has(t.toolName))
        const otherTools = pendingTools.filter((t) => !FILE_TOOLS.has(t.toolName))
        return (
          <>
            <FileApprovalBanner
              tools={fileTools}
              onApprove={(id) => {
                const t = fileTools.find((f) => f.id === id)
                wsSend({ type: "tool:approve", data: { id } })
                removePendingTool(id)
                toast.success(`Accepted: ${(t?.args.filePath || t?.args.targetPath || t?.args.dirPath || "") as string}`)
              }}
              onApproveAlways={(id) => {
                wsSend({ type: "tool:approve", data: { id, allowAlways: true } })
                removePendingTool(id)
              }}
              onDeny={(id) => {
                const t = fileTools.find((f) => f.id === id)
                wsSend({ type: "tool:reject", data: { id } })
                removePendingTool(id)
                toast.error(`Denied: ${(t?.args.filePath || t?.args.targetPath || t?.args.dirPath || "") as string}`)
              }}
              onApproveAll={() => {
                wsSend({ type: "tool:approve-all", data: { allowAlways: false } })
                for (const t of fileTools) removePendingTool(t.id)
                toast.success(`Accepted all ${fileTools.length} file changes`)
              }}
              onDenyAll={() => {
                wsSend({ type: "tool:reject-all", data: {} })
                for (const t of fileTools) removePendingTool(t.id)
                toast.error(`Denied all ${fileTools.length} file changes`)
              }}
            />
            {otherTools.map((tool) => (
              <ToolPermissionBanner
                key={`tool-${tool.id}`}
                tool={tool}
                queueSize={otherTools.length}
                onAllowOnce={() => {
                  wsSend({ type: "tool:approve", data: { id: tool.id } })
                  removePendingTool(tool.id)
                }}
                onAllowAlways={() => {
                  wsSend({ type: "tool:approve", data: { id: tool.id, allowAlways: true } })
                  removePendingTool(tool.id)
                }}
                onDeny={() => {
                  wsSend({ type: "tool:reject", data: { id: tool.id } })
                  removePendingTool(tool.id)
                }}
              />
            ))}
          </>
        )
      })()}

      {/* Input area */}
      <div className="shrink-0 border-t border-border-weak">
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
                onClick={handleSend}
                disabled={!hasTerminals || (!input.trim() && quotes.length === 0)}
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
