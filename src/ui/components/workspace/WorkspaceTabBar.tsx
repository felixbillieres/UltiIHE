import { useState, useRef } from "react"
import {
  useWorkspaceStore,
  type TabType,
  type WorkspaceTab,
} from "../../stores/workspace"
import { useFileStore } from "../../stores/files"
import { useTerminalStore } from "../../stores/terminal"
import {
  Terminal,
  FileText,
  Globe,
  X,
  Pin,
  PinOff,
  Filter,
  Plus,
  Loader2,
  Save,
} from "lucide-react"
import { useWebToolsStore, WEB_TOOLS } from "../../stores/webtools"
import { TOOL_ICONS } from "../terminal/terminalConstants"

// ─── Tab type icons & colors ─────────────────────────────────

const TAB_TYPE_ICON: Record<TabType, React.ReactNode> = {
  terminal: <Terminal className="w-3 h-3 shrink-0" />,
  file: <FileText className="w-3 h-3 shrink-0" />,
  webtool: <Globe className="w-3 h-3 shrink-0" />,
}

const TAB_TYPE_ACCENT: Record<TabType, string> = {
  terminal: "bg-green-500",
  file: "bg-blue-500",
  webtool: "bg-purple-500",
}

const FILTER_LABELS: { type: TabType | null; label: string }[] = [
  { type: null, label: "All" },
  { type: "terminal", label: "Terminals" },
  { type: "file", label: "Files" },
  { type: "webtool", label: "Tools" },
]

// ─── Tab Bar ────────────────────────────────────────────────

interface WorkspaceTabBarProps {
  containerIds: string[]
  connected: boolean
  onAddTerminal: (container?: string) => void
  onLaunchTool: (id: string) => void
}

