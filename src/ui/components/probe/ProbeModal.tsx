import { useState, useRef, useEffect, useCallback } from "react"
import { useProbeStore, type Probe } from "../../stores/probe"
import { useChatContextStore } from "../../stores/chatContext"
import { useSettingsStore } from "../../stores/settings"
import {
  MessageSquare,
  Send,
  MessageSquarePlus,
  Loader2,
  ChevronDown,
  Terminal,
  FileText,
  X,
} from "lucide-react"
import { MarkdownContent } from "../chat/MarkdownContent"

// ─── Selection info passed from parent ────────────────────────

export interface ProbeSelection {
  text: string
  lineCount: number
  startLine?: number
  language?: string
  container?: string
  filePath?: string
}

export interface ProbeContext {
  source: "terminal" | "file"
  sourceId: string
  sourceName: string
  pageKey: string
  selection: ProbeSelection
  // For "Add to chat" — builds the quote
  quoteData:
    | {
        source: "terminal"
        terminalId: string
        terminalName: string
        text: string
        lineCount: number
      }
    | {
        source: "file"
        container: string
        filePath: string
        fileName: string
        language: string
        text: string
        lineCount: number
        startLine?: number
      }
}

interface Props {
  ctx: ProbeContext
  /** Pixel position relative to the container */
  x: number
  y: number
  /** Container dimensions for clamping */
  containerWidth: number
  containerHeight: number
  onClose: () => void
}

