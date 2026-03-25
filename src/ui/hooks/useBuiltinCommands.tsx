/**
 * Registers all built-in commands for the command palette.
 *
 * Called from WorkspaceLayout with layout action callbacks.
 * Pulls session/settings/terminal actions from Zustand stores.
 */

import { useMemo } from "react"
import {
  MessageSquarePlus,
  Settings,
  PanelLeft,
  PanelRight,
  PanelBottom,
  ArrowLeftRight,
  Terminal,
  Plus,
  MessageCircle,
  Cpu,
  Brain,
  RotateCcw,
  Minimize2,
  FolderOpen,
  Trash2,
  Type,
  Search,
} from "lucide-react"
import { useRegisterCommands, type CommandOption } from "./useCommandPalette"
import { useCommandPalette } from "./useCommandPalette"
import { useSessionStore } from "../stores/session"
import { useSearchStore } from "../stores/search"
import { useSettingsStore } from "../stores/settings"
import { useTerminalStore } from "../stores/terminal"
import { useProjectStore } from "../stores/project"

// ── WS singleton access (for terminal creation) ──────────────

function wsSend(msg: { type: string; data?: Record<string, unknown> }) {
  const singleton = (window as any).__exegolIHE_ws__
  const ws = singleton?.ws as WebSocket | null
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// Chat panel textarea selector (scoped to chat, not any textarea)
const CHAT_TEXTAREA_SELECTOR = "[data-chat-panel] textarea"

// ── Helpers ─────────────────────────────────────────────────

function injectSlashCommand(textarea: HTMLTextAreaElement, command: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, "value",
  )?.set
  nativeInputValueSetter?.call(textarea, command)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

// ── Layout actions interface ────────────────────────────────

export interface LayoutActions {
  toggleFilesPanel: () => void
  toggleChatPanel: () => void
  toggleBottomPanel: () => void
  toggleSessionSidebar: () => void
  swapPanels: () => void
  openSettings: () => void
}

// ── Hook ─────────────────────────────────────────────────────

export function useBuiltinCommands(
  projectId: string,
  layout: LayoutActions,
) {
  const { toggle: paletteToggle } = useCommandPalette()

  const commands = useMemo((): CommandOption[] => {
    // ── General ──────────────────────────────────────────
    const general: CommandOption[] = [
      {
        id: "palette",
        title: "Command Palette",
        category: "General",
        keybind: "mod+shift+p",
        onSelect: () => paletteToggle(),
      },
      {
        id: "settings.open",
        title: "Open Settings",
        category: "General",
        keybind: "mod+,",
        icon: <Settings className="w-3.5 h-3.5" />,
        onSelect: layout.openSettings,
      },
      {
        id: "search.unified",
        title: "Search Everywhere",
        description: "Search terminals, files, and more",
        category: "General",
        keybind: "mod+k",
        icon: <Search className="w-3.5 h-3.5" />,
        onSelect: () => useSearchStore.getState().open(),
      },
    ]

    // ── Session ──────────────────────────────────────────
    const session: CommandOption[] = [
      {
        id: "session.new",
        title: "New Session",
        category: "Session",
        keybind: "mod+shift+n",
        icon: <MessageSquarePlus className="w-3.5 h-3.5" />,
        onSelect: () => useSessionStore.getState().startNewChat(projectId),
      },
      {
        id: "session.compact",
        title: "Compact Context",
        description: "Summarize old messages to free tokens",
        category: "Session",
        icon: <Minimize2 className="w-3.5 h-3.5" />,
        onSelect: () => {
          // Ensure chat panel is open, then trigger /compact via textarea
          layout.toggleChatPanel() // no-op if already open? We need ensureOpen — toggle is fine, user sees it
          const textarea = document.querySelector(CHAT_TEXTAREA_SELECTOR) as HTMLTextAreaElement
          if (!textarea) {
            // Chat panel not rendered — open it first, retry after a tick
            setTimeout(() => {
              const ta = document.querySelector(CHAT_TEXTAREA_SELECTOR) as HTMLTextAreaElement
              if (ta) injectSlashCommand(ta, "/compact")
            }, 100)
            return
          }
          injectSlashCommand(textarea, "/compact")
        },
      },
      {
        id: "session.rename",
        title: "Rename Session",
        category: "Session",
        icon: <Type className="w-3.5 h-3.5" />,
        onSelect: () => {
          const { getActiveSessionId, renameSession, sessions } = useSessionStore.getState()
          const sid = getActiveSessionId(projectId)
          if (!sid) return
          const session = sessions.find((s) => s.id === sid)
          const currentTitle = session?.title ?? ""
          const newTitle = window.prompt("Rename session:", currentTitle)
          if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
            renameSession(sid, newTitle.trim())
          }
        },
      },
      {
        id: "session.delete",
        title: "Delete Session",
        category: "Session",
        icon: <Trash2 className="w-3.5 h-3.5" />,
        onSelect: () => {
          const { getActiveSessionId, deleteSession, sessions } = useSessionStore.getState()
          const sid = getActiveSessionId(projectId)
          if (!sid) return
          const session = sessions.find((s) => s.id === sid)
          const title = session?.title ?? "this session"
          if (window.confirm(`Delete "${title}"?\n\nThis will permanently delete the session and all its messages. This cannot be undone.`)) {
            deleteSession(sid)
          }
        },
      },
    ]

    // ── Navigation ───────────────────────────────────────
    const navigation: CommandOption[] = [
      {
        id: "chat.focus",
        title: "Focus Assistant Input",
        category: "Navigation",
        keybind: "ctrl+l",
        icon: <MessageCircle className="w-3.5 h-3.5" />,
        onSelect: () => {
          const textarea = document.querySelector(CHAT_TEXTAREA_SELECTOR) as HTMLTextAreaElement
          textarea?.focus()
        },
      },
      {
        id: "terminal.focus",
        title: "Focus Terminal",
        category: "Navigation",
        keybind: "ctrl+`",
        icon: <Terminal className="w-3.5 h-3.5" />,
        onSelect: () => {
          // Focus the active terminal's xterm instance
          const term = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement
          term?.focus()
        },
      },
      {
        id: "panel.files",
        title: "Toggle Files Panel",
        category: "Navigation",
        keybind: "mod+b",
        icon: <PanelLeft className="w-3.5 h-3.5" />,
        onSelect: layout.toggleFilesPanel,
      },
      {
        id: "panel.chat",
        title: "Toggle Assistant Panel",
        category: "Navigation",
        keybind: "mod+shift+b",
        icon: <PanelRight className="w-3.5 h-3.5" />,
        onSelect: layout.toggleChatPanel,
      },
      {
        id: "panel.bottom",
        title: "Toggle Bottom Panel",
        category: "Navigation",
        keybind: "mod+j",
        icon: <PanelBottom className="w-3.5 h-3.5" />,
        onSelect: layout.toggleBottomPanel,
      },
      {
        id: "panel.sessions",
        title: "Toggle Session Sidebar",
        category: "Navigation",
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        onSelect: layout.toggleSessionSidebar,
      },
      {
        id: "panel.swap",
        title: "Swap Side Panels",
        description: "Switch files and assistant positions",
        category: "Navigation",
        icon: <ArrowLeftRight className="w-3.5 h-3.5" />,
        onSelect: layout.swapPanels,
      },
    ]

    // ── Terminal ──────────────────────────────────────────
    const terminal: CommandOption[] = [
      {
        id: "terminal.new",
        title: "New Terminal",
        category: "Terminal",
        keybind: "ctrl+alt+t",
        icon: <Plus className="w-3.5 h-3.5" />,
        onSelect: () => {
          const project = useProjectStore.getState().getProject(projectId)
          if (!project?.containerIds?.length) return
          const container = project.containerIds[0]
          // Find next available terminal number
          const terminals = useTerminalStore.getState().terminals
          const usedNumbers = new Set(
            terminals
              .map((t) => t.name.match(/^Terminal (\d+)$/))
              .filter(Boolean)
              .map((m) => parseInt(m![1], 10)),
          )
          let num = 1
          while (usedNumbers.has(num)) num++
          const name = `Terminal ${num}`
          const contentEl = document.querySelector("[data-terminal-content]") as HTMLElement | null
          const cols = contentEl ? Math.floor(contentEl.clientWidth / 8.4) : 120
          const rows = contentEl ? Math.floor(contentEl.clientHeight / 17) : 30
          wsSend({ type: "terminal:create", data: { container, name, cols, rows } })
        },
      },
      {
        id: "terminal.next",
        title: "Next Terminal",
        category: "Terminal",
        keybind: "ctrl+tab",
        icon: <Terminal className="w-3.5 h-3.5" />,
        onSelect: () => {
          const store = useTerminalStore.getState()
          const group = store.groups.find((g) => g.id === store.focusedGroupId) || store.groups[0]
          if (!group || group.terminalIds.length < 2) return
          const activeIdx = group.terminalIds.indexOf(group.activeTerminalId || "")
          const nextIdx = (activeIdx + 1) % group.terminalIds.length
          store.setActiveInGroup(group.id, group.terminalIds[nextIdx])
        },
      },
      {
        id: "terminal.prev",
        title: "Previous Terminal",
        category: "Terminal",
        keybind: "ctrl+shift+tab",
        icon: <Terminal className="w-3.5 h-3.5" />,
        onSelect: () => {
          const store = useTerminalStore.getState()
          const group = store.groups.find((g) => g.id === store.focusedGroupId) || store.groups[0]
          if (!group || group.terminalIds.length < 2) return
          const activeIdx = group.terminalIds.indexOf(group.activeTerminalId || "")
          const prevIdx = (activeIdx - 1 + group.terminalIds.length) % group.terminalIds.length
          store.setActiveInGroup(group.id, group.terminalIds[prevIdx])
        },
      },
    ]

    // ── Model ────────────────────────────────────────────
    const modelAgent: CommandOption[] = [
      {
        id: "thinking.toggle",
        title: "Toggle Thinking",
        description: "Cycle thinking effort: off/low/medium/high",
        category: "Model & Agent",
        icon: <Brain className="w-3.5 h-3.5" />,
        onSelect: () => useSettingsStore.getState().cycleThinkingEffort(),
      },
    ]

    return [...general, ...session, ...navigation, ...terminal, ...modelAgent]
  }, [projectId, layout, paletteToggle])

  useRegisterCommands("builtin", commands)
}
