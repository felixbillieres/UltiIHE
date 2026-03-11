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
  Bot,
  Cpu,
  Brain,
  RotateCcw,
  Minimize2,
  FolderOpen,
  Trash2,
  Type,
} from "lucide-react"
import { useRegisterCommands, type CommandOption } from "./useCommandPalette"
import { useCommandPalette } from "./useCommandPalette"
import { useSessionStore } from "../stores/session"
import { useSettingsStore } from "../stores/settings"
import { useTerminalStore } from "../stores/terminal"

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
  const palette = useCommandPalette()

  const commands = useMemo((): CommandOption[] => {
    // ── General ──────────────────────────────────────────
    const general: CommandOption[] = [
      {
        id: "palette",
        title: "Command Palette",
        category: "General",
        keybind: "mod+shift+p",
        onSelect: () => palette.toggle(),
      },
      {
        id: "settings.open",
        title: "Open Settings",
        category: "General",
        keybind: "mod+,",
        icon: <Settings className="w-3.5 h-3.5" />,
        onSelect: layout.openSettings,
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
          // Trigger compaction via slash command mechanism
          const textarea = document.querySelector("textarea")
          if (textarea) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, "value",
            )?.set
            nativeInputValueSetter?.call(textarea, "/compact")
            textarea.dispatchEvent(new Event("input", { bubbles: true }))
          }
        },
      },
      {
        id: "session.rename",
        title: "Rename Session",
        category: "Session",
        icon: <Type className="w-3.5 h-3.5" />,
        onSelect: () => {
          // Focus the session title in the sidebar (toggle sidebar if closed)
          layout.toggleSessionSidebar()
        },
      },
      {
        id: "session.delete",
        title: "Delete Session",
        category: "Session",
        icon: <Trash2 className="w-3.5 h-3.5" />,
        onSelect: () => {
          const { activeSessionId, deleteSession } = useSessionStore.getState()
          if (activeSessionId) deleteSession(activeSessionId)
        },
      },
    ]

    // ── Navigation ───────────────────────────────────────
    const navigation: CommandOption[] = [
      {
        id: "chat.focus",
        title: "Focus Chat Input",
        category: "Navigation",
        keybind: "ctrl+l",
        icon: <MessageCircle className="w-3.5 h-3.5" />,
        onSelect: () => {
          const textarea = document.querySelector("textarea")
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
        title: "Toggle Chat Panel",
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
        description: "Switch files and chat positions",
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
          // This requires the WebSocket to create a terminal
          // For now, focus terminal area which shows create UI
          const term = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement
          term?.focus()
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

    // ── Model & Agent ────────────────────────────────────
    const modelAgent: CommandOption[] = [
      {
        id: "agent.cycle",
        title: "Cycle Agent",
        description: "Switch between build/recon/exploit/report",
        category: "Model & Agent",
        keybind: "mod+.",
        icon: <Bot className="w-3.5 h-3.5" />,
        onSelect: () => {
          const store = useSettingsStore.getState()
          const agents: Array<"build" | "recon" | "exploit" | "report"> = ["build", "recon", "exploit", "report"]
          const idx = agents.indexOf(store.activeAgent)
          store.setActiveAgent(agents[(idx + 1) % agents.length])
        },
      },
      {
        id: "agent.build",
        title: "Switch to Build Agent",
        category: "Model & Agent",
        icon: <Bot className="w-3.5 h-3.5" />,
        onSelect: () => useSettingsStore.getState().setActiveAgent("build"),
      },
      {
        id: "agent.recon",
        title: "Switch to Recon Agent",
        category: "Model & Agent",
        icon: <Bot className="w-3.5 h-3.5" />,
        onSelect: () => useSettingsStore.getState().setActiveAgent("recon"),
      },
      {
        id: "agent.exploit",
        title: "Switch to Exploit Agent",
        category: "Model & Agent",
        icon: <Bot className="w-3.5 h-3.5" />,
        onSelect: () => useSettingsStore.getState().setActiveAgent("exploit"),
      },
      {
        id: "agent.report",
        title: "Switch to Report Agent",
        category: "Model & Agent",
        icon: <Bot className="w-3.5 h-3.5" />,
        onSelect: () => useSettingsStore.getState().setActiveAgent("report"),
      },
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
  }, [projectId, layout, palette])

  useRegisterCommands("builtin", commands)
}