export function WorkspaceTabBar({
  containerIds,
  connected,
  onAddTerminal,
  onLaunchTool,
}: WorkspaceTabBarProps) {
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const filter = useWorkspaceStore((s) => s.filter)
  const setFilter = useWorkspaceStore((s) => s.setFilter)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)
  const removeTab = useWorkspaceStore((s) => s.removeTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const togglePin = useWorkspaceStore((s) => s.togglePin)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  // Filter tabs
  const visibleTabs = filter ? tabs.filter((t) => t.type === filter) : tabs
  // Sort: pinned first
  const sortedTabs = [
    ...visibleTabs.filter((t) => t.pinned),
    ...visibleTabs.filter((t) => !t.pinned),
  ]

  const handleDoubleClick = (id: string, currentTitle: string) => {
    setEditingTabId(id)
    setEditingName(currentTitle)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editingTabId && editingName.trim()) {
      renameTab(editingTabId, editingName.trim())
      // Sync terminal store if this is a terminal tab
      const tab = tabs.find((t) => t.id === editingTabId)
      if (tab?.type === "terminal" && tab.terminalId) {
        useTerminalStore.getState().renameTerminal(tab.terminalId, editingName.trim())
      }
    }
    setEditingTabId(null)
  }

  // Count by type (for filter badges)
  const counts = {
    terminal: tabs.filter((t) => t.type === "terminal").length,
    file: tabs.filter((t) => t.type === "file").length,
    webtool: tabs.filter((t) => t.type === "webtool").length,
  }
  const hasMultipleTypes =
    (counts.terminal > 0 ? 1 : 0) +
    (counts.file > 0 ? 1 : 0) +
    (counts.webtool > 0 ? 1 : 0) > 1

  return (
    <div className="flex flex-col border-b border-border-weak bg-surface-1 shrink-0">
      {/* Tab bar */}
      <div className="flex items-center min-w-0">
        {/* Filter chips — only show when there are mixed types */}
        {hasMultipleTypes && (
          <div className="shrink-0 flex items-center gap-0.5 pl-2 pr-1 border-r border-border-weak">
            <Filter className="w-3 h-3 text-text-weaker mr-0.5" />
            {FILTER_LABELS.map(({ type, label }) => {
              const isActive = filter === type
              const count =
                type === null
                  ? tabs.length
                  : counts[type as TabType]
              if (type !== null && count === 0) return null
              return (
                <button
                  key={label}
                  onClick={() => setFilter(isActive ? null : type)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-sans transition-colors ${
                    isActive
                      ? "bg-accent/20 text-accent"
                      : "text-text-weaker hover:text-text-weak hover:bg-surface-2/50"
                  }`}
                >
                  {label}
                  {type !== null && (
                    <span className="ml-0.5 opacity-60">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Scrollable tabs */}
        <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-0.5 px-1.5 py-1.5 scrollbar-none">
          {sortedTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isEditing={editingTabId === tab.id}
              editingName={editingName}
              editInputRef={editInputRef}
              containerIds={containerIds}
              onClick={() => {
                setActiveTab(tab.id)
                // Clear notification on click
                if (tab.hasNotification) {
                  useWorkspaceStore.getState().setTabNotification(tab.id, false)
                }
              }}
              onClose={() => removeTab(tab.id)}
              onDoubleClick={() => handleDoubleClick(tab.id, tab.title)}
              onEditChange={setEditingName}
              onEditCommit={commitRename}
              onEditCancel={() => setEditingTabId(null)}
              onTogglePin={() => togglePin(tab.id)}
            />
          ))}

          {sortedTabs.length === 0 && (
            <span className="text-[11px] text-text-weaker font-sans px-2">
              {filter ? `No ${filter} tabs` : "No open tabs"}
            </span>
          )}
        </div>

        {/* Add buttons */}
        <div className="shrink-0 flex items-center gap-0.5 px-1.5 py-1.5 border-l border-border-weak">
          {/* New terminal */}
          <button
            onClick={() => onAddTerminal()}
            disabled={!connected || containerIds.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-weak hover:text-text-base hover:bg-surface-2 transition-colors disabled:opacity-30 font-sans"
            title="New terminal"
          >
            <Plus className="w-3 h-3" />
            <Terminal className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Individual tab ─────────────────────────────────────────

function TabItem({
  tab,
  isActive,
  isEditing,
  editingName,
  editInputRef,
  containerIds,
  onClick,
  onClose,
  onDoubleClick,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onTogglePin,
}: {
  tab: WorkspaceTab
  isActive: boolean
  isEditing: boolean
  editingName: string
  editInputRef: React.RefObject<HTMLInputElement>
  containerIds: string[]
  onClick: () => void
  onClose: () => void
  onDoubleClick: () => void
  onEditChange: (name: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onTogglePin: () => void
}) {
  const fileDirty = useFileStore(
    (s) => tab.type === "file" && tab.fileId
      ? s.openFiles.find((f) => f.id === tab.fileId)?.isDirty || false
      : false,
  )
  const fileSaving = useFileStore(
    (s) => tab.type === "file" && tab.fileId ? s.savingFiles.has(tab.fileId) : false,
  )
  const toolStatus = useWebToolsStore(
    (s) => tab.type === "webtool" && tab.toolId ? s.runningTools[tab.toolId]?.status : undefined,
  )

  const icon = getTabIcon(tab, toolStatus)
  const showMultiContainer = containerIds.length > 1

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`flex items-center gap-1.5 pl-2 pr-1 py-1 rounded text-xs cursor-pointer transition-colors group shrink-0 relative ${
        isActive
          ? "bg-surface-2 text-text-strong"
          : "text-text-weak hover:bg-surface-2/50"
      }`}
    >
      {/* Color accent line at top */}
      {isActive && (
        <div
          className={`absolute top-0 left-1 right-1 h-[2px] rounded-b ${TAB_TYPE_ACCENT[tab.type]}`}
        />
      )}

      {/* Pin indicator */}
      {tab.pinned && (
        <Pin className="w-2.5 h-2.5 text-accent/50 shrink-0" />
      )}

      {/* Icon */}
      {icon}

      {/* Notification dot */}
      {tab.hasNotification && !isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
      )}

      {/* Dirty indicator for files */}
      {fileDirty && !fileSaving && (
        <span className="w-2 h-2 rounded-full bg-accent/60 shrink-0" />
      )}
      {fileSaving && (
        <Loader2 className="w-3 h-3 animate-spin text-accent shrink-0" />
      )}

      {/* Title + container stacked */}
      <div className="flex flex-col min-w-0 leading-tight">
        {isEditing ? (
          <input
            ref={editInputRef}
            value={editingName}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditCommit()
              if (e.key === "Escape") onEditCancel()
            }}
            className="bg-transparent border-b border-accent text-xs text-text-strong outline-none w-20"
            autoFocus
          />
        ) : (
          <span className="truncate max-w-[120px] text-[11px]">{tab.title}</span>
        )}
        {showMultiContainer && tab.container && (
          <span className="truncate max-w-[100px] text-[9px] font-mono text-accent/60">
            {tab.container.replace(/^exegol-/, "")}
          </span>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-0.5"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Icon helper ────────────────────────────────────────────

function getTabIcon(
  tab: WorkspaceTab,
  toolStatus?: string,
): React.ReactNode {
  if (tab.type === "webtool") {
    if (toolStatus === "starting") {
      return <Loader2 className="w-3 h-3 shrink-0 animate-spin text-accent" />
    }
    // Try to get tool-specific icon
    const tool = WEB_TOOLS.find((t) => t.id === tab.toolId)
    if (tool && TOOL_ICONS[tool.icon]) {
      return TOOL_ICONS[tool.icon]
    }
    return <Globe className="w-3 h-3 shrink-0 text-purple-400" />
  }
  if (tab.type === "file") {
    return <FileText className="w-3 h-3 shrink-0 text-blue-400" />
  }
  return <Terminal className="w-3 h-3 shrink-0 text-green-400" />
}
