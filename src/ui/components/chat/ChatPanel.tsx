import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useSessionStore, type Message } from "../../stores/session"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  AGENTS,
  type AgentId,
  type ThinkingEffort,
} from "../../stores/settings"
import { useCommandApprovalStore, type PendingCommand } from "../../stores/commandApproval"
import { useToolApprovalStore, type PendingToolCall } from "../../stores/toolApproval"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useProjectStore } from "../../stores/project"
import { useTerminalStore } from "../../stores/terminal"
import { useChatContextStore, type TerminalQuote } from "../../stores/chatContext"
import {
  Send,
  Bot,
  User,
  Loader2,
  Square,
  ChevronDown,
  Brain,
  Eye,
  Wrench,
  Zap,
  AlertTriangle,
  Terminal,
  FileText,
  Scan,
  Swords,
  ClipboardList,
  Hash,
  X,
} from "lucide-react"

// ─── Slash commands & @ mentions definitions ─────────────────

interface SlashCommand {
  id: string
  trigger: string
  title: string
  description: string
  icon: React.ReactNode
  action: (ctx: SlashContext) => void
}

interface AtOption {
  type: "agent" | "terminal"
  id: string
  display: string
  description?: string
  icon: React.ReactNode
}

interface SlashContext {
  setInput: (text: string) => void
  setAgent: (agent: AgentId) => void
  cycleThinkingEffort: () => void
}

function useSlashCommands(): SlashCommand[] {
  return useMemo(
    () => [
      {
        id: "scan",
        trigger: "scan",
        title: "Scan target",
        description: "Run nmap/nuclei scan on a target",
        icon: <Scan className="w-3.5 h-3.5" />,
        action: (ctx) => ctx.setInput("/scan "),
      },
      {
        id: "recon",
        trigger: "recon",
        title: "Recon mode",
        description: "Switch to recon agent for reconnaissance",
        icon: <Scan className="w-3.5 h-3.5 text-cyan-400" />,
        action: (ctx) => {
          ctx.setAgent("recon")
          ctx.setInput("")
        },
      },
      {
        id: "exploit",
        trigger: "exploit",
        title: "Exploit mode",
        description: "Switch to exploit agent",
        icon: <Swords className="w-3.5 h-3.5 text-red-400" />,
        action: (ctx) => {
          ctx.setAgent("exploit")
          ctx.setInput("")
        },
      },
      {
        id: "report",
        trigger: "report",
        title: "Report mode",
        description: "Switch to report agent (read-only)",
        icon: <ClipboardList className="w-3.5 h-3.5 text-purple-400" />,
        action: (ctx) => {
          ctx.setAgent("report")
          ctx.setInput("")
        },
      },
      {
        id: "build",
        trigger: "build",
        title: "Build mode",
        description: "Switch to primary build agent",
        icon: <Bot className="w-3.5 h-3.5 text-accent" />,
        action: (ctx) => {
          ctx.setAgent("build")
          ctx.setInput("")
        },
      },
      {
        id: "think",
        trigger: "think",
        title: "Toggle thinking",
        description: "Cycle thinking effort (off → low → medium → high)",
        icon: <Brain className="w-3.5 h-3.5" />,
        action: (ctx) => {
          ctx.cycleThinkingEffort()
          ctx.setInput("")
        },
      },
      {
        id: "clear",
        trigger: "clear",
        title: "Clear chat",
        description: "Start a new session",
        icon: <Hash className="w-3.5 h-3.5" />,
        action: (ctx) => ctx.setInput(""),
      },
    ],
    [],
  )
}

