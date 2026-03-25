const LAYOUT_KEY = "exegol-ihe-layout"

export type LayoutPreset = "default" | "focus" | "editor" | "terminal" | "recon"

export interface LayoutState {
  chatPanelOpen: boolean
  chatPanelWidth: number
  filesPanelOpen: boolean
  filesPanelWidth: number
  sessionSidebarOpen: boolean
  swapped: boolean // false = files left + chat right, true = chat left + files right
  bottomPanelOpen: boolean
  bottomPanelHeight: number
  activePreset?: LayoutPreset
}

export const DEFAULT_LAYOUT: LayoutState = {
  chatPanelOpen: true,
  chatPanelWidth: 360,
  filesPanelOpen: true,
  filesPanelWidth: 280,
  sessionSidebarOpen: false,
  swapped: false,
  bottomPanelOpen: false,
  bottomPanelHeight: 280,
  activePreset: "default",
}

export const LAYOUT_PRESETS: Record<LayoutPreset, { label: string; description: string; panels: Partial<LayoutState> }> = {
  default: {
    label: "Default",
    description: "Files + Terminals + Chat",
    panels: { filesPanelOpen: true, chatPanelOpen: true, bottomPanelOpen: false },
  },
  focus: {
    label: "Focus",
    description: "Terminals + Assistant (no files)",
    panels: { filesPanelOpen: false, chatPanelOpen: true, bottomPanelOpen: false },
  },
  editor: {
    label: "Editor",
    description: "Files + Terminals (no chat)",
    panels: { filesPanelOpen: true, chatPanelOpen: false, bottomPanelOpen: false },
  },
  terminal: {
    label: "Terminal",
    description: "Full screen terminals",
    panels: { filesPanelOpen: false, chatPanelOpen: false, bottomPanelOpen: false },
  },
  recon: {
    label: "Recon",
    description: "Everything open — full workspace",
    panels: { filesPanelOpen: true, chatPanelOpen: true, bottomPanelOpen: true },
  },
}

export function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_LAYOUT
}

export function saveLayout(state: LayoutState) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(state))
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
