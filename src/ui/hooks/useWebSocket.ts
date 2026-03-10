import { useCallback, useEffect, useState } from "react"

export interface WSMessage {
  type: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export type WSMessageHandler = (msg: WSMessage) => void

interface UseWebSocketOptions {
  url?: string
  maxRetries?: number
  enabled?: boolean
}

interface UseWebSocketReturn {
  send: (msg: WSMessage) => void
  connected: boolean
  subscribe: (handler: WSMessageHandler) => () => void
}

const DEFAULT_URL =
  import.meta.env.PROD
    ? `ws://${window.location.host}/ws`
    : "ws://localhost:3001/ws"

/**
 * True singleton WebSocket state, survives HMR and React StrictMode.
 * Attached to window so Vite module re-execution can't duplicate it.
 */
interface WsSingleton {
  ws: WebSocket | null
  handlers: Set<WSMessageHandler>
  refCount: number
  connected: boolean
  listeners: Set<(connected: boolean) => void>
  retries: number
  maxRetries: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  url: string
  enabled: boolean
}

const SINGLETON_KEY = "__ultiIHE_ws__" as const

function getSingleton(): WsSingleton {
  const win = window as unknown as Record<string, WsSingleton | undefined>
  if (!win[SINGLETON_KEY]) {
    win[SINGLETON_KEY] = {
      ws: null,
      handlers: new Set(),
      refCount: 0,
      connected: false,
      listeners: new Set(),
      retries: 0,
      maxRetries: 5,
      reconnectTimer: null,
      url: DEFAULT_URL,
      enabled: false,
    }
  }
  return win[SINGLETON_KEY]!
}

function notifyListeners(s: WsSingleton) {
  for (const listener of s.listeners) {
    listener(s.connected)
  }
}

function doConnect(s: WsSingleton) {
  if (!s.enabled) return
  // Don't create if one already exists and is open/connecting
  if (s.ws && (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING)) return

  try {
    const ws = new WebSocket(s.url)

    ws.onopen = () => {
      s.connected = true
      s.retries = 0
      notifyListeners(s)
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        for (const handler of s.handlers) {
          try { handler(msg) } catch { /* ignore */ }
        }
      } catch { /* ignore non-JSON */ }
    }

    ws.onclose = () => {
      // Only clean up if this is still the active WS
      if (s.ws === ws) {
        s.ws = null
        s.connected = false
        notifyListeners(s)

        if (!s.enabled || s.refCount <= 0) return
        if (s.retries >= s.maxRetries) return

        const delay = Math.min(1000 * 2 ** s.retries, 30_000)
        s.retries += 1
        s.reconnectTimer = setTimeout(() => doConnect(s), delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    s.ws = ws
  } catch { /* ignore */ }
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { url = DEFAULT_URL, maxRetries = 5, enabled = true } = options
  const s = getSingleton()

  s.url = url
  s.maxRetries = maxRetries

  const [connected, setConnected] = useState(s.connected)

  useEffect(() => {
    s.refCount++
    s.listeners.add(setConnected)
    // Sync current state
    setConnected(s.connected)

    if (enabled) {
      s.enabled = true
      doConnect(s)
    }

    return () => {
      s.refCount--
      s.listeners.delete(setConnected)

      if (s.refCount <= 0) {
        s.refCount = 0
        s.enabled = false
        if (s.reconnectTimer) {
          clearTimeout(s.reconnectTimer)
          s.reconnectTimer = null
        }
        s.ws?.close()
        s.ws = null
        s.connected = false
      }
    }
  }, [enabled])

  const send = useCallback((msg: WSMessage) => {
    const ws = getSingleton().ws
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  const subscribe = useCallback((handler: WSMessageHandler): (() => void) => {
    const singleton = getSingleton()
    singleton.handlers.add(handler)
    return () => { singleton.handlers.delete(handler) }
  }, [])

  return { send, connected, subscribe }
}
