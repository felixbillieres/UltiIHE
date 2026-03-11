import { useState, useRef, useEffect, useMemo } from "react"
import { useSessionStore, type Message } from "../../stores/session"
import { useSettingsStore, type AgentId } from "../../stores/settings"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { useToolApprovalStore } from "../../stores/toolApproval"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useProjectStore } from "../../stores/project"
import { useTerminalStore } from "../../stores/terminal"
import { useChatContextStore } from "../../stores/chatContext"
import { Send, Bot, Loader2, Square } from "lucide-react"

import { useSlashCommands, useAtOptions, type SlashCommand, type AtOption } from "./chatCommands"
import { ControlBar } from "./ControlBar"
import { ContextQuotes } from "./ContextQuotes"
import { CommandPopover } from "./CommandPopover"
import { MessageBubble } from "./MessageBubble"
import { PermissionBanner, ToolPermissionBanner } from "./PermissionBanners"

interface Props {
  projectId: string
}

export function ChatPanel({ projectId }: Props) {
  const {
    activeSessionId,
    createSession,
    addMessage,
    updateMessageContent,
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, messages[messages.length - 1]?.content])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px"
    }
  }, [input])

  const hasTerminals = terminals.length > 0

  async function handleSend() {
    if (streaming) return
    if (!hasTerminals) return
    if (!input.trim() && quotes.length === 0) return

    const provider = getActiveProvider()
    if (!provider?.apiKey) {
      let sid = activeSessionId
      if (!sid) {
        const s = createSession(projectId)
        sid = s.id
      }
      addMessage(sid, {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "No API key configured. Go to Settings > Providers to connect a provider.",
        createdAt: Date.now(),
      })
      return
    }

    let sid = activeSessionId
    if (!sid) {
      const s = createSession(projectId)
      sid = s.id
    }

    // Build message content with terminal context
    const userText = input.trim()
    let messageContent = userText
    if (quotes.length > 0) {
      const contextBlock = quotes
        .map((q) => {
          const commentLine = q.comment
            ? `\nUser comment: ${q.comment}`
            : ""
          return `<terminal name="${q.terminalName}" lines="${q.lineCount}">${commentLine}\n${q.text}\n</terminal>`
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
      createdAt: Date.now(),
    })
    streamingMsgIdRef.current = assistantId

    setStreaming(true)
    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          messages: apiMessages,
          providerId: activeProvider,
          modelId: activeModel,
          apiKey: provider.apiKey,
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

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let fullContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullContent += chunk
        updateMessageContent(sid!, assistantId, fullContent)
      }

      if (!fullContent.trim()) {
        updateMessageContent(
          sid!,
          assistantId,
          "⚠️ **Error:** Empty response from model. The API call may have failed silently.",
        )
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const errMsg = (err as Error).message || "Unknown error"
        const currentContent =
          useSessionStore
            .getState()
            .sessions.find((s) => s.id === sid)
            ?.messages.find((m) => m.id === assistantId)?.content || ""
        const errorDisplay = `\n\n⚠️ **Error:** ${errMsg}`
        updateMessageContent(
          sid!,
          assistantId,
          currentContent ? currentContent + errorDisplay : errorDisplay.trim(),
        )
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                msg.content === ""
              }
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

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
      {pendingTools.map((tool) => (
        <ToolPermissionBanner
          key={`tool-${tool.id}`}
          tool={tool}
          queueSize={pendingTools.length}
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
