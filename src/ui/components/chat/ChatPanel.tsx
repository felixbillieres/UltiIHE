import { useState, useRef, useEffect } from "react"
import { useSessionStore } from "../../stores/session"
import { useSettingsStore } from "../../stores/settings"
import { useContainerStore } from "../../stores/container"
import { useTerminalStore } from "../../stores/terminal"
import { Send, Bot, User, Sparkles, Loader2, Square } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

interface Props {
  projectId: string
}

export function ChatPanel({ projectId }: Props) {
  const { activeSessionId, createSession, setActiveSession, updateSession } =
    useSessionStore()
  const { activeModel, activeProvider, getActiveProvider } = useSettingsStore()
  const container = useContainerStore((s) => s.getActiveContainer())
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "No API key configured. Go to Settings > Providers to connect a provider.",
        },
      ])
      return
    }

    // Create session on first message
    if (!activeSessionId) {
      const session = createSession(projectId, input.trim().slice(0, 60))
      setActiveSession(session.id)
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput("")

    // Streaming AI response
    setStreaming(true)
    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ])

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          providerId: activeProvider,
          modelId: activeModel,
          apiKey: provider.apiKey,
          containerName: container?.name,
          activeTerminalId,
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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent } : m,
          ),
        )
      }

      // Update session message count
      if (activeSessionId) {
        updateSession(activeSessionId, {
          messageCount: newMessages.length + 1,
        })
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `Error: ${(err as Error).message}`,
                }
              : m,
          ),
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-weak shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs text-text-strong font-sans font-medium">AI Assistant</span>
          {streaming && (
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
          )}
        </div>
        <span className="text-[10px] text-text-weaker truncate max-w-[120px] font-mono">
          {activeModel}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} streaming={streaming} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border-weak shrink-0">
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
          <span className="text-[10px] text-text-weaker font-sans">{activeProvider}</span>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  streaming,
}: {
  message: Message
  streaming: boolean
}) {
  const isUser = message.role === "user"
  const isStreaming =
    !isUser && streaming && message.content === ""

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
      <div
        className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}
      >
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
  // Simple markdown: code blocks, inline code, bold
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
