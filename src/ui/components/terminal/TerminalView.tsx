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

// Track terminals whose buffer has already been fetched and written to xterm.
// Prevents duplicate content when TerminalView remounts (e.g. moving between split groups).
const initializedTerminals = new Set<string>()

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

  const searchAddonRef = useRef<SearchAddon | null>(null)

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
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon
    term.open(containerRef.current)
    termRef.current = term

    // Debounced fit — prevents rapid reflows that garble xterm content
    // when split panes are resized continuously
    let fitTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedFit = (delay = 100) => {
      if (fitTimer) clearTimeout(fitTimer)
      fitTimer = setTimeout(() => {
        fitTimer = null
        try {
          fitAddon.fit()
        } catch {
          /* not visible yet */
        }
      }, delay)
    }

    // Fit after layout settles — retry with increasing delays for pop-out windows
    // where the container dimensions may not be final on the first frame
    const fitDelays = [0, 50, 150, 400]
    const fitTimers: ReturnType<typeof setTimeout>[] = []
    for (const delay of fitDelays) {
      const timer = setTimeout(() => {
        try {
          fitAddon.fit()
        } catch {
          /* not visible yet */
        }
      }, delay)
      fitTimers.push(timer)
    }

    // Fetch existing terminal output buffer on first mount only.
    // Skip on remount (e.g. moving between split groups) to prevent duplicate content.
    if (!initializedTerminals.has(serverId)) {
      initializedTerminals.add(serverId)
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
    }

    // Prevent the browser from stealing Tab (focus navigation) so it reaches
    // the PTY for shell autocompletion (zsh/bash Tab completion).
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.key === "Tab") {
        // Let xterm handle it (sends \t to PTY) — don't let the browser use it for focus
        return true
      }
      // Ctrl+R: send to PTY (zsh reverse-i-search) instead of browser refresh
      // Ctrl+L: send to PTY (clear terminal) instead of browser address bar
      if (ev.ctrlKey && (ev.key === "r" || ev.key === "l")) {
        return true
      }
      return true
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
      debouncedFit(80)
    })
    resizeObserver.observe(el)

    // Also listen on the ownerDocument's window for resize events —
    // this handles pop-out windows where the ResizeObserver on the
    // container element may not fire when the popup is maximized/restored.
    const ownerWindow = el.ownerDocument.defaultView || window
    const handleWindowResize = () => {
      debouncedFit(80)
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
      if (fitTimer) clearTimeout(fitTimer)
      for (const t of fitTimers) clearTimeout(t)
      el.removeEventListener("mouseup", handleMouseUp)
      ownerWindow.removeEventListener("resize", handleWindowResize)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      selectionDisposable.dispose()
      unsubscribe()
      searchAddon.dispose()
      searchAddonRef.current = null
      term.dispose()
      termRef.current = null

      // If the terminal was truly removed (not just moved between groups),
      // clear the initialized flag so a future terminal with this ID gets its buffer.
      setTimeout(() => {
        const exists = useTerminalStore.getState().terminals.some((t) => t.id === serverId)
        if (!exists) {
          initializedTerminals.delete(serverId)
        }
      }, 200)
    }
  }, [serverId, send, subscribe])

  // Subscribe to search mini panel — activate SearchAddon, handle prev/next
  useEffect(() => {
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

    // Track identity by key fields — NOT object reference (setMatchInfo creates new objects)
    let activeKey = "" // "terminal:<id>:<query>" when active, "" when not
    let prevNavSeq = -1
    let resultsDisposable: { dispose(): void } | null = null

    function panelKey(panel: ReturnType<typeof useSearchStore.getState>["miniPanel"]): string {
      if (!panel || panel.type !== "terminal" || panel.terminalId !== serverId) return ""
      return `terminal:${panel.terminalId}:${panel.query}`
    }

    const unsub = useSearchStore.subscribe((state) => {
      const panel = state.miniPanel
      const addon = searchAddonRef.current
      if (!addon) return

      const key = panelKey(panel)

      // Panel identity changed (opened, closed, or switched target)
      if (key !== activeKey) {
        if (key && panel) {
          // Activate: find first match + listen for results
          addon.findNext(panel.query, searchOpts)
          resultsDisposable?.dispose()
          resultsDisposable = addon.onDidChangeResults((r) => {
            useSearchStore.getState().setMatchInfo(r.resultIndex, r.resultCount)
          })
        } else if (activeKey) {
          // Deactivate: clear
          addon.clearDecorations()
          resultsDisposable?.dispose()
          resultsDisposable = null
        }
        activeKey = key
        prevNavSeq = panel?._navSeq ?? -1
        return
      }

      // Handle prev/next navigation (same panel, navSeq changed)
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
