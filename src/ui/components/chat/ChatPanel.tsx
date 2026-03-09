import { useState, useRef, useEffect } from "react"
import { useSessionStore, type Message, type Session } from "../../stores/session"
import { useSettingsStore } from "../../stores/settings"
import { useContainerStore } from "../../stores/container"
import { useTerminalStore } from "../../stores/terminal"
import {
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  Square,
  Plus,
  History,
  X,
  Trash2,
  MessageSquare,
} from "lucide-react"

interface Props {
  projectId: string
}

export function ChatPanel({ projectId }: Props) {
  const {
    activeSessionId,
    createSession,
    setActiveSession,
    addMessage,
    updateMessageContent,
    getActiveMessages,
    getActiveSession,
    getProjectSessions,
    deleteSession,
    startNewChat,
  } = useSessionStore()

  const { activeModel, activeProvider, activeMode, getActiveProvider } =
    useSettingsStore()
  const container = useContainerStore((s) => s.getActiveContainer())
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)

  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgIdRef = useRef<string | null>(null)

  const messages = getActiveMessages()
  const activeSession = getActiveSession()
  const sessions = getProjectSessions(projectId)

  // Auto-scroll on new messages
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
      // Create session if needed, then add error message
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

    // Create session on first message if none active
    let sid = activeSessionId
    if (!sid) {
      const s = createSession(projectId)
      sid = s.id
    }

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      createdAt: Date.now(),
    }
    addMessage(sid, userMessage)
    setInput("")

    // Get updated messages for API call
    const currentSession = useSessionStore
      .getState()
      .sessions.find((s) => s.id === sid)
    const apiMessages = (currentSession?.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Add placeholder assistant message
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
          containerName: container?.name,
          activeTerminalId,
          mode: activeMode,
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

  return (
    <div className="h-full flex flex-col bg-surface-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-weak shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs text-text-strong font-sans font-medium">
            AI Assistant
          </span>
          {streaming && (
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => startNewChat(projectId)}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5 text-text-weaker" />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded transition-colors ${
              showHistory
                ? "bg-surface-2 text-text-strong"
                : "hover:bg-surface-2 text-text-weaker"
            }`}
            title="Chat history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-text-weaker truncate max-w-[100px] font-mono ml-1">
            {activeModel}
          </span>
        </div>
      </div>

      {/* History drawer */}
      {showHistory && (
        <SessionHistory
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={(id) => {
            setActiveSession(id)
            setShowHistory(false)
          }}
          onDelete={deleteSession}
          onNewChat={() => {
            startNewChat(projectId)
            setShowHistory(false)
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={
                streaming && msg.id === streamingMsgIdRef.current && msg.content === ""
              }
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border-weak shrink-0">
        {activeSession && (
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <MessageSquare className="w-3 h-3 text-text-weaker shrink-0" />
            <span className="text-[10px] text-text-weaker truncate font-sans">
              {activeSession.title}
            </span>
          </div>
        )}
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
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-text-weaker font-sans">
            Shift+Enter for new line
          </span>
          <span className="text-[10px] text-text-weaker font-sans">
            {activeProvider}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Session history drawer ──────────────────────────────────

function SessionHistory({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onNewChat,
  onClose,
}: {
  sessions: Session[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNewChat: () => void
  onClose: () => void
}) {
  return (
    <div className="border-b border-border-weak bg-surface-1/50 shrink-0 max-h-[50%] overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-weak/50">
        <span className="text-[10px] text-text-weaker uppercase tracking-wider font-sans">
          Chat History
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewChat}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-accent hover:bg-accent/10 rounded transition-colors font-sans"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-surface-2 transition-colors"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="p-4 text-center text-xs text-text-weaker font-sans">
          No conversations yet
        </div>
      ) : (
        <div className="py-1">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId
            const msgCount = session.messages.length
            const timeAgo = formatTimeAgo(session.updatedAt)

            return (
              <div
                key={session.id}
                onClick={() => onSelect(session.id)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-text-weak hover:bg-surface-2 hover:text-text-base"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate font-sans">
                    {session.title}
                  </div>
                  <div className="text-[10px] text-text-weaker font-sans">
                    {msgCount} msg{msgCount !== 1 ? "s" : ""} · {timeAgo}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(session.id)
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-3 transition-all shrink-0"
                >
                  <Trash2 className="w-3 h-3 text-text-weaker hover:text-status-error" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Utilities ───────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <Bot className="w-8 h-8 text-text-weaker mb-3" />
      <p className="text-sm text-text-weak mb-1 font-sans">Ready to assist</p>
      <p className="text-xs text-text-weaker max-w-[200px] font-sans">
        Ask me to run commands, scan targets, or analyze results in your Exegol
        container
      </p>
    </div>
  )
}
