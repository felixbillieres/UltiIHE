import { useState, useRef, useEffect } from "react"
import { useSessionStore, type Message } from "../../stores/session"
import {
  useSettingsStore,
  PROVIDER_CATALOG,
  AGENTS,
  type AgentId,
  type ThinkingEffort,
} from "../../stores/settings"
import { useProjectStore } from "../../stores/project"
import { useTerminalStore } from "../../stores/terminal"
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
} from "lucide-react"

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

  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgIdRef = useRef<string | null>(null)

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
    if (!input.trim() || streaming) return

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

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
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
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
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
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const currentContent =
          useSessionStore
            .getState()
            .sessions.find((s) => s.id === sid)
            ?.messages.find((m) => m.id === assistantId)?.content || ""
        updateMessageContent(
          sid!,
          assistantId,
          currentContent || `Error: ${(err as Error).message}`,
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

  function handleKeyDown(e: React.KeyboardEvent) {
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

      {/* Input area */}
      <div className="shrink-0 border-t border-border-weak">
        {/* Editor */}
        <div className="p-3">
          <div className="flex items-end gap-2 bg-surface-1 border border-border-base rounded-lg p-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the AI agent..."
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
                disabled={!input.trim()}
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

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          isUser ? "bg-accent/20" : "bg-surface-2"
        }`}
      >
        {isUser ? (
          <User className="w-3 h-3 text-accent" />
        ) : (
          <Bot className="w-3 h-3 text-text-weak" />
        )}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block text-sm leading-relaxed whitespace-pre-wrap break-words font-sans ${
            isUser
              ? "bg-accent/8 text-text-strong px-3 py-2 rounded-lg rounded-tr-sm max-w-[85%]"
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
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const match = part.match(/```(\w+)?\n?([\s\S]*?)```/)
          const code = match?.[2] || part.slice(3, -3)
          return (
            <pre
              key={i}
              className="my-2 p-3 rounded-lg bg-surface-1 border border-border-weak overflow-x-auto"
            >
              <code className="text-xs font-mono text-text-strong">
                {code.trim()}
              </code>
            </pre>
          )
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1 py-0.5 rounded bg-surface-2 text-xs font-mono text-accent"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