function useAtOptions(): AtOption[] {
  const terminals = useTerminalStore((s) => s.terminals)

  return useMemo(() => {
    const agents: AtOption[] = AGENTS.map((a) => ({
      type: "agent" as const,
      id: a.id,
      display: a.name,
      description: a.description,
      icon: (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: a.color }}
        />
      ),
    }))

    const terms: AtOption[] = terminals.map((t) => ({
      type: "terminal" as const,
      id: t.id,
      display: t.name,
      description: `Terminal output`,
      icon: <Terminal className="w-3.5 h-3.5 text-text-weaker" />,
    }))

    return [...agents, ...terms]
  }, [terminals])
}

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
    getActiveModelInfo,
  } = useSettingsStore()

  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  )
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

  async function handleSend() {
    if (streaming) return
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

      // If stream completed but produced no content
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
        // Always append error, even if there's partial content
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

  // Detect slash commands and @ mentions on input change
  function handleInputChange(value: string) {
    setInput(value)

    // Slash command: starts with "/"
    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      setPopover("slash")
      setPopoverFilter(slashMatch[1])
      setPopoverIndex(0)
      return
    }

    // @ mention: "@" followed by optional filter
    const atMatch = value.match(/@(\S*)$/)
    if (atMatch) {
      setPopover("at")
      setPopoverFilter(atMatch[1])
      setPopoverIndex(0)
      return
    }

    // Close popover otherwise
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
      // Remove the @query from input
      setInput(input.replace(/@\S*$/, ""))
    } else if (option.type === "terminal") {
      // Insert @terminal reference into input
      setInput(input.replace(/@\S*$/, `@${option.display} `))
    }
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Popover navigation
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

      {/* Permission banners — command + tool approval */}
      {/* Approval banners — show both queues, commands first then tools */}
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
              placeholder="Message, /command, or @mention..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-text-strong placeholder-text-weaker resize-none focus:outline-none min-h-[24px] max-h-[120px] font-sans"
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
                disabled={!input.trim() && quotes.length === 0}
                className="p-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Control bar — OpenCode-style */}
        <ControlBar />
      </div>
    </div>
  )
}

// ─── Control bar ──────────────────────────────────────────────

function ControlBar() {
  const {
    activeAgent,
    activeModel,
    activeProvider,
    thinkingEffort,
    cycleAgent,
    cycleThinkingEffort,
    setActiveModel,
    setActiveProvider,
    getActiveModelInfo,
  } = useSettingsStore()

  const modelInfo = getActiveModelInfo()
  const agentInfo = AGENTS.find((a) => a.id === activeAgent)

  const [showModelPicker, setShowModelPicker] = useState(false)

  // Short model name for display
  const modelDisplayName = modelInfo?.name || activeModel.split("/").pop() || activeModel

  return (
    <div className="px-3 pb-2 flex items-center gap-2 min-w-0">
      {/* Agent selector */}
      <button
        onClick={cycleAgent}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors shrink-0"
        title={`Agent: ${agentInfo?.name} — Click to cycle\n${agentInfo?.description}`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${agentColorBg(activeAgent)}`}
        />
        <span className="text-xs font-sans font-medium text-text-base capitalize">
          {agentInfo?.name || activeAgent}
        </span>
      </button>

      <Separator />

      {/* Model selector */}
      <div className="relative min-w-0 flex-1">
        <button
          onClick={() => setShowModelPicker(!showModelPicker)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors min-w-0 max-w-full"
          title={`Model: ${modelDisplayName}\nProvider: ${activeProvider}`}
        >
          <span className="text-xs font-sans text-text-weak truncate">
            {modelDisplayName}
          </span>
          <ChevronDown className="w-3 h-3 text-text-weaker shrink-0" />
        </button>

        {showModelPicker && (
          <ModelPicker
            currentProvider={activeProvider}
            currentModel={activeModel}
            onSelect={(providerId, modelId) => {
              setActiveProvider(providerId)
              setActiveModel(modelId)
              setShowModelPicker(false)
            }}
            onClose={() => setShowModelPicker(false)}
          />
        )}
      </div>

      {/* Capabilities badges */}
      <div className="flex items-center gap-1 shrink-0">
        {modelInfo?.reasoning && (
          <CapBadge
            icon={<Brain className="w-3 h-3" />}
            label={thinkingEffort !== "off" ? thinkingEffort : "think"}
            active={thinkingEffort !== "off"}
            onClick={cycleThinkingEffort}
            title="Thinking effort — Click to cycle (off > low > medium > high)"
          />
        )}
        {modelInfo?.vision && (
          <CapBadge
            icon={<Eye className="w-3 h-3" />}
            label="vision"
            active
          />
        )}
        {modelInfo?.toolCalling && (
          <CapBadge
            icon={<Wrench className="w-3 h-3" />}
            label="tools"
            active
          />
        )}
      </div>
    </div>
  )
}

// ─── Capability badge ─────────────────────────────────────────

function CapBadge({
  icon,
  label,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick?: () => void
  title?: string
}) {
  const Tag = onClick ? "button" : "span"
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "bg-surface-2 text-text-weaker"
      } ${onClick ? "cursor-pointer hover:bg-accent/15" : ""}`}
    >
      {icon}
      {label}
    </Tag>
  )
}

// ─── Model picker dropdown ────────────────────────────────────

