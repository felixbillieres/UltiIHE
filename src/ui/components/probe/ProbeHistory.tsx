import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useProbeStore, type Probe } from "../../stores/probe"
import { useSettingsStore } from "../../stores/settings"
import { X, Trash2, Send, Loader2, MessageSquare } from "lucide-react"
import { MarkdownContent } from "../chat/MarkdownContent"

interface Props {
  pageKey: string
  /** Container dimensions for clamping */
  containerWidth: number
  containerHeight: number
}

export function ProbeHistory({ pageKey, containerWidth, containerHeight }: Props) {
  const allProbes = useProbeStore((s) => s.probes)
  const probes = useMemo(() => allProbes.filter((p) => p.pageKey === pageKey), [allProbes, pageKey])
  const isOpen = useProbeStore((s) => s.openHistoryKeys.includes(pageKey))
  const toggleHistory = useProbeStore((s) => s.toggleHistory)
  const removeProbe = useProbeStore((s) => s.removeProbe)
  const clearProbes = useProbeStore((s) => s.clearProbes)
  const addMessage = useProbeStore((s) => s.addMessage)
  const updateLastAssistant = useProbeStore((s) => s.updateLastAssistant)

  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const count = probes.length

  // Auto-select first tab if none
  useEffect(() => {
    if (isOpen && probes.length > 0 && (!activeTab || !probes.find((p) => p.id === activeTab))) {
      setActiveTab(probes[probes.length - 1].id)
    }
  }, [isOpen, probes, activeTab])

  // Auto-scroll
  const activeProbe = probes.find((p) => p.id === activeTab)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeProbe?.messages.length, activeProbe?.messages[activeProbe.messages.length - 1]?.content])

  const handleContinueChat = useCallback(async () => {
    if (!activeTab || !input.trim() || streaming) return

    const provider = useSettingsStore.getState().getActiveProvider()
    if (!provider?.apiKey) return

    addMessage(activeTab, { role: "user", content: input.trim() })
    setInput("")
    addMessage(activeTab, { role: "assistant", content: "" })

    setStreaming(true)
    const abort = new AbortController()
    abortRef.current = abort

    try {
      const probe = useProbeStore
        .getState()
        .probes.find((p) => p.id === activeTab)
      if (!probe) return

      const apiMessages = probe.messages
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
          source: probe.source,
          sourceName: probe.sourceName,
          selection: probe.selection,
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
        updateLastAssistant(activeTab!, full)
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        updateLastAssistant(
          activeTab!,
          `⚠️ ${(err as Error).message || "Unknown error"}`,
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [activeTab, input, streaming, addMessage, updateLastAssistant])

  if (count === 0) return null

  return (
    <>
      {/* Floating Exegol button — bottom-right of container */}
      <button
        onClick={() => toggleHistory(pageKey)}
        className={`absolute z-20 bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-lg transition-all hover:scale-105 ${
          isOpen
            ? "bg-accent text-white"
            : "bg-surface-2 border border-border-base text-text-weak hover:text-text-base hover:border-accent/30"
        }`}
        title={`${count} probe${count > 1 ? "s" : ""}`}
      >
        <img
          src="/exegol-symbol-white.svg"
          alt=""
          className="w-4 h-4 opacity-80"
        />
        <span className="text-[11px] font-sans font-medium">{count}</span>
      </button>

      {/* History panel */}
      {isOpen && (
        <div
          className="absolute z-30 bottom-12 right-3 w-[400px] bg-surface-2 border border-border-base rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: Math.min(containerHeight - 60, 500) }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Panel header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-weak shrink-0">
            <img src="/exegol-symbol-white.svg" alt="" className="w-4 h-4 opacity-60" />
            <span className="text-xs text-text-weak font-sans font-medium flex-1">
              Quick chats ({count})
            </span>
            <button
              onClick={() => clearProbes(pageKey)}
              className="text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-3"
            >
              <Trash2 className="w-3 h-3" />
              Clear all
            </button>
            <button
              onClick={() => toggleHistory(pageKey)}
              className="p-1 rounded hover:bg-surface-3 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-text-weaker" />
            </button>
          </div>

          {/* Tabs */}
          {count > 1 && (
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-weak overflow-x-auto scrollbar-none shrink-0">
              {probes.map((p, i) => {
                const label =
                  p.messages.length > 0
                    ? p.messages[0].content.slice(0, 30) +
                      (p.messages[0].content.length > 30 ? "…" : "")
                    : `Probe #${i + 1}`
                return (
                  <button
                    key={p.id}
                    onClick={() => setActiveTab(p.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-sans whitespace-nowrap transition-colors group ${
                      activeTab === p.id
                        ? "bg-accent/15 text-accent font-medium"
                        : "text-text-weaker hover:text-text-weak hover:bg-surface-1"
                    }`}
                  >
                    <span className="truncate max-w-[120px]">{label}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        removeProbe(p.id)
                      }}
                      className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Active probe conversation */}
          {activeProbe && (
            <>
              {/* Selection context */}
              <div className="px-3 py-1.5 text-[10px] text-text-weaker font-mono bg-surface-0/50 border-b border-border-weak truncate shrink-0">
                {activeProbe.source === "terminal" ? "Terminal" : "File"}:{" "}
                {activeProbe.sourceName}
                {activeProbe.selection.startLine &&
                  ` L${activeProbe.selection.startLine}`}
                {" · "}
                {activeProbe.selection.lineCount} lines
              </div>

              {/* Messages */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2.5">
                {activeProbe.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-4 h-4 rounded-full bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="w-2 h-2 text-text-weak" />
                      </div>
                    )}
                    <div
                      className={`text-xs leading-relaxed font-sans max-w-[85%] ${
                        msg.role === "user"
                          ? "bg-accent/10 text-text-strong px-2.5 py-1.5 rounded-lg rounded-tr-sm"
                          : "text-text-base"
                      }`}
                    >
                      {msg.role === "assistant" && msg.content === "" && streaming ? (
                        <span className="inline-flex items-center gap-1 text-text-weaker">
                          <Loader2 className="w-3 h-3 animate-spin" />
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

              {/* Continue chatting input */}
              <div className="shrink-0 border-t border-border-weak px-3 py-2 flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleContinueChat()
                    }
                    if (e.key === "Escape") toggleHistory(pageKey)
                  }}
                  placeholder="Continue asking..."
                  rows={1}
                  className="flex-1 bg-surface-1 border border-border-weak rounded-lg px-2.5 py-1.5 text-xs font-sans text-text-base placeholder-text-weaker focus:outline-none focus:border-accent/50 resize-none"
                />
                <button
                  onClick={handleContinueChat}
                  disabled={!input.trim() || streaming}
                  className="p-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {streaming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
