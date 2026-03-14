import { useEffect, useRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import "@xterm/xterm/css/xterm.css"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"
import { useTerminalStore } from "../../stores/terminal"
import { Plus } from "lucide-react"
import { ProbeModal, type ProbeContext } from "../probe/ProbeModal"
import { ProbeHistory } from "../probe/ProbeHistory"
import { useSearchStore } from "../../stores/search"

// ── Global terminal instance pool (Havoc/VSCode pattern) ────
// xterm instances are created once. The DOM element is MOVED between
// React containers on mount/unmount — never destroyed until process exit.

interface TerminalEntry {
  term: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  /** The wrapper div that xterm renders into. Created once via term.open(). */
  element: HTMLDivElement
  bufferFetched: boolean
}

const terminalPool = new Map<string, TerminalEntry>()

const TERM_THEME = {
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
}

function getOrCreateTerminal(serverId: string): TerminalEntry {
  const existing = terminalPool.get(serverId)
  if (existing) return existing

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    theme: TERM_THEME,
    allowProposedApi: true,
  })

  const fitAddon = new FitAddon()
  const searchAddon = new SearchAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)

  // Prevent browser from stealing Tab, Ctrl+R, Ctrl+L
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.key === "Tab") return true
    if (ev.ctrlKey && (ev.key === "r" || ev.key === "l")) return true
    return true
  })

  // Create a persistent wrapper div and open xterm into it ONCE
  const element = document.createElement("div")
  element.style.width = "100%"
  element.style.height = "100%"
  element.style.backgroundColor = "#101010"
  term.open(element)

  const entry: TerminalEntry = { term, fitAddon, searchAddon, element, bufferFetched: false }
  terminalPool.set(serverId, entry)
  return entry
}

/** Dispose a terminal instance permanently (when process exits) */
export function disposeTerminalInstance(serverId: string) {
  const entry = terminalPool.get(serverId)
  if (entry) {
    entry.element.remove()
    entry.searchAddon.dispose()
    entry.term.dispose()
    terminalPool.delete(serverId)
  }
}

