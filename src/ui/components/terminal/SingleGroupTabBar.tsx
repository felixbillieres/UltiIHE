import { useState, useRef, useEffect, useCallback } from "react"
import {
  useTerminalStore,
  type TerminalGroup,
} from "../../stores/terminal"
import { WEB_TOOLS, type RunningToolInfo } from "../../stores/webtools"
import {
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Loader2,
} from "lucide-react"
import type { WSMessage } from "../../hooks/useWebSocket"
import { TOOL_ICONS } from "./terminalConstants"
import { NewTerminalButton } from "./NewTerminalButton"
import { WebToolsDropdown } from "./WebToolsDropdown"
import { TerminalTab } from "./TerminalTab"
import { ContextMenu } from "./TerminalContextMenu"

interface SingleGroupTabBarProps {
  group: TerminalGroup
  send: (msg: WSMessage) => void
  handleAddTerminal: (containerName?: string) => void
  containerIds: string[]
  connected: boolean
  activeToolTab: string | null
  openToolTabs: string[]
  runningTools: Record<string, RunningToolInfo>
  onToolTabClick: (id: string) => void
  onToolTabClose: (id: string) => void
  onLaunchTool: (id: string) => void
  onToolSettings: () => void
}

export function SingleGroupTabBar({
  group,
  send,
  handleAddTerminal,
  containerIds,
  connected,
  activeToolTab,
  openToolTabs,
  runningTools,
  onToolTabClick,
  onToolTabClose,
  onLaunchTool,
  onToolSettings,
}: SingleGroupTabBarProps) {
  const terminals = useTerminalStore((s) => s.terminals)
  const setActiveInGroup = useTerminalStore((s) => s.setActiveInGroup)
  const removeTerminal = useTerminalStore((s) => s.removeTerminal)
  const renameTerminal = useTerminalStore((s) => s.renameTerminal)
  const setNotification = useTerminalStore((s) => s.setNotification)
  const splitTerminal = useTerminalStore((s) => s.splitTerminal)
  const reorderTerminal = useTerminalStore((s) => s.reorderTerminal)

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
    terminalId: string
  } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [contextMenu])

  const groupTerminals = group.terminalIds
    .map((id) => terminals.find((t) => t.id === id))
    .filter(Boolean) as typeof terminals

  const handleTabClick = (terminalId: string) => {
    setActiveInGroup(group.id, terminalId)
    setNotification(terminalId, false)
    if (activeToolTab) onToolTabClick("")
  }

  const handleCloseTab = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation()
    send({ type: "terminal:close", data: { terminalId } })
    removeTerminal(terminalId)
  }

  const handleDoubleClick = (id: string, currentName: string) => {
    setEditingTabId(id)
    setEditingName(currentName)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editingTabId && editingName.trim()) {
      renameTerminal(editingTabId, editingName.trim())
    }
    setEditingTabId(null)
  }

  const handleDragStart = useCallback((e: React.DragEvent, terminalId: string) => {
    setDraggingId(terminalId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", terminalId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, terminalId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    const side = e.clientX < midX ? "before" : "after"
    setDropTarget({ id: terminalId, side })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, terminalId: string) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData("text/plain")
    if (!draggedId || draggedId === terminalId) {
      setDraggingId(null)
      setDropTarget(null)
      return
    }

    const fromIndex = group.terminalIds.indexOf(draggedId)
    let toIndex = group.terminalIds.indexOf(terminalId)
    if (fromIndex === -1 || toIndex === -1) return

    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    if (e.clientX >= midX && fromIndex < toIndex) {
      // already right of target, keep index
    } else if (e.clientX < midX && fromIndex > toIndex) {
      // already left of target, keep index
    } else if (e.clientX >= midX) {
      toIndex += 1
    }

    // Adjust for removal
    if (fromIndex < toIndex) toIndex -= 1

    reorderTerminal(group.id, fromIndex, toIndex)
    setDraggingId(null)
    setDropTarget(null)
  }, [group.id, group.terminalIds, reorderTerminal])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropTarget(null)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, terminalId })
  }

  return (
    <div className="flex items-stretch border-b border-border-weak bg-surface-1 shrink-0 min-w-0">
      {/* Scrollable tab area */}
      <div
        className="flex-1 min-w-0 overflow-x-auto flex items-end gap-0 scrollbar-none"
        onDragLeave={() => setDropTarget(null)}
      >
        {groupTerminals.map((t, index) => (
          <TerminalTab
            key={t.id}
            terminal={t}
            isActive={t.id === group.activeTerminalId && !activeToolTab}
            colorIndex={index}
            isEditing={editingTabId === t.id}
            editName={editingName}
            containerIds={containerIds}
            onSelect={() => handleTabClick(t.id)}
            onClose={(e) => handleCloseTab(e, t.id)}
            onDoubleClick={() => handleDoubleClick(t.id, t.name)}
            onContextMenu={(e) => handleContextMenu(e, t.id)}
            onEditChange={setEditingName}
            onEditCommit={commitRename}
            onEditCancel={() => setEditingTabId(null)}
            editInputRef={editInputRef}
            onDragStart={(e) => handleDragStart(e, t.id)}
            onDragOver={(e) => handleDragOver(e, t.id)}
            onDrop={(e) => handleDrop(e, t.id)}
            onDragEnd={handleDragEnd}
            isDragging={draggingId === t.id}
            dropIndicator={dropTarget?.id === t.id ? dropTarget.side : null}
          />
        ))}

        {/* Open web tool tabs */}
        {openToolTabs.map((toolId) => {
          const tool = WEB_TOOLS.find((t) => t.id === toolId)
          if (!tool) return null
          const toolInfo = runningTools[toolId]
          const isStarting = toolInfo?.status === "starting"
          return (
            <div
              key={toolId}
              onClick={() => onToolTabClick(toolId)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors group shrink-0 -mb-px ${
                activeToolTab === toolId
                  ? "bg-surface-0 text-text-strong border-b-2 border-b-accent z-10"
                  : "text-text-weak hover:bg-surface-2/50 border-b border-b-transparent"
              }`}
            >
              {/* Vertical separator for inactive tabs */}
              {activeToolTab !== toolId && (
                <div className="absolute right-0 top-[6px] bottom-[6px] w-px bg-border-weak" />
              )}
              {isStarting ? (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin text-accent" />
              ) : (
                TOOL_ICONS[tool.icon]
              )}
              <span className="truncate">{tool.name}</span>
              {toolInfo?.container && (
                <span className="px-1 py-px rounded text-[9px] font-mono bg-accent/10 text-accent/70 truncate max-w-[80px] shrink-0">
                  {toolInfo.container.replace(/^exegol-/, "")}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onToolTabClose(toolId) }}
                className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Fixed actions area */}
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-l border-border-weak">
        <NewTerminalButton
          containerIds={containerIds}
          connected={connected}
          onAdd={handleAddTerminal}
          compact
        />

        {/* Split actions — always visible, disabled when < 2 terminals */}
        <button
          onClick={() =>
            group.activeTerminalId &&
            groupTerminals.length >= 2 &&
            splitTerminal(group.activeTerminalId, "horizontal")
          }
          disabled={groupTerminals.length < 2}
          className={`p-1 rounded transition-colors ${
            groupTerminals.length >= 2
              ? "text-text-weaker hover:bg-surface-2/50 hover:text-text-weak"
              : "text-text-weaker/30 cursor-not-allowed"
          }`}
          title={groupTerminals.length >= 2 ? "Split right" : "Split right (need 2+ terminals)"}
        >
          <SplitSquareHorizontal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() =>
            group.activeTerminalId &&
            groupTerminals.length >= 2 &&
            splitTerminal(group.activeTerminalId, "vertical")
          }
          disabled={groupTerminals.length < 2}
          className={`p-1 rounded transition-colors ${
            groupTerminals.length >= 2
              ? "text-text-weaker hover:bg-surface-2/50 hover:text-text-weak"
              : "text-text-weaker/30 cursor-not-allowed"
          }`}
          title={groupTerminals.length >= 2 ? "Split down" : "Split down (need 2+ terminals)"}
        >
          <SplitSquareVertical className="w-3.5 h-3.5" />
        </button>

        <WebToolsDropdown
          openToolTabs={openToolTabs}
          onLaunch={onLaunchTool}
          onSettings={onToolSettings}
        />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          terminalId={contextMenu.terminalId}
          x={contextMenu.x}
          y={contextMenu.y}
          otherGroups={[]}
          groupTerminalCount={groupTerminals.length}
          onSplitRight={() => {
            splitTerminal(contextMenu.terminalId, "horizontal")
            setContextMenu(null)
          }}
          onSplitDown={() => {
            splitTerminal(contextMenu.terminalId, "vertical")
            setContextMenu(null)
          }}
          onMoveToGroup={() => {}}
          onClose={() => {
            send({
              type: "terminal:close",
              data: { terminalId: contextMenu.terminalId },
            })
            removeTerminal(contextMenu.terminalId)
            setContextMenu(null)
          }}
          onRename={() => {
            const t = terminals.find((t) => t.id === contextMenu.terminalId)
            if (t) handleDoubleClick(t.id, t.name)
            setContextMenu(null)
          }}
        />
      )}
    </div>
  )
}
