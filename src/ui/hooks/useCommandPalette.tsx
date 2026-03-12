/**
 * Command palette system — registration, keybind matching, palette state.
 *
 * Pattern:
 * 1. CommandPaletteProvider wraps the app, owns the global keydown listener
 * 2. Components call useRegisterCommands() to add commands
 * 3. CommandPaletteDialog reads all commands via useCommandPalette()
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react"

// ── Types ────────────────────────────────────────────────────

export interface CommandOption {
  id: string
  title: string
  description?: string
  category: string
  keybind?: string // e.g. "mod+shift+p"
  icon?: ReactNode
  disabled?: boolean
  onSelect: () => void
}

export interface Keybind {
  key: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

// ── Keybind parsing ──────────────────────────────────────────

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)

function parseKeybind(raw: string): Keybind[] {
  // Support multiple keybinds: "mod+a,mod+b"
  return raw.split(",").map((part) => {
    const keys = part.trim().toLowerCase().split("+")
    const kb: Keybind = { key: "", ctrl: false, meta: false, shift: false, alt: false }

    for (const k of keys) {
      switch (k) {
        case "mod":
          if (IS_MAC) kb.meta = true
          else kb.ctrl = true
          break
        case "ctrl":
          kb.ctrl = true
          break
        case "meta":
          kb.meta = true
          break
        case "shift":
          kb.shift = true
          break
        case "alt":
          kb.alt = true
          break
        default:
          kb.key = k
      }
    }
    return kb
  })
}

function normalizeKey(key: string): string {
  const lower = key.toLowerCase()
  // Normalize special keys
  if (lower === " ") return "space"
  if (lower === "escape") return "escape"
  if (lower === "enter") return "enter"
  if (lower === "backspace") return "backspace"
  if (lower === "tab") return "tab"
  if (lower === "delete") return "delete"
  if (lower === "arrowup") return "arrowup"
  if (lower === "arrowdown") return "arrowdown"
  if (lower === "arrowleft") return "arrowleft"
  if (lower === "arrowright") return "arrowright"
  return lower
}

function matchKeybind(keybinds: Keybind[], event: KeyboardEvent): boolean {
  const eventKey = normalizeKey(event.key)
  for (const kb of keybinds) {
    if (
      kb.key === eventKey &&
      kb.ctrl === event.ctrlKey &&
      kb.meta === event.metaKey &&
      kb.shift === event.shiftKey &&
      kb.alt === event.altKey
    ) {
      return true
    }
  }
  return false
}

/** Format a keybind string for display. Platform-aware. */
export function formatKeybind(raw: string): string {
  const keybinds = parseKeybind(raw)
  return keybinds
    .map((kb) => {
      const parts: string[] = []
      if (IS_MAC) {
        if (kb.ctrl) parts.push("\u2303") // ⌃
        if (kb.alt) parts.push("\u2325") // ⌥
        if (kb.shift) parts.push("\u21E7") // ⇧
        if (kb.meta) parts.push("\u2318") // ⌘
      } else {
        if (kb.ctrl) parts.push("Ctrl")
        if (kb.alt) parts.push("Alt")
        if (kb.shift) parts.push("Shift")
        if (kb.meta) parts.push("Meta")
      }
      const keyDisplay = kb.key.length === 1 ? kb.key.toUpperCase() : kb.key
      parts.push(keyDisplay)
      return IS_MAC ? parts.join("") : parts.join("+")
    })
    .join(", ")
}

// ── Context ──────────────────────────────────────────────────

interface CommandPaletteContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  commands: CommandOption[]
  register: (key: string, commands: CommandOption[]) => void
  unregister: (key: string) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const registryRef = useRef<Map<string, CommandOption[]>>(new Map())
  const [commands, setCommands] = useState<CommandOption[]>([])

  const rebuildCommands = useCallback(() => {
    const all: CommandOption[] = []
    const seen = new Set<string>()
    for (const cmds of registryRef.current.values()) {
      for (const cmd of cmds) {
        if (seen.has(cmd.id)) continue
        seen.add(cmd.id)
        all.push(cmd)
      }
    }
    setCommands(all)
  }, [])

  const register = useCallback(
    (key: string, cmds: CommandOption[]) => {
      registryRef.current.set(key, cmds)
      rebuildCommands()
    },
    [rebuildCommands],
  )

  const unregister = useCallback(
    (key: string) => {
      registryRef.current.delete(key)
      rebuildCommands()
    },
    [rebuildCommands],
  )

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  // Global keydown listener for keybinds
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in inputs (except for palette trigger)
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable

      // Check all commands for keybind matches
      for (const cmd of registryRef.current.values()) {
        for (const c of cmd) {
          if (!c.keybind || c.disabled) continue
          const keybinds = parseKeybind(c.keybind)
          if (matchKeybind(keybinds, e)) {
            // Always allow palette trigger even in inputs
            if (c.id === "palette" || !isInput) {
              e.preventDefault()
              e.stopPropagation()
              c.onSelect()
              return
            }
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [])

  return (
    <CommandPaletteContext.Provider
      value={{ isOpen, open, close, toggle, commands, register, unregister }}
    >
      {children}
    </CommandPaletteContext.Provider>
  )
}

// ── Hooks ────────────────────────────────────────────────────

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider")
  return ctx
}

/**
 * Register commands from a component. Automatically unregisters on unmount.
 * `key` should be unique per registration site (e.g., "workspace", "session").
 */
export function useRegisterCommands(key: string, commands: CommandOption[]) {
  const { register, unregister } = useCommandPalette()

  // Store latest commands in ref to avoid stale closures
  const commandsRef = useRef(commands)
  commandsRef.current = commands

  // Register once on mount, unregister on unmount
  useEffect(() => {
    register(key, commandsRef.current)
    return () => unregister(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Re-register only when commands array identity changes
  const prevCommandsRef = useRef(commands)
  if (prevCommandsRef.current !== commands) {
    prevCommandsRef.current = commands
    register(key, commands)
  }
}