// ── Component ───────────────────────────────────────────────

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

  // ── Move xterm DOM element into this container ──────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const entry = getOrCreateTerminal(serverId)
    const { term, fitAddon, element } = entry

    // Move the persistent xterm element into this container (VSCode detach/attach pattern)
    container.appendChild(element)

    // Debounced fit
    let fitTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedFit = (delay = 100) => {
      if (fitTimer) clearTimeout(fitTimer)
      fitTimer = setTimeout(() => {
        fitTimer = null
        try { fitAddon.fit() } catch {}
      }, delay)
    }

    // Fit after layout settles
    const fitTimers = [0, 50, 150, 400].map((d) =>
      setTimeout(() => { try { fitAddon.fit() } catch {} }, d),
    )

    // Fetch buffer on first-ever mount
    if (!entry.bufferFetched) {
      entry.bufferFetched = true
      fetch(`/api/terminals/${serverId}/output`)
        .then((r) => r.json())
        .then((data) => {
          if (data.output) term.write(data.output)
        })
        .catch(() => {})
    }

    // Input → WebSocket
    const dataDisposable = term.onData((data) => {
      send({ type: "terminal:input", data: { terminalId: serverId, input: data } })
    })

    // Resize → WebSocket
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      send({ type: "terminal:resize", data: { terminalId: serverId, cols, rows } })
    })

    // Selection tracking for probe
    const handleMouseUp = (e: MouseEvent) => {
      requestAnimationFrame(() => {
        const selectedText = term.getSelection()
        if (selectedText && selectedText.trim().length > 0) {
          const rect = container.getBoundingClientRect()
          setAnchor({
            text: selectedText,
            lineCount: selectedText.split("\n").length,
            x: Math.min(e.clientX - rect.left, rect.width - 240),
            y: e.clientY - rect.top + 4,
          })
        } else if (!probeOpenRef.current) {
          setAnchor(null)
        }
      })
    }
    container.addEventListener("mouseup", handleMouseUp)

    const selectionDisposable = term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (!sel || sel.trim().length === 0) {
        if (!probeOpenRef.current) setAnchor(null)
      }
    })

    // ResizeObserver
    const resizeObserver = new ResizeObserver(() => debouncedFit(80))
    resizeObserver.observe(container)

    // Window resize (pop-out)
    const ownerWindow = container.ownerDocument.defaultView || window
    const handleWindowResize = () => debouncedFit(80)
    ownerWindow.addEventListener("resize", handleWindowResize)

    // WebSocket output subscription
    let alive = true
    const unsubscribe = subscribe((msg: WSMessage) => {
      if (!alive) return
      if (msg.type === "terminal:output" && msg.data?.terminalId === serverId) {
        term.write(msg.data.output as string)
      }
      if (msg.type === "terminal:closed" && msg.data?.terminalId === serverId) {
        term.writeln("\r\n\x1b[90m[Process exited]\x1b[0m")
      }
    })

    // Cleanup: detach DOM + listeners, but keep the terminal instance alive
    return () => {
      alive = false
      if (fitTimer) clearTimeout(fitTimer)
      for (const t of fitTimers) clearTimeout(t)
      container.removeEventListener("mouseup", handleMouseUp)
      ownerWindow.removeEventListener("resize", handleWindowResize)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      selectionDisposable.dispose()
      unsubscribe()
      // Detach the element from this container (it stays in memory for reattach)
      if (element.parentNode === container) {
        container.removeChild(element)
      }
    }
  }, [serverId, send, subscribe])

  // ── Search mini panel integration ──────────────────────
  useEffect(() => {
    const entry = terminalPool.get(serverId)
    if (!entry) return

    const searchOpts = {
      caseSensitive: false,
      decorations: {
        matchBackground: "#FFD70044",
        activeMatchBackground: "#FF8C00CC",
        matchBorder: "#FFD70066",
        matchOverviewRuler: "#FFD700",
        activeMatchColorOverviewRuler: "#FF8C00",
      },
    }

    let activeKey = ""
    let prevNavSeq = -1
    let resultsDisposable: { dispose(): void } | null = null

    function panelKey(panel: ReturnType<typeof useSearchStore.getState>["miniPanel"]): string {
      if (!panel || panel.type !== "terminal" || panel.terminalId !== serverId) return ""
      return `terminal:${panel.terminalId}:${panel.query}`
    }

    const unsub = useSearchStore.subscribe((state) => {
      const panel = state.miniPanel
      const addon = entry.searchAddon

      const key = panelKey(panel)

      if (key !== activeKey) {
        if (key && panel) {
          addon.findNext(panel.query, searchOpts)
          resultsDisposable?.dispose()
          resultsDisposable = addon.onDidChangeResults((r) => {
            useSearchStore.getState().setMatchInfo(r.resultIndex, r.resultCount)
          })
        } else if (activeKey) {
          addon.clearDecorations()
          resultsDisposable?.dispose()
          resultsDisposable = null
        }
        activeKey = key
        prevNavSeq = panel?._navSeq ?? -1
        return
      }

      if (key && panel && panel._navSeq !== prevNavSeq) {
        prevNavSeq = panel._navSeq
        if (panel._navDir === "next") {
          addon.findNext(panel.query, searchOpts)
        } else {
          addon.findPrevious(panel.query, searchOpts)
        }
      }
    })

    return () => {
      unsub()
      resultsDisposable?.dispose()
    }
  }, [serverId])

  // ── Probe handlers ─────────────────────────────────────
  const closeProbe = () => {
    setProbeOpen(false)
    setAnchor(null)
    terminalPool.get(serverId)?.term.clearSelection()
  }

  const probeCtx: ProbeContext | null = anchor
    ? {
        source: "terminal",
        sourceId: serverId,
        sourceName: terminalName,
        pageKey: `terminal:${serverId}`,
        selection: { text: anchor.text, lineCount: anchor.lineCount },
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

      {anchor && !probeOpen && (() => {
        const btnTop = Math.max(4, Math.min(anchor.y, ch - 32))
        return (
          <button
            onClick={() => setProbeOpen(true)}
            className="absolute z-20 w-6 h-6 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-lg transition-all hover:scale-110"
            style={{ left: anchor.x, top: btnTop }}
            title="Probe selection"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )
      })()}

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

      <ProbeHistory
        pageKey={`terminal:${serverId}`}
        containerWidth={cw}
        containerHeight={ch}
      />
    </div>
  )
}
