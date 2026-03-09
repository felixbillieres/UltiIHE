import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"

interface Props {
  /** Server-assigned terminal ID — already exists on the backend */
  serverId: string
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
}

export function TerminalView({ serverId, send, subscribe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

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
        selectionBackground: "rgba(255, 255, 255, 0.15)",
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
      try { fitAddon.fit() } catch { /* not visible yet */ }
    })

    // Forward user keystrokes to server
    const dataDisposable = term.onData((data) => {
      send({ type: "terminal:input", data: { terminalId: serverId, input: data } })
    })

    // Send resize to server when xterm dimensions change
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      send({ type: "terminal:resize", data: { terminalId: serverId, cols, rows } })
    })

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit() } catch { /* ignore */ }
      })
    })
    resizeObserver.observe(containerRef.current)

    // Subscribe to output for THIS terminal only
    let alive = true
    const unsubscribe = subscribe((msg: WSMessage) => {
      if (!alive || !termRef.current) return

      if (msg.type === "terminal:output" && msg.data?.terminalId === serverId) {
        termRef.current.write(msg.data?.output as string)
      }

      if (msg.type === "terminal:closed" && msg.data?.terminalId === serverId) {
        termRef.current.writeln("\r\n\x1b[90m[Process exited]\x1b[0m")
      }
    })

    return () => {
      alive = false
      resizeObserver.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      unsubscribe()
      term.dispose()
      termRef.current = null
      // NOTE: we do NOT send terminal:close here — lifecycle is managed by TerminalArea
    }
  }, [serverId, send, subscribe])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ backgroundColor: "#101010" }}
    />
  )
}
