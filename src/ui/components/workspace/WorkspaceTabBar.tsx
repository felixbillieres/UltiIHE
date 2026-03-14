import { useState, useRef, useMemo, useCallback, useEffect } from "react"
import {
  useWorkspaceStore,
  type TabType,
  type WorkspaceTab,
} from "../../stores/workspace"
import { useFileStore } from "../../stores/files"
import { useTerminalStore } from "../../stores/terminal"
import { useProjectStore } from "../../stores/project"
import {
  Terminal,
  FileText,
  Globe,
  X,
  Pin,
  Filter,
  Loader2,
  ExternalLink,
  PenLine,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Merge,
  Camera,
} from "lucide-react"
import { toast } from "sonner"
import { usePopOutStore } from "../../stores/popout"
import { useOpsStore } from "../../stores/operations"
import { useWebToolsStore, WEB_TOOLS, toolKey } from "../../stores/webtools"
import { TOOL_ICONS } from "../terminal/terminalConstants"
import { NewTerminalButton } from "../terminal/NewTerminalButton"
import { WebToolsDropdown } from "../terminal/WebToolsDropdown"

// ─── Tab type icons & colors ─────────────────────────────────

const TAB_TYPE_ICON: Record<TabType, React.ReactNode> = {
  terminal: <Terminal className="w-3 h-3 shrink-0" />,
  file: <FileText className="w-3 h-3 shrink-0" />,
  webtool: <Globe className="w-3 h-3 shrink-0" />,
}

const TAB_TYPE_ACCENT: Record<TabType, string> = {
  terminal: "bg-text-weaker",
  file: "bg-text-weaker",
  webtool: "bg-text-weaker",
}

const FILTER_LABELS: { type: TabType | null; label: string }[] = [
  { type: null, label: "All" },
  { type: "terminal", label: "Terminals" },
  { type: "file", label: "Files" },
  { type: "webtool", label: "Tools" },
]

// ─── Context Menu ────────────────────────────────────────────

