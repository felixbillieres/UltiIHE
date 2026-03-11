import type { KeybindAction } from "../settingsTypes"

export const DEFAULT_KEYBINDS: KeybindAction[] = [
  // General
  {
    id: "command-palette",
    label: "Command Palette",
    group: "General",
    defaultKey: "Ctrl+Shift+P",
  },
  {
    id: "settings",
    label: "Open Settings",
    group: "General",
    defaultKey: "Ctrl+,",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    group: "General",
    defaultKey: "Ctrl+B",
  },

  // Session
  {
    id: "new-session",
    label: "New Session",
    group: "Session",
    defaultKey: "Ctrl+N",
  },
  {
    id: "archive-session",
    label: "Archive Session",
    group: "Session",
    defaultKey: "Ctrl+W",
  },

  // Navigation
  {
    id: "focus-chat",
    label: "Focus Chat Panel",
    group: "Navigation",
    defaultKey: "Ctrl+L",
  },
  {
    id: "focus-terminal",
    label: "Focus Terminal",
    group: "Navigation",
    defaultKey: "Ctrl+`",
  },

  // Terminal
  {
    id: "new-terminal",
    label: "New Terminal",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+T",
  },
  {
    id: "close-terminal",
    label: "Close Terminal",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+W",
  },
  {
    id: "next-terminal",
    label: "Next Terminal",
    group: "Terminal",
    defaultKey: "Ctrl+Tab",
  },
  {
    id: "split-horizontal",
    label: "Split Horizontal",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+H",
  },
  {
    id: "split-vertical",
    label: "Split Vertical",
    group: "Terminal",
    defaultKey: "Ctrl+Shift+V",
  },

  // Prompt
  {
    id: "send-message",
    label: "Send Message",
    group: "Prompt",
    defaultKey: "Enter",
  },
  {
    id: "new-line",
    label: "New Line",
    group: "Prompt",
    defaultKey: "Shift+Enter",
  },
  {
    id: "stop-generation",
    label: "Stop Generation",
    group: "Prompt",
    defaultKey: "Escape",
  },
]