export function ProbeModal({
  ctx,
  x,
  y,
  containerWidth,
  containerHeight,
  onClose,
}: Props) {
  const addQuote = useChatContextStore((s) => s.addQuote)
  const createProbe = useProbeStore((s) => s.createProbe)
  const addMessage = useProbeStore((s) => s.addMessage)
  const updateLastAssistant = useProbeStore((s) => s.updateLastAssistant)
  const activeProbeId = useProbeStore((s) => s.activeProbeId)
  const probes = useProbeStore((s) => s.probes)
  const setActiveProbe = useProbeStore((s) => s.setActiveProbe)

  const activeProbe = activeProbeId
    ? probes.find((p) => p.id === activeProbeId)
    : null
  const isInProbeMode = activeProbe && activeProbe.messages.length > 0

  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeProbe?.messages.length, activeProbe?.messages[activeProbe.messages.length - 1]?.content])

  const handleAddToChat = useCallback(() => {
    const comment = input.trim() || undefined
    addQuote({ ...ctx.quoteData, comment })
    onClose()
  }, [input, ctx.quoteData, addQuote, onClose])

  const handleAskAbout = useCallback(async () => {
    const query = input.trim()
    if (!query || streaming) return

    const provider = useSettingsStore.getState().getActiveProvider()
    if (!provider?.apiKey) return

    // Create or reuse probe
    let probeId = activeProbeId
    if (!probeId || !probes.find((p) => p.id === probeId)) {
      const probe = createProbe({
        source: ctx.source,
        sourceId: ctx.sourceId,
        sourceName: ctx.sourceName,
        pageKey: ctx.pageKey,
        selection: ctx.selection,
      })
      probeId = probe.id
    }

    // Add user message
    addMessage(probeId, { role: "user", content: query })
    setInput("")

    // Add empty assistant message for streaming
    addMessage(probeId, { role: "assistant", content: "" })

    setStreaming(true)
    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Build conversation for API
      const currentProbe = useProbeStore
        .getState()
        .probes.find((p) => p.id === probeId)
      const apiMessages = (currentProbe?.messages || [])
        .filter((m) => m.content.trim() !== "")
        .map((m) => ({ role: m.role, content: m.content }))

      const { activeProvider, activeModel } = useSettingsStore.getState()

      const res = await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          messages: apiMessages,
          providerId: activeProvider,
          modelId: activeModel,
          apiKey: provider.apiKey,
          source: ctx.source,
          sourceName: ctx.sourceName,
          selection: ctx.selection,
        }),
      })

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`
        try {
          const ct = res.headers.get("content-type") || ""
          if (ct.includes("json")) {
            const err = await res.json()
            errorMsg = err.error || errorMsg
          }
        } catch {}
        throw new Error(errorMsg)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let full = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        updateLastAssistant(probeId!, full)
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        updateLastAssistant(
          probeId!,
          `⚠️ ${(err as Error).message || "Unknown error"}`,
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [
    input,
    streaming,
    activeProbeId,
    probes,
    ctx,
    createProbe,
    addMessage,
    updateLastAssistant,
  ])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (streaming) {
        abortRef.current?.abort()
      } else {
        onClose()
      }
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (isInProbeMode) {
        handleAskAbout()
      }
      // In initial mode, Enter does nothing — user picks a button
    }
  }

  // ─── Positioning ─────────────────────────────────────────────

  const modalW = 420
  const modalH = isInProbeMode ? 440 : 320
  const left = Math.max(8, Math.min(x - modalW / 2, containerWidth - modalW - 8))
  const fitsBelow = y + modalH < containerHeight
  const top = fitsBelow
    ? Math.min(y, containerHeight - modalH - 8)
    : Math.max(8, y - modalH)

  const isTerminal = ctx.source === "terminal"
  const SourceIcon = isTerminal ? Terminal : FileText
  const accentColor = isTerminal ? "cyan" : "blue"

  return (
    <div
      className="absolute z-30 w-[420px] bg-surface-2 border border-border-base rounded-xl shadow-2xl flex flex-col"
      style={{ left, top, maxHeight: containerHeight - 16 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-weak shrink-0">
        <div
          className={`w-5 h-5 rounded-md bg-${accentColor}-400/15 flex items-center justify-center`}
        >
          <SourceIcon className={`w-3 h-3 text-${accentColor}-400`} />
        </div>
        <span className="text-[11px] text-text-weak font-sans flex-1 truncate">
          <span className={`text-${accentColor}-400 font-medium`}>
            {ctx.sourceName}
          </span>
          {ctx.selection.startLine && (
            <span className="text-text-weaker ml-1">
              L{ctx.selection.startLine}
            </span>
          )}
          <span className="text-text-weaker ml-1.5">
            {ctx.selection.lineCount === 1
              ? "1 line"
              : `${ctx.selection.lineCount} lines`}
          </span>
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-surface-3 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-text-weaker" />
        </button>
      </div>

      {/* Selection preview — collapsible */}
      <div className="border-b border-border-weak shrink-0">
        <button
          onClick={() => setPreviewCollapsed((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] text-text-weaker font-sans hover:bg-surface-1/50 transition-colors"
        >
          <ChevronDown
            className={`w-3 h-3 transition-transform ${previewCollapsed ? "-rotate-90" : ""}`}
          />
          Selection preview
        </button>
        {!previewCollapsed && (
          <pre className="px-3.5 py-2 text-[10px] font-mono text-text-weak/70 bg-surface-0 max-h-[120px] overflow-y-auto overflow-x-auto scrollbar-thin leading-relaxed">
            {ctx.selection.text}
          </pre>
        )}
      </div>

      {/* Conversation area (probe mode) */}
      {isInProbeMode && activeProbe && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2.5 space-y-3">
          {activeProbe.messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare className="w-2.5 h-2.5 text-text-weak" />
                </div>
              )}
              <div
                className={`text-xs leading-relaxed font-sans max-w-[85%] ${
                  msg.role === "user"
                    ? "bg-accent/10 text-text-strong px-3 py-1.5 rounded-lg rounded-tr-sm"
                    : "text-text-base"
                }`}
              >
                {msg.role === "assistant" && msg.content === "" && streaming ? (
                  <span className="inline-flex items-center gap-1 text-text-weaker">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Thinking...
                  </span>
                ) : msg.role === "assistant" ? (
                  <MarkdownContent content={msg.content} />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-border-weak px-3.5 py-2.5">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isInProbeMode
              ? "Ask a follow-up..."
              : "Write a comment or question..."
          }
          rows={2}
          className="w-full bg-surface-1 border border-border-weak rounded-lg px-3 py-2 text-xs font-sans text-text-base placeholder-text-weaker focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none transition-colors"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 px-3.5 py-2.5 bg-surface-1/50 border-t border-border-weak shrink-0 rounded-b-xl">
        <button
          onClick={onClose}
          className="text-xs text-text-weaker hover:text-text-base transition-colors font-sans px-3 py-1.5 rounded-lg hover:bg-surface-2"
        >
          {isInProbeMode ? "Close" : "Cancel"}
        </button>
        <button
          onClick={handleAddToChat}
          className="text-xs font-sans font-medium px-3 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors flex items-center gap-1.5"
        >
          <MessageSquarePlus className="w-3 h-3" />
          Add to chat
        </button>
        <button
          onClick={handleAskAbout}
          disabled={!input.trim() || streaming}
          className="text-xs font-sans font-medium px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {streaming ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Ask about this
        </button>
      </div>
    </div>
  )
}
