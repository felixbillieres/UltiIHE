import { useEffect, useRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"
import { useTerminalStore } from "../../stores/terminal"
import { Plus } from "lucide-react"
import { ProbeModal, type ProbeContext } from "../probe/ProbeModal"
import { ProbeHistory } from "../probe/ProbeHistory"

interface Props {
  serverId: string
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
}

interface SelectionAnchor {
  text: string
  lineCount: number
  x: number
  y: number
}

export function TerminalView({ serverId, send, subscribe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null)
  const [probeOpen, setProbeOpen] = useState(false)
  const probeOpenRef = useRef(false)

  useEffect(() => {
    probeOpenRef.current = probeOpen
  }, [probeOpen])

  const terminals = useTerminalStore((s) => s.terminals)
  const terminalName =
    terminals.find((t) => t.id === serverId)?.name || serverId

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

    // Fit after layout settles — retry with increasing delays for pop-out windows
    // where the container dimensions may not be final on the first frame
    const fitDelays = [0, 50, 150, 400]
    const fitTimers: ReturnType<typeof setTimeout>[] = []
    for (const delay of fitDelays) {
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          try {
            fitAddon.fit()
          } catch {
            /* not visible yet */
          }
        })
      }, delay)
      fitTimers.push(timer)
    }

    // Fetch existing terminal output buffer (needed when remounting, e.g. pop-out)
    fetch(`/api/terminals/${serverId}/output`)
      .then((r) => r.json())
      .then((data) => {
        if (data.output && termRef.current) {
          termRef.current.write(data.output)
        }
      })
      .catch(() => {
        /* terminal may not have buffer yet */
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
      requestAnimationFrame(() => {
        const selectedText = term.getSelection()
        if (selectedText && selectedText.trim().length > 0) {
          const rect = el.getBoundingClientRect()
          const lines = selectedText.split("\n")
          setAnchor({
            text: selectedText,
            lineCount: lines.length,
            x: Math.min(e.clientX - rect.left, rect.width - 240),
            y: e.clientY - rect.top + 4,
          })
        } else {
          if (!probeOpenRef.current) {
            setAnchor(null)
          }
        }
      })
    }
    el.addEventListener("mouseup", handleMouseUp)

    // Clear anchor when selection cleared by clicking elsewhere
    const selectionDisposable = term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (!sel || sel.trim().length === 0) {
        if (!probeOpenRef.current) {
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

    // Also listen on the ownerDocument's window for resize events —
    // this handles pop-out windows where the ResizeObserver on the
    // container element may not fire when the popup is maximized/restored.
    const ownerWindow = el.ownerDocument.defaultView || window
    const handleWindowResize = () => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          /* ignore */
        }
      })
    }
    ownerWindow.addEventListener("resize", handleWindowResize)

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
      for (const t of fitTimers) clearTimeout(t)
      el.removeEventListener("mouseup", handleMouseUp)
      ownerWindow.removeEventListener("resize", handleWindowResize)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      selectionDisposable.dispose()
      unsubscribe()
      term.dispose()
      termRef.current = null
    }
  }, [serverId, send, subscribe])

  const openProbe = () => {
    setProbeOpen(true)
  }

  const closeProbe = () => {
    setProbeOpen(false)
    setAnchor(null)
    termRef.current?.clearSelection()
  }

  // Build probe context
  const probeCtx: ProbeContext | null = anchor
    ? {
        source: "terminal",
        sourceId: serverId,
        sourceName: terminalName,
        pageKey: `terminal:${serverId}`,
        selection: {
          text: anchor.text,
          lineCount: anchor.lineCount,
        },
        quoteData: {
          source: "terminal",
          terminalId: serverId,
          terminalName,
          text: anchor.text,
          lineCount: anchor.lineCount,
        },
      }
    : null

  const cw = wrapperRef.current?.offsetWidth || containerRef.current?.offsetWidth || 400
  const ch = wrapperRef.current?.offsetHeight || containerRef.current?.parentElement?.offsetHeight || 400

  return (
    <div ref={wrapperRef} className="relative w-full h-full overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ backgroundColor: "#101010" }}
      />

      {/* Floating "+" button — clamped to container */}
      {anchor && !probeOpen && (() => {
        const btnTop = Math.max(4, Math.min(anchor.y, ch - 32))
        return (
          <button
            onClick={openProbe}
            className="absolute z-20 w-6 h-6 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-lg transition-all hover:scale-110"
            style={{ left: anchor.x, top: btnTop }}
            title="Probe selection"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )
      })()}

      {/* Probe modal */}
      {anchor && probeOpen && probeCtx && (
        <ProbeModal
          ctx={probeCtx}
          x={anchor.x}
          y={anchor.y}
          containerWidth={cw}
          containerHeight={ch}
          onClose={closeProbe}
        />
      )}

      {/* Probe history button */}
      <ProbeHistory
        pageKey={`terminal:${serverId}`}
        containerWidth={cw}
        containerHeight={ch}
      />
    </div>
  )
}
