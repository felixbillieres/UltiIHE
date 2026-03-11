const LAYOUT_KEY = "ultiIHE-layout"

export interface LayoutState {
  chatPanelOpen: boolean
  chatPanelWidth: number
  sessionSidebarOpen: boolean // right-side session list (pushes chat left)
}

export const DEFAULT_LAYOUT: LayoutState = {
  chatPanelOpen: true,
  chatPanelWidth: 420,
  sessionSidebarOpen: false,
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
