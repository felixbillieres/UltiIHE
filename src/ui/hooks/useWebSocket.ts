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

const WS_BASE =
  import.meta.env.PROD
    ? `ws://${window.location.host}/ws`
    : "ws://localhost:3001/ws"

const API_BASE =
  import.meta.env.PROD
    ? `${window.location.origin}/api`
    : "http://localhost:3001/api"

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
  token: string | null
  tokenFetching: boolean
}

const SINGLETON_KEY = "__exegolIHE_ws__" as const

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
      url: WS_BASE,
      enabled: false,
      token: null,
      tokenFetching: false,
    }
  }
  return win[SINGLETON_KEY]!
}

function notifyListeners(s: WsSingleton) {
  for (const listener of s.listeners) {
    listener(s.connected)
  }
}

async function fetchToken(s: WsSingleton): Promise<string | null> {
  if (s.token) return s.token
  if (s.tokenFetching) return null
  s.tokenFetching = true
  try {
    const res = await fetch(`${API_BASE}/ws-token`)
    if (!res.ok) return null
    const { token } = await res.json()
    s.token = token
    return token
  } catch {
    return null
  } finally {
    s.tokenFetching = false
  }
}

function doConnect(s: WsSingleton) {
  if (!s.enabled) return
  // Don't create if one already exists and is open/connecting
  if (s.ws && (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING)) return

  // Fetch token first, then connect
  fetchToken(s).then((token) => {
    if (!s.enabled) return
    if (!token) {
      // Retry token fetch after delay
      if (s.retries < s.maxRetries) {
        const delay = Math.min(1000 * 2 ** s.retries, 30_000)
        s.retries++
        s.reconnectTimer = setTimeout(() => doConnect(s), delay)
      }
      return
    }
    if (s.ws && (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING)) return
    connectWithToken(s, token)
  })
}

function connectWithToken(s: WsSingleton, token: string) {
  try {
    const ws = new WebSocket(`${s.url}?token=${token}`)

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
  const { url = WS_BASE, maxRetries = 5, enabled = true } = options
  const s = getSingleton()

  s.url = url
  s.maxRetries = maxRetries

  const [connected, setConnected] = useState(s.connected)

  useEffect(() => {
    const singleton = getSingleton()
    singleton.refCount++
    singleton.listeners.add(setConnected)
    // Sync current state
    setConnected(singleton.connected)

    if (enabled) {
      singleton.enabled = true
      doConnect(singleton)
    }

    return () => {
      singleton.refCount = Math.max(0, singleton.refCount - 1)
      singleton.listeners.delete(setConnected)

      if (singleton.refCount <= 0) {
        singleton.enabled = false
        if (singleton.reconnectTimer) {
          clearTimeout(singleton.reconnectTimer)
          singleton.reconnectTimer = null
        }
        singleton.ws?.close()
        singleton.ws = null
        singleton.connected = false
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