function ModelPicker({
  currentProvider,
  currentModel,
  onSelect,
  onClose,
}: {
  currentProvider: string
  currentModel: string
  onSelect: (providerId: string, modelId: string) => void
  onClose: () => void
}) {
  const providers = useSettingsStore((s) => s.providers)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [onClose])

  // Only show providers that have API keys configured
  const configuredProviderIds = new Set(
    providers.filter((p) => p.apiKey).map((p) => p.id),
  )

  const availableProviders = PROVIDER_CATALOG.filter((p) =>
    configuredProviderIds.has(p.id),
  )

  if (availableProviders.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute bottom-full left-0 mb-1 z-50 w-64 bg-surface-2 border border-border-base rounded-lg shadow-xl p-3"
      >
        <p className="text-xs text-text-weaker font-sans">
          No providers configured. Go to Settings to add an API key.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 z-50 w-72 max-h-[300px] overflow-y-auto bg-surface-2 border border-border-base rounded-lg shadow-xl py-1"
    >
      {availableProviders.map((provider) => (
        <div key={provider.id}>
          <div className="px-3 py-1.5 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium">
            {provider.name}
          </div>
          {provider.models.map((model) => {
            const isSelected =
              provider.id === currentProvider && model.id === currentModel
            return (
              <button
                key={model.id}
                onClick={() => onSelect(provider.id, model.id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent"
                    : "text-text-base hover:bg-surface-3"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-sans truncate">{model.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-weaker font-mono">
                      {(model.contextWindow / 1000).toFixed(0)}k ctx
                    </span>
                    {model.reasoning && (
                      <span className="text-[10px] text-purple-400">
                        reasoning
                      </span>
                    )}
                    {model.vision && (
                      <span className="text-[10px] text-blue-400">vision</span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <Zap className="w-3 h-3 text-accent shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Context quotes (terminal snippets) ──────────────────────

function ContextQuotes({
  quotes,
  onRemove,
  onClear,
}: {
  quotes: TerminalQuote[]
  onRemove: (id: string) => void
  onClear: () => void
}) {
  return (
    <div className="px-3 pt-2 space-y-1.5">
      {quotes.map((q) => (
        <ContextQuoteItem key={q.id} quote={q} onRemove={onRemove} />
      ))}
      {quotes.length > 1 && (
        <button
          onClick={onClear}
          className="text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans px-1"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

function ContextQuoteItem({
  quote: q,
  onRemove,
}: {
  quote: TerminalQuote
  onRemove: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border-weak bg-surface-1 overflow-hidden">
      {/* Header — always visible, clickable to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-surface-2 transition-colors group"
      >
        <ChevronDown
          className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${
            expanded ? "" : "-rotate-90"
          }`}
        />
        <Terminal className="w-3 h-3 text-cyan-400 shrink-0" />
        <span className="text-[11px] text-text-weak font-sans truncate">
          {q.terminalName}
        </span>
        <span className="text-[10px] text-text-weaker font-sans shrink-0">
          {q.lineCount === 1 ? "1 line" : `${q.lineCount} lines`}
        </span>
        {q.comment && (
          <span className="text-[10px] text-accent font-sans truncate ml-auto mr-1">
            "{q.comment}"
          </span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRemove(q.id)
          }}
          className="p-0.5 rounded hover:bg-surface-3 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          <X className="w-2.5 h-2.5 text-text-weaker" />
        </span>
      </button>

      {/* Expandable snippet */}
      {expanded && (
        <div className="border-t border-border-weak">
          {q.comment && (
            <div className="px-2.5 py-1.5 text-[11px] text-accent font-sans bg-accent/5 border-b border-border-weak">
              {q.comment}
            </div>
          )}
          <pre className="px-2.5 py-2 text-[11px] font-mono text-text-base overflow-x-auto max-h-[160px] overflow-y-auto scrollbar-none leading-relaxed">
            {q.text}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Command popover ─────────────────────────────────────────

function CommandPopover({
  items,
}: {
  items: {
    key: string
    icon: React.ReactNode
    title: string
    description?: string
    selected: boolean
    onClick: () => void
  }[]
}) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [items.find((i) => i.selected)?.key])

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-[240px] overflow-y-auto bg-surface-2 border border-border-base rounded-lg shadow-xl py-1">
      {items.map((item) => (
        <button
          key={item.key}
          ref={item.selected ? selectedRef : undefined}
          onClick={item.onClick}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            item.selected
              ? "bg-accent/10 text-accent"
              : "text-text-base hover:bg-surface-3"
          }`}
        >
          <span className="shrink-0 w-5 h-5 flex items-center justify-center">
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-sans font-medium">{item.title}</span>
            {item.description && (
              <span className="ml-2 text-[10px] text-text-weaker font-sans">
                {item.description}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────

function Separator() {
  return <div className="w-px h-4 bg-border-weak shrink-0" />
}

function agentColorBg(agent: AgentId): string {
  switch (agent) {
    case "build":
      return "bg-accent"
    case "recon":
      return "bg-cyan-400"
    case "exploit":
      return "bg-red-400"
    case "report":
      return "bg-purple-400"
    default:
      return "bg-text-weaker"
  }
}

// ─── Message bubble ──────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message
  isStreaming: boolean
}) {
  const isUser = message.role === "user"
  const isError = !isUser && message.content.startsWith("⚠️")

  // Parse terminal context blocks from user messages
  const parsed = isUser ? parseTerminalBlocks(message.content) : null

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-accent/20"
            : isError
              ? "bg-status-error/15"
              : "bg-surface-2"
        }`}
      >
        {isUser ? (
          <User className="w-3 h-3 text-accent" />
        ) : isError ? (
          <AlertTriangle className="w-3 h-3 text-status-error" />
        ) : (
          <Bot className="w-3 h-3 text-text-weak" />
        )}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {isUser && parsed && parsed.terminals.length > 0 ? (
          <div className="inline-flex flex-col gap-2 max-w-[85%] items-end">
            {parsed.terminals.map((t, i) => (
              <TerminalContextBlock key={i} block={t} />
            ))}
            {parsed.text && (
              <div className="bg-accent/8 text-text-strong px-3 py-2 rounded-lg rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words font-sans text-left w-full">
                <InlineMarkdown text={parsed.text} />
              </div>
            )}
          </div>
        ) : (
          <div
            className={`inline-block text-sm leading-relaxed whitespace-pre-wrap break-words font-sans ${
              isUser
                ? "bg-accent/8 text-text-strong px-3 py-2 rounded-lg rounded-tr-sm max-w-[85%]"
                : isError
                  ? "bg-status-error/8 border border-status-error/20 text-status-error px-3 py-2 rounded-lg max-w-[95%]"
                  : "text-text-base"
            }`}
          >
            {isStreaming ? (
              <span className="inline-flex items-center gap-1 text-text-weaker">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking...
              </span>
            ) : (
              <MarkdownContent content={message.content} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface TerminalBlock {
  name: string
  lines: string
  comment?: string
  content: string
}

function parseTerminalBlocks(raw: string): { terminals: TerminalBlock[]; text: string } {
  const terminals: TerminalBlock[] = []
  const remaining = raw.replace(
    /<terminal name="([^"]*)" lines="([^"]*)">\n?(?:User comment: ([^\n]*)\n)?([\s\S]*?)\n?<\/terminal>/g,
    (_, name, lines, comment, content) => {
      terminals.push({ name, lines, comment: comment?.trim(), content: content.trim() })
      return ""
    },
  )
  return { terminals, text: remaining.trim() }
}

function TerminalContextBlock({ block }: { block: TerminalBlock }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="w-full rounded-lg border border-border-weak bg-surface-1 overflow-hidden text-left">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2/50 transition-colors"
      >
        <div className="w-4 h-4 rounded bg-cyan-400/15 flex items-center justify-center shrink-0">
          <Terminal className="w-2.5 h-2.5 text-cyan-400" />
        </div>
        <span className="text-[11px] text-text-weak font-sans flex-1 text-left truncate">
          <span className="text-cyan-400 font-medium">{block.name}</span>
          <span className="text-text-weaker ml-1.5">{block.lines} lines</span>
        </span>
        {block.comment && (
          <span className="text-[11px] text-text-base font-sans truncate max-w-[180px]">
            {block.comment}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border-weak">
          {block.comment && (
            <div className="px-3 py-1.5 bg-accent/5 border-b border-border-weak">
              <span className="text-[11px] text-accent font-sans">{block.comment}</span>
            </div>
          )}
          <pre className="px-3 py-2 text-[11px] font-mono text-text-weak leading-relaxed max-h-[200px] overflow-y-auto overflow-x-auto scrollbar-thin bg-[#101010]">
            {block.content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Permission Banner (OpenCode style) ─────────────────────

function PermissionBanner({
  command,
  queueSize,
  onAllowOnce,
  onAllowAlways,
  onDeny,
}: {
  command: PendingCommand
  queueSize: number
  onAllowOnce: () => void
  onAllowAlways: () => void
  onDeny: () => void
}) {
  // Strip trailing newline (real or literal \n) for display
  const displayCmd = command.command.replace(/\\n/g, "\n").replace(/\n+$/, "")

  return (
    <div className="shrink-0 border-t border-status-warning/30 bg-surface-1">
      {/* Content */}
      <div className="px-4 pt-3 pb-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
          <span className="text-sm font-medium text-text-strong font-sans">
            Permission required
          </span>
          {queueSize > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-weaker font-sans">
              +{queueSize - 1} more
            </span>
          )}
        </div>

        {/* Description */}
        <div className="ml-6 mb-2">
          <span className="text-xs text-text-weak font-sans">
            Execute command in{" "}
            <span className="text-cyan-400 font-medium">{command.terminalName}</span>
          </span>
        </div>

        {/* Command */}
        <div className="ml-6 rounded-lg bg-[#101010] border border-border-weak overflow-hidden">
          <pre className="px-3 py-2.5 text-xs font-mono text-text-base leading-relaxed overflow-x-auto max-h-[120px] overflow-y-auto scrollbar-thin">
            <span className="text-text-weaker select-none">$ </span>
            {displayCmd}
          </pre>
        </div>
      </div>

      {/* Buttons — exactly like OpenCode: Deny | Allow always | Allow once */}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-weak bg-surface-0/50">
        <button
          onClick={onDeny}
          className="text-xs font-sans text-text-weak hover:text-text-base transition-colors px-3 py-1.5"
        >
          Deny
        </button>
        <button
          onClick={onAllowAlways}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg border border-border-base text-text-base hover:bg-surface-2 transition-colors"
        >
          Allow always
        </button>
        <button
          onClick={onAllowOnce}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg bg-text-strong text-surface-0 hover:opacity-90 transition-opacity"
        >
          Allow once
        </button>
      </div>
    </div>
  )
}

// ─── Tool permission banner ──────────────────────────────────

/** Build a single-line human-readable summary for a tool call. */
function toolSummary(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "web_search":
      return `web_search("${args.query || ""}")`
    case "web_fetch":
      return `web_fetch(${args.url || ""})`
    case "file_write":
      return `file_write(${args.container}:${args.filePath})`
    case "file_edit":
      return `file_edit(${args.container}:${args.filePath})`
    case "todo_write":
      return `todo_write(${Array.isArray(args.todos) ? args.todos.length : 0} items)`
    case "terminal_create":
      return `terminal_create("${args.name || "unnamed"}", container: ${args.container || "?"})`
    default:
      return `${name}()`
  }
}

function ToolPermissionBanner({
  tool,
  queueSize,
  onAllowOnce,
  onAllowAlways,
  onDeny,
}: {
  tool: PendingToolCall
  queueSize: number
  onAllowOnce: () => void
  onAllowAlways: () => void
  onDeny: () => void
}) {
  return (
    <div className="shrink-0 border-t border-status-warning/30 bg-surface-1">
      <div className="px-4 pt-3 pb-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
          <span className="text-sm font-medium text-text-strong font-sans">
            Permission required
          </span>
          {queueSize > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-weaker font-sans">
              +{queueSize - 1} more
            </span>
          )}
        </div>

        {/* Description */}
        <div className="ml-6 mb-2">
          <span className="text-xs text-text-weak font-sans">
            {tool.description}
          </span>
        </div>

        {/* Tool call — same style as command code block */}
        <div className="ml-6 rounded-lg bg-[#101010] border border-border-weak overflow-hidden">
          <pre className="px-3 py-2.5 text-xs font-mono text-text-base leading-relaxed overflow-x-auto">
            <span className="text-text-weaker select-none">{">"} </span>
            {toolSummary(tool.toolName, tool.args)}
          </pre>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-weak bg-surface-0/50">
        <button
          onClick={onDeny}
          className="text-xs font-sans text-text-weak hover:text-text-base transition-colors px-3 py-1.5"
        >
          Deny
        </button>
        <button
          onClick={onAllowAlways}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg border border-border-base text-text-base hover:bg-surface-2 transition-colors"
        >
          Allow always
        </button>
        <button
          onClick={onAllowOnce}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg bg-text-strong text-surface-0 hover:opacity-90 transition-opacity"
        >
          Allow once
        </button>
      </div>
    </div>
  )
}

// ─── Markdown rendering ──────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  // Split on code blocks first
  const codeBlocks = content.split(/(```[\s\S]*?```)/g)

  return (
    <>
      {codeBlocks.map((block, bi) => {
        if (block.startsWith("```")) {
          const match = block.match(/```(\w+)?\n?([\s\S]*?)```/)
          const code = match?.[2] || block.slice(3, -3)
          return (
            <pre
              key={bi}
              className="my-2 p-3 rounded-lg bg-surface-1 border border-border-weak overflow-x-auto"
            >
              <code className="text-xs font-mono text-text-strong">
                {code.trim()}
              </code>
            </pre>
          )
        }
        // Process line-level markdown (headers, bullets) then inline
        return <MarkdownLines key={bi} text={block} />
      })}
    </>
  )
}

function MarkdownLines({ text }: { text: string }) {
  const lines = text.split("\n")
  const result: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []

  function flushList() {
    if (listItems.length > 0) {
      result.push(
        <ul key={`ul-${result.length}`} className="my-1 ml-4 space-y-0.5 list-disc list-outside">
          {listItems}
        </ul>,
      )
      listItems = []
    }
  }

  lines.forEach((line, li) => {
    // Headers
    const h3Match = line.match(/^###\s+(.+)/)
    if (h3Match) {
      flushList()
      result.push(
        <div key={li} className="font-semibold text-text-strong text-xs mt-2 mb-0.5">
          <InlineText text={h3Match[1]} />
        </div>,
      )
      return
    }
    const h2Match = line.match(/^##\s+(.+)/)
    if (h2Match) {
      flushList()
      result.push(
        <div key={li} className="font-semibold text-text-strong mt-2 mb-0.5">
          <InlineText text={h2Match[1]} />
        </div>,
      )
      return
    }
    const h1Match = line.match(/^#\s+(.+)/)
    if (h1Match) {
      flushList()
      result.push(
        <div key={li} className="font-bold text-text-strong text-base mt-2 mb-1">
          <InlineText text={h1Match[1]} />
        </div>,
      )
      return
    }

    // Bullet lists (- or * at start, with optional indentation)
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)/)
    if (bulletMatch) {
      listItems.push(
        <li key={li} className="text-text-base" style={{ marginLeft: bulletMatch[1].length > 0 ? 16 : 0 }}>
          <InlineText text={bulletMatch[2]} />
        </li>,
      )
      return
    }

    // Numbered lists
    const numMatch = line.match(/^(\s*)\d+[.)]\s+(.+)/)
    if (numMatch) {
      flushList()
      result.push(
        <div key={li} className="ml-4" style={{ marginLeft: numMatch[1].length > 0 ? 32 : 16 }}>
          <InlineText text={line.trimStart()} />
        </div>,
      )
      return
    }

    // Regular line
    flushList()
    if (line.trim() === "") {
      result.push(<div key={li} className="h-2" />)
    } else {
      result.push(
        <span key={li}>
          <InlineText text={line} />
          {li < lines.length - 1 && "\n"}
        </span>,
      )
    }
  })

  flushList()
  return <>{result}</>
}

function InlineText({ text }: { text: string }) {
  // Split on inline code first, then process markdown
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="px-1 py-0.5 rounded bg-surface-2 text-xs font-mono text-accent">
              {part.slice(1, -1)}
            </code>
          )
        }
        return <InlineMarkdown key={i} text={part} />
      })}
    </>
  )
}

function InlineMarkdown({ text }: { text: string }) {
  // Match **bold** (allowing special chars inside), *italic*, [links](url)
  const parts = text.split(/(\*\*(?:(?!\*\*).)+\*\*|\*(?:(?!\*).)+\*|\[[^\]]+\]\([^)]+\))/g)
  return (
    <>
      {parts.map((seg, i) => {
        if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) {
          return <strong key={i} className="font-semibold text-text-strong">{seg.slice(2, -2)}</strong>
        }
        if (seg.startsWith("*") && seg.endsWith("*") && !seg.startsWith("**") && seg.length > 2) {
          return <em key={i}>{seg.slice(1, -1)}</em>
        }
        const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (linkMatch) {
          return (
            <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {linkMatch[1]}
            </a>
          )
        }
        return <span key={i}>{seg}</span>
      })}
    </>
  )
}
