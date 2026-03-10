import { useEffect, useRef, useState, useCallback } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"
import { useChatContextStore } from "../../stores/chatContext"
import { useTerminalStore } from "../../stores/terminal"
import { Plus, Terminal as TerminalIcon } from "lucide-react"

interface Props {
  serverId: string
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
}

interface SelectionAnchor {
  text: string
  lineCount: number
  // Position relative to the terminal container
  x: number
  y: number
}

export function TerminalView({ serverId, send, subscribe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null)
  const [commenting, setCommenting] = useState(false)
  const [comment, setComment] = useState("")
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  const addQuote = useChatContextStore((s) => s.addQuote)
  const terminals = useTerminalStore((s) => s.terminals)
  const terminalName =
    terminals.find((t) => t.id === serverId)?.name || serverId

  const handleComment = useCallback(() => {
    if (!anchor) return
    addQuote({
      terminalId: serverId,
      terminalName,
      text: anchor.text,
      lineCount: anchor.lineCount,
      comment: comment.trim() || undefined,
    })
    termRef.current?.clearSelection()
    setAnchor(null)
    setCommenting(false)
    setComment("")
  }, [anchor, comment, serverId, terminalName, addQuote])

  const handleCancel = useCallback(() => {
    setCommenting(false)
    setComment("")
  }, [])

  const openCommentBox = useCallback(() => {
    setCommenting(true)
    setComment("")
    setTimeout(() => commentInputRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#101010",
        foreground: "rgba(255, 255, 255, 0.85)",
        cursor: "rgba(255, 255, 255, 0.7)",
        selectionBackground: "rgba(100, 149, 237, 0.3)",
        black: "#101010",
        red: "#e55561",
        green: "#8ebd6b",
        yellow: "#d18f52",
        blue: "#4fa6ed",
        magenta: "#bf68d9",
        cyan: "#48b0bd",
        white: "rgba(255, 255, 255, 0.85)",
        brightBlack: "#535965",
        brightRed: "#e55561",
        brightGreen: "#8ebd6b",
        brightYellow: "#d18f52",
        brightBlue: "#4fa6ed",
        brightMagenta: "#bf68d9",
        brightCyan: "#48b0bd",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    termRef.current = term

    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        /* not visible yet */
      }
    })

    const dataDisposable = term.onData((data) => {
      send({
        type: "terminal:input",
        data: { terminalId: serverId, input: data },
      })
    })

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      send({
        type: "terminal:resize",
        data: { terminalId: serverId, cols, rows },
      })
    })

    // Track mouseup on the terminal to get selection position
    const el = containerRef.current
    const handleMouseUp = (e: MouseEvent) => {
      // Small delay to let xterm finalize the selection
      requestAnimationFrame(() => {
        const selectedText = term.getSelection()
        if (selectedText && selectedText.trim().length > 0) {
          const rect = el.getBoundingClientRect()
          const lines = selectedText.split("\n")
          setAnchor({
            text: selectedText,
            lineCount: lines.length,
            // Position relative to container, near mouse
            x: Math.min(e.clientX - rect.left, rect.width - 240),
            y: e.clientY - rect.top + 4,
          })
        } else {
          setAnchor(null)
          setCommenting(false)
          setComment("")
        }
      })
    }
    el.addEventListener("mouseup", handleMouseUp)

    // Clear anchor when selection cleared by clicking elsewhere
    const selectionDisposable = term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (!sel || sel.trim().length === 0) {
        // Don't clear if comment box is open
        if (!commentInputRef.current) {
          setAnchor(null)
        }
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          /* ignore */
        }
      })
    })
    resizeObserver.observe(el)

    let alive = true
    const unsubscribe = subscribe((msg: WSMessage) => {
      if (!alive || !termRef.current) return
      if (
        msg.type === "terminal:output" &&
        msg.data?.terminalId === serverId
      ) {
        termRef.current.write(msg.data?.output as string)
      }
      if (
        msg.type === "terminal:closed" &&
        msg.data?.terminalId === serverId
      ) {
        termRef.current.writeln("\r\n\x1b[90m[Process exited]\x1b[0m")
      }
    })

    return () => {
      alive = false
      el.removeEventListener("mouseup", handleMouseUp)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      selectionDisposable.dispose()
      unsubscribe()
      term.dispose()
      termRef.current = null
    }
  }, [serverId, send, subscribe])

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ backgroundColor: "#101010" }}
      />

      {/* Floating "+" button near selection */}
      {anchor && !commenting && (
        <button
          onClick={openCommentBox}
          className="absolute z-20 w-6 h-6 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-lg transition-all hover:scale-110"
          style={{ left: anchor.x, top: anchor.y }}
          title="Comment on selection"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Inline comment popover */}
      {anchor && commenting && (
        <div
          className="absolute z-20 w-[340px] bg-surface-2 border border-border-base rounded-xl shadow-2xl overflow-hidden"
          style={{
            left: Math.max(8, Math.min(anchor.x - 60, (containerRef.current?.offsetWidth || 400) - 352)),
            top: anchor.y,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3.5 pt-3 pb-1.5 flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-cyan-400/15 flex items-center justify-center">
              <TerminalIcon className="w-3 h-3 text-cyan-400" />
            </div>
            <span className="text-[11px] text-text-weak font-sans">
              Commenting on{" "}
              <span className="text-text-base font-medium">
                {anchor.lineCount === 1 ? "1 line" : `${anchor.lineCount} lines`}
              </span>
              {" from "}
              <span className="text-cyan-400 font-medium">{terminalName}</span>
            </span>
          </div>

          {/* Preview snippet */}
          <div className="mx-3.5 mb-2 rounded-lg bg-[#101010] border border-border-weak/50 overflow-hidden">
            <pre className="px-3 py-2 text-[11px] font-mono text-text-weak/80 leading-relaxed max-h-[80px] overflow-y-auto scrollbar-none">
              {anchor.text.length > 300
                ? anchor.text.slice(0, 300) + "…"
                : anchor.text}
            </pre>
          </div>

          {/* Comment input */}
          <div className="px-3.5 pb-3">
            <textarea
              ref={commentInputRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleComment()
                }
                if (e.key === "Escape") handleCancel()
              }}
              placeholder="Add a comment about this selection..."
              rows={2}
              className="w-full text-xs bg-surface-0 border border-border-base rounded-lg px-3 py-2 text-text-base placeholder-text-weaker resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 font-sans transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-3.5 py-2.5 bg-surface-1/50 border-t border-border-weak">
            <button
              onClick={handleCancel}
              className="text-xs text-text-weak hover:text-text-base transition-colors font-sans px-3 py-1.5 rounded-lg hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={handleComment}
              className="text-xs text-white bg-accent hover:bg-accent-hover transition-colors font-sans font-medium px-4 py-1.5 rounded-lg shadow-sm"
            >
              Comment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