function TabContextMenu({
  tab,
  x,
  y,
  onClose,
  onRename,
  onTogglePin,
  onPopOut,
  onCloseTab,
  onSplitRight,
  onSplitDown,
  canSplit,
}: {
  tab: WorkspaceTab
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onTogglePin: () => void
  onPopOut: () => void
  onCloseTab: () => void
  onSplitRight: () => void
  onSplitDown: () => void
  canSplit: boolean
}) {
  return (
    <div
      className="fixed z-50 min-w-[180px] bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {tab.type === "terminal" && (
        <button
          onClick={() => { onRename(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
        >
          <PenLine className="w-3.5 h-3.5 shrink-0" />
          Rename
        </button>
      )}
      <button
        onClick={() => { onTogglePin(); onClose() }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
      >
        <Pin className="w-3.5 h-3.5 shrink-0" />
        {tab.pinned ? "Unpin" : "Pin"}
      </button>
      <button
        onClick={() => { onPopOut(); onClose() }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        Pop out
      </button>

      {tab.type === "terminal" && (
        <>
          <div className="h-px bg-border-weak my-1" />
          <button
            onClick={() => { onSplitRight(); onClose() }}
            disabled={!canSplit}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              canSplit ? "text-text-base hover:bg-surface-3" : "text-text-weaker cursor-not-allowed"
            }`}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5 shrink-0" />
            Split Right
          </button>
          <button
            onClick={() => { onSplitDown(); onClose() }}
            disabled={!canSplit}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              canSplit ? "text-text-base hover:bg-surface-3" : "text-text-weaker cursor-not-allowed"
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5 shrink-0" />
            Split Down
          </button>
        </>
      )}

      <div className="h-px bg-border-weak my-1" />
      <button
        onClick={() => { onCloseTab(); onClose() }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-status-error hover:bg-status-error/10 transition-colors"
      >
        <X className="w-3.5 h-3.5 shrink-0" />
        Close
      </button>
      <button
        onClick={() => {
          const tabs = useWorkspaceStore.getState().tabs
          tabs.filter((t) => t.id !== tab.id).forEach((t) => useWorkspaceStore.getState().removeTab(t.id))
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
      >
        <X className="w-3.5 h-3.5 shrink-0" />
        Close Others
      </button>
      <button
        onClick={() => {
          const tabs = useWorkspaceStore.getState().tabs
          tabs.forEach((t) => useWorkspaceStore.getState().removeTab(t.id))
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
      >
        <X className="w-3.5 h-3.5 shrink-0" />
        Close All
      </button>
    </div>
  )
}

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
  const allTabs = useWorkspaceStore((s) => s.tabs)
  const currentProjectId = useWorkspaceStore((s) => s._currentProjectId)
  const activeTabId = useWorkspaceStore((s) => {
    const pid = s._currentProjectId
    return pid ? s.activeTabIdByProject[pid] ?? null : null
  })
  const filter = useWorkspaceStore((s) => s.filter)
  const tabs = useMemo(() => {
    let filtered = currentProjectId ? allTabs.filter((t) => t.projectId === currentProjectId) : allTabs
    if (filter) filtered = filtered.filter((t) => t.type === filter)
    return filtered
  }, [allTabs, currentProjectId, filter])
  const setFilter = useWorkspaceStore((s) => s.setFilter)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)
  const removeTab = useWorkspaceStore((s) => s.removeTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const togglePin = useWorkspaceStore((s) => s.togglePin)
  const reorderTab = useWorkspaceStore((s) => s.reorderTab)
  const splitTerminal = useTerminalStore((s) => s.splitTerminal)
  const unsplitAll = useTerminalStore((s) => s.unsplitAll)
  const terminalGroups = useTerminalStore((s) => s.groups)
  const terminalCount = useTerminalStore((s) => s.terminals.length)
  const isSplit = terminalGroups.length > 1

  // Collect open tool tab IDs for WebToolsDropdown
  const openToolTabIds = tabs
    .filter((t) => t.type === "webtool" && t.toolId)
    .map((t) => t.toolId!)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  // Drag & drop state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; side: "before" | "after" } | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    tab: WorkspaceTab
  } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [contextMenu])

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

  // Drag & drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggingId(tabId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", tabId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    const side = e.clientX < midX ? "before" : "after"
    setDropTarget({ id: tabId, side })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData("text/plain")
    if (!draggedId || draggedId === tabId) {
      setDraggingId(null)
      setDropTarget(null)
      return
    }

    const allTabsNow = useWorkspaceStore.getState().tabs
    const fromIndex = allTabsNow.findIndex((t) => t.id === draggedId)
    let toIndex = allTabsNow.findIndex((t) => t.id === tabId)
    if (fromIndex === -1 || toIndex === -1) return

    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    if (e.clientX >= midX && fromIndex < toIndex) {
      // dropping after, already in right position
    } else if (e.clientX < midX && fromIndex > toIndex) {
      // dropping before, already in right position
    } else if (e.clientX >= midX) {
      toIndex += 1
    }

    if (fromIndex < toIndex) toIndex -= 1

    reorderTab(fromIndex, toIndex)
    setDraggingId(null)
    setDropTarget(null)
  }, [reorderTab])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropTarget(null)
  }, [])

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
    <div className="flex flex-col bg-surface-1 shrink-0">
      {/* Tab bar */}
      <div className="flex items-stretch min-w-0 border-b border-border-weak">
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
        <div
          className="flex-1 min-w-0 overflow-x-auto flex items-end gap-0 scrollbar-none"
          onDragLeave={() => setDropTarget(null)}
        >
          {sortedTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isEditing={editingTabId === tab.id}
              editingName={editingName}
              editInputRef={editInputRef}
              containerIds={containerIds}
              isDragging={draggingId === tab.id}
              dropIndicator={dropTarget?.id === tab.id ? dropTarget.side : null}
              onClick={() => {
                setActiveTab(tab.id)
                if (tab.hasNotification) {
                  useWorkspaceStore.getState().setTabNotification(tab.id, false)
                }
              }}
              onClose={() => removeTab(tab.id)}
              onPopOut={() => {
                usePopOutStore.getState().popOut({
                  tabId: tab.id,
                  type: tab.type === "webtool" ? "tool" : tab.type,
                  windowRef: null,
                  title: tab.title,
                  terminalId: tab.terminalId,
                  fileId: tab.fileId,
                  toolId: tab.toolId,
                  container: tab.container,
                })
              }}
              onDoubleClick={() => handleDoubleClick(tab.id, tab.title)}
              onEditChange={setEditingName}
              onEditCommit={commitRename}
              onEditCancel={() => setEditingTabId(null)}
              onTogglePin={() => togglePin(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, tab })
              }}
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {sortedTabs.length === 0 && (
            <span className="text-[11px] text-text-weaker font-sans px-2 py-1.5">
              {filter ? `No ${filter} tabs` : "No open tabs"}
            </span>
          )}
        </div>

        {/* Add buttons */}
        <div className="shrink-0 flex items-center gap-0.5 px-1.5 py-1.5 border-l border-border-weak">
          <NewTerminalButton
            containerIds={containerIds}
            connected={connected}
            onAdd={onAddTerminal}
            compact
          />

          {/* Split / Unsplit buttons */}
          {isSplit ? (
            <button
              onClick={unsplitAll}
              className="p-1 rounded text-text-weaker hover:bg-surface-2/50 hover:text-text-weak transition-colors"
              title="Merge all split panes"
            >
              <Merge className="w-3.5 h-3.5" />
            </button>
          ) : (
            terminalCount >= 2 && (
              <>
                <button
                  onClick={() => {
                    const active = useTerminalStore.getState().activeTerminalId
                    if (active) splitTerminal(active, "horizontal")
                  }}
                  className="p-1 rounded text-text-weaker hover:bg-surface-2/50 hover:text-text-weak transition-colors"
                  title="Split right"
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const active = useTerminalStore.getState().activeTerminalId
                    if (active) splitTerminal(active, "vertical")
                  }}
                  className="p-1 rounded text-text-weaker hover:bg-surface-2/50 hover:text-text-weak transition-colors"
                  title="Split down"
                >
                  <SplitSquareVertical className="w-3.5 h-3.5" />
                </button>
              </>
            )
          )}

          <WebToolsDropdown
            openToolTabs={openToolTabIds}
            onLaunch={onLaunchTool}
            onSettings={() => {}}
          />

          {/* Screenshot button */}
          <ScreenshotButton containerIds={containerIds} />
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onRename={() => handleDoubleClick(contextMenu.tab.id, contextMenu.tab.title)}
          onTogglePin={() => togglePin(contextMenu.tab.id)}
          onPopOut={() => {
            usePopOutStore.getState().popOut({
              tabId: contextMenu.tab.id,
              type: contextMenu.tab.type === "webtool" ? "tool" : contextMenu.tab.type,
              windowRef: null,
              title: contextMenu.tab.title,
              terminalId: contextMenu.tab.terminalId,
              fileId: contextMenu.tab.fileId,
              toolId: contextMenu.tab.toolId,
              container: contextMenu.tab.container,
            })
          }}
          onCloseTab={() => removeTab(contextMenu.tab.id)}
          onSplitRight={() => {
            if (contextMenu.tab.terminalId) {
              splitTerminal(contextMenu.tab.terminalId, "horizontal")
            }
          }}
          onSplitDown={() => {
            if (contextMenu.tab.terminalId) {
              splitTerminal(contextMenu.tab.terminalId, "vertical")
            }
          }}
          canSplit={contextMenu.tab.type === "terminal" && terminalCount >= 2}
        />
      )}
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
  isDragging,
  dropIndicator,
  onClick,
  onClose,
  onPopOut,
  onDoubleClick,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onTogglePin,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  tab: WorkspaceTab
  isActive: boolean
  isEditing: boolean
  editingName: string
  editInputRef: React.RefObject<HTMLInputElement>
  containerIds: string[]
  isDragging: boolean
  dropIndicator: "before" | "after" | null
  onClick: () => void
  onClose: () => void
  onPopOut: () => void
  onDoubleClick: () => void
  onEditChange: (name: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onTogglePin: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const isPoppedOut = usePopOutStore((s) => s.isPopedOut(tab.id))
  const fileDirty = useFileStore(
    (s) => tab.type === "file" && tab.fileId
      ? s.openFiles.find((f) => f.id === tab.fileId)?.isDirty || false
      : false,
  )
  const fileSaving = useFileStore(
    (s) => tab.type === "file" && tab.fileId ? s.savingFiles.has(tab.fileId) : false,
  )
  const toolStatus = useWebToolsStore(
    (s) => tab.type === "webtool" && tab.toolId && tab.container
      ? s.runningTools[toolKey(tab.toolId, tab.container)]?.status
      : undefined,
  )
  const terminalRunning = useOpsStore(
    (s) => tab.type === "terminal" && tab.terminalId
      ? s.operations.some((op) => op.terminalId === tab.terminalId && op.status === "running")
      : false,
  )

  const icon = getTabIcon(tab, toolStatus, terminalRunning)
  const showMultiContainer = containerIds.length > 1

  return (
    <div
      className="relative flex items-center shrink-0 -mb-px"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drop indicator — before */}
      {dropIndicator === "before" && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent z-20 -translate-x-px" />
      )}

      <div
        draggable={!isEditing}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        className={`relative flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 text-xs cursor-pointer transition-colors group shrink-0 ${
          isActive
            ? "bg-surface-0 text-text-strong border-b-2 border-b-accent z-10"
            : "text-text-weak hover:bg-surface-2/50 border-b border-b-transparent"
        } ${isDragging ? "opacity-50" : ""}`}
      >
        {/* Vertical separator — only on inactive tabs */}
        {!isActive && (
          <div className="absolute right-0 top-[6px] bottom-[6px] w-px bg-border-weak" />
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

        {/* Pop-out button */}
        {!isPoppedOut && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPopOut()
            }}
            className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-0.5"
            title="Pop out to separate window"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        )}
        {/* Re-attach indicator */}
        {isPoppedOut && (
          <span className="text-[8px] text-accent font-sans shrink-0 ml-0.5">
            ↗
          </span>
        )}
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

      {/* Drop indicator — after */}
      {dropIndicator === "after" && (
        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-accent z-20 translate-x-px" />
      )}
    </div>
  )
}

// ─── Screenshot button ──────────────────────────────────────

function ScreenshotButton({ containerIds }: { containerIds: string[] }) {
  const [capturing, setCapturing] = useState(false)

  const handleScreenshot = useCallback(async () => {
    const target = document.querySelector("[data-terminal-content]") as HTMLElement | null
    if (!target) {
      toast.error("No terminal area to capture")
      return
    }
    const container = containerIds[0]
    if (!container) {
      toast.error("No container available")
      return
    }

    setCapturing(true)
    try {
      // Dynamic import to avoid loading html2canvas eagerly
      const { default: html2canvas } = await import("html2canvas")
      const canvas = await html2canvas(target, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
        logging: false,
      })

      // Convert to PNG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))), "image/png")
      })

      // Build filename: containerName_YYYY-MM-DD_HH-MM-SS.png
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
      const filename = `${container}_${timestamp}.png`
      const remotePath = `/workspace/.ihe/screenshots/${filename}`

      // Convert blob to base64
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          // Strip "data:image/png;base64," prefix
          resolve(result.split(",")[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      // Ensure directory exists and write file via docker exec
      const res = await fetch(`/api/files/${container}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: remotePath,
          contentBase64: base64,
          mkdir: true,
        }),
      })

      if (!res.ok) {
        // Fallback: write via plain content endpoint if base64 not supported
        // Just offer local download instead
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        toast.success(`Screenshot saved locally: ${filename}`)
        return
      }

      toast.success(`Screenshot saved: ${remotePath}`)
    } catch (err) {
      console.error("[Screenshot]", err)
      toast.error("Screenshot failed")
    } finally {
      setCapturing(false)
    }
  }, [containerIds])

  return (
    <button
      onClick={handleScreenshot}
      disabled={capturing}
      className="p-1 rounded text-text-weaker hover:bg-surface-2/50 hover:text-text-weak transition-colors disabled:opacity-40"
      title="Screenshot terminals"
    >
      {capturing
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Camera className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── Icon helper ────────────────────────────────────────────

function getTabIcon(
  tab: WorkspaceTab,
  toolStatus?: string,
  terminalRunning?: boolean,
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
    return <Globe className="w-3 h-3 shrink-0 text-text-weaker" />
  }
  if (tab.type === "file") {
    return <FileText className="w-3 h-3 shrink-0 text-text-weaker" />
  }
  if (terminalRunning) {
    return <Loader2 className="w-3 h-3 shrink-0 animate-spin text-accent" />
  }
  return <Terminal className="w-3 h-3 shrink-0 text-text-weaker" />
}
