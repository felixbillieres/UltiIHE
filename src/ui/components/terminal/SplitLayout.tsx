import { useState, useRef, useEffect, useCallback } from "react"
import {
  useTerminalStore,
  type LayoutNode,
} from "../../stores/terminal"
import { useWorkspaceStore } from "../../stores/workspace"
import { usePopOutStore } from "../../stores/popout"
import { TerminalView } from "./TerminalView"
import { ExternalLink } from "lucide-react"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"
import { NewTerminalButton } from "./NewTerminalButton"
import { TerminalTab } from "./TerminalTab"
import { ContextMenu } from "./TerminalContextMenu"

// ─── Drag data encoding (supports cross-group) ──────────────

const DRAG_MIME = "application/x-terminal-drag"

function encodeDragData(terminalId: string, sourceGroupId: string) {
  return JSON.stringify({ terminalId, sourceGroupId })
}

function decodeDragData(e: React.DragEvent): { terminalId: string; sourceGroupId: string } | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain")
    const data = JSON.parse(raw)
    if (data.terminalId && data.sourceGroupId) return data
  } catch { /* ignore */ }
  return null
}

// ─── Recursive layout renderer ───────────────────────────────

interface LayoutRendererProps {
  node: LayoutNode
  path: number[]
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  handleAddTerminal: (containerName?: string) => void
  containerIds: string[]
}

export function LayoutRenderer({
  node,
  path,
  send,
  subscribe,
  handleAddTerminal,
  containerIds,
}: LayoutRendererProps) {
  if (node.type === "leaf") {
    return (
      <SplitGroupPane
        groupId={node.groupId}
        send={send}
        subscribe={subscribe}
        handleAddTerminal={handleAddTerminal}
        containerIds={containerIds}
      />
    )
  }

  return (
    <SplitContainer
      node={node}
      path={path}
      send={send}
      subscribe={subscribe}
      handleAddTerminal={handleAddTerminal}
      containerIds={containerIds}
    />
  )
}

// ─── Split container with resize handles ─────────────────────

function SplitContainer({
  node,
  path,
  send,
  subscribe,
  handleAddTerminal,
  containerIds,
}: {
  node: Extract<LayoutNode, { type: "split" }>
  path: number[]
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  handleAddTerminal: (containerName?: string) => void
  containerIds: string[]
}) {
  const setGroupSizes = useTerminalStore((s) => s.setGroupSizes)
  const isHorizontal = node.direction === "horizontal"
  const containerRef = useRef<HTMLDivElement>(null)

  const [localSizes, setLocalSizes] = useState(node.sizes)
  useEffect(() => setLocalSizes(node.sizes), [node.sizes])

  const latestSizesRef = useRef(localSizes)
  useEffect(() => {
    latestSizesRef.current = localSizes
  }, [localSizes])

  const handleDragStart = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      const el = containerRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const totalSize = isHorizontal ? rect.width : rect.height
      const startPos = isHorizontal ? e.clientX : e.clientY
      const startSizes = [...latestSizesRef.current]

      function onMove(ev: MouseEvent) {
        const currentPos = isHorizontal ? ev.clientX : ev.clientY
        const delta = ((currentPos - startPos) / totalSize) * 100
        const newLeft = startSizes[index] + delta
        const newRight = startSizes[index + 1] - delta

        if (newLeft >= 10 && newRight >= 10) {
          const newSizes = [...startSizes]
          newSizes[index] = newLeft
          newSizes[index + 1] = newRight
          setLocalSizes(newSizes)
        }
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        setGroupSizes(path, latestSizesRef.current)
      }

      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [isHorizontal, path, setGroupSizes],
  )

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex"
      style={{ flexDirection: isHorizontal ? "row" : "column" }}
    >
      {node.children.map((child, i) => (
        <div key={i} className="contents">
          <div
            style={{
              [isHorizontal ? "width" : "height"]: `${localSizes[i]}%`,
              minWidth: isHorizontal ? 0 : undefined,
              minHeight: !isHorizontal ? 0 : undefined,
              overflow: "hidden",
            }}
          >
            <LayoutRenderer
              node={child}
              path={[...path, i]}
              send={send}
              subscribe={subscribe}
              handleAddTerminal={handleAddTerminal}
              containerIds={containerIds}
            />
          </div>
          {i < node.children.length - 1 && (
            <div
              className={`shrink-0 bg-border-weak hover:bg-accent/40 transition-colors ${
                isHorizontal
                  ? "w-[3px] cursor-col-resize"
                  : "h-[3px] cursor-row-resize"
              }`}
              onMouseDown={(e) => handleDragStart(i, e)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Group pane inside a split ───────────────────────────────

function SplitGroupPane({
  groupId,
  send,
  subscribe,
  handleAddTerminal,
  containerIds,
}: {
  groupId: string
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  handleAddTerminal: (containerName?: string) => void
  containerIds: string[]
}) {
  const group = useTerminalStore((s) => s.groups.find((g) => g.id === groupId))
  const terminals = useTerminalStore((s) => s.terminals)
  const focusedGroupId = useTerminalStore((s) => s.focusedGroupId)
  const focusGroup = useTerminalStore((s) => s.focusGroup)
  const setActiveInGroup = useTerminalStore((s) => s.setActiveInGroup)
  const removeTerminal = useTerminalStore((s) => s.removeTerminal)
  const renameTerminal = useTerminalStore((s) => s.renameTerminal)
  const setNotification = useTerminalStore((s) => s.setNotification)
  const splitTerminal = useTerminalStore((s) => s.splitTerminal)
  const moveTerminalToGroup = useTerminalStore((s) => s.moveTerminalToGroup)
  const reorderTerminal = useTerminalStore((s) => s.reorderTerminal)
  const groups = useTerminalStore((s) => s.groups)
  const popOuts = usePopOutStore((s) => s.popOuts)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  // Drag & drop state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; side: "before" | "after" } | null>(null)
  // Drop zone for empty area (cross-group drop onto pane itself)
  const [paneDropActive, setPaneDropActive] = useState(false)

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

  if (!group) return null

  const isFocused = focusedGroupId === groupId
  const groupTerminals = group.terminalIds
    .map((id) => terminals.find((t) => t.id === id))
    .filter(Boolean) as typeof terminals
  const otherGroups = groups.filter((g) => g.id !== groupId)

  // Check which terminals in this group are popped out
  const isTerminalPoppedOut = (terminalId: string) =>
    popOuts.some((p) => p.terminalId === terminalId)

  const handleTabClick = (terminalId: string) => {
    setActiveInGroup(groupId, terminalId)
    setNotification(terminalId, false)
  }

  const handleCloseTab = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation()
    // Close via workspace tab (triggers full cleanup cascade including popout)
    const wsTab = useWorkspaceStore.getState().tabs.find(
      (t) => t.type === "terminal" && t.terminalId === terminalId,
    )
    if (wsTab) {
      useWorkspaceStore.getState().removeTab(wsTab.id)
    } else {
      // Fallback: direct close
      send({ type: "terminal:close", data: { terminalId } })
      removeTerminal(terminalId)
    }
  }

  const handleDoubleClick = (id: string, currentName: string) => {
    setEditingTabId(id)
    setEditingName(currentName)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editingTabId && editingName.trim()) {
      renameTerminal(editingTabId, editingName.trim())
      // Also sync workspace tab
      const wsTab = useWorkspaceStore.getState().tabs.find(
        (t) => t.type === "terminal" && t.terminalId === editingTabId,
      )
      if (wsTab) {
        useWorkspaceStore.getState().renameTab(wsTab.id, editingName.trim())
      }
    }
    setEditingTabId(null)
  }

  const handleContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, terminalId })
  }

  // ─── Drag & drop (supports cross-group) ─────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, terminalId: string) => {
    setDraggingId(terminalId)
    e.dataTransfer.effectAllowed = "move"
    const data = encodeDragData(terminalId, groupId)
    e.dataTransfer.setData(DRAG_MIME, data)
    e.dataTransfer.setData("text/plain", data)
  }, [groupId])

  const handleDragOver = useCallback((e: React.DragEvent, terminalId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    const side = e.clientX < midX ? "before" : "after"
    setDropTarget({ id: terminalId, side })
    setPaneDropActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetTerminalId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const dragData = decodeDragData(e)
    if (!dragData || !group) {
      setDraggingId(null)
      setDropTarget(null)
      return
    }

    const { terminalId: draggedId, sourceGroupId } = dragData

    if (draggedId === targetTerminalId) {
      setDraggingId(null)
      setDropTarget(null)
      return
    }

    if (sourceGroupId === groupId) {
      // Same group: reorder
      const fromIndex = group.terminalIds.indexOf(draggedId)
      let toIndex = group.terminalIds.indexOf(targetTerminalId)
      if (fromIndex === -1 || toIndex === -1) return

      const rect = e.currentTarget.getBoundingClientRect()
      const midX = rect.left + rect.width / 2
      if (e.clientX >= midX && fromIndex < toIndex) {
        // noop
      } else if (e.clientX < midX && fromIndex > toIndex) {
        // noop
      } else if (e.clientX >= midX) {
        toIndex += 1
      }
      if (fromIndex < toIndex) toIndex -= 1

      reorderTerminal(groupId, fromIndex, toIndex)
    } else {
      // Cross-group: move terminal to this group
      moveTerminalToGroup(draggedId, groupId)
    }

    setDraggingId(null)
    setDropTarget(null)
    setPaneDropActive(false)
  }, [group, groupId, reorderTerminal, moveTerminalToGroup])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropTarget(null)
    setPaneDropActive(false)
  }, [])

  // Drop on the pane itself (empty area or content area) — for cross-group
  const handlePaneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setPaneDropActive(true)
  }, [])

  const handlePaneDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dragData = decodeDragData(e)
    if (!dragData || dragData.sourceGroupId === groupId) {
      setPaneDropActive(false)
      return
    }
    moveTerminalToGroup(dragData.terminalId, groupId)
    setPaneDropActive(false)
    setDraggingId(null)
    setDropTarget(null)
  }, [groupId, moveTerminalToGroup])

  const handlePaneDragLeave = useCallback((e: React.DragEvent) => {
    // Only deactivate if leaving the pane entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setPaneDropActive(false)
    }
  }, [])

  return (
    <div
      className={`h-full flex flex-col ${
        isFocused ? "ring-1 ring-accent/30 ring-inset" : ""
      } ${paneDropActive ? "ring-2 ring-accent/50 ring-inset" : ""}`}
      onClick={() => focusGroup(groupId)}
      onDragOver={handlePaneDragOver}
      onDrop={handlePaneDrop}
      onDragLeave={handlePaneDragLeave}
    >
      {/* Tab bar */}
      <div className="flex items-stretch bg-surface-1 shrink-0 border-b border-border-weak min-w-0">
        <div
          className="flex-1 min-w-0 overflow-x-auto flex items-end gap-0 scrollbar-none"
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropTarget(null)
            }
          }}
        >
          {groupTerminals.map((t) => (
            <TerminalTab
              key={t.id}
              terminal={t}
              isActive={t.id === group.activeTerminalId}
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
        </div>

        {/* Fixed actions area */}
        <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-l border-border-weak">
          <NewTerminalButton
            containerIds={containerIds}
            connected={true}
            onAdd={handleAddTerminal}
            compact
          />
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden relative">
        {groupTerminals.map((t) => {
          const poppedOut = isTerminalPoppedOut(t.id)
          if (poppedOut && t.id === group.activeTerminalId) {
            // Show ghost for popped-out active terminal
            return (
              <div key={t.id} className="absolute inset-0 flex items-center justify-center bg-surface-0/80">
                <div className="text-center">
                  <ExternalLink className="w-6 h-6 text-text-weaker mx-auto mb-2" />
                  <p className="text-xs text-text-weak font-sans mb-1">
                    {t.name} is in a separate window
                  </p>
                  <button
                    onClick={() => {
                      const wsTab = useWorkspaceStore.getState().tabs.find(
                        (tab) => tab.type === "terminal" && tab.terminalId === t.id,
                      )
                      if (wsTab) usePopOutStore.getState().reattach(wsTab.id)
                    }}
                    className="text-xs text-accent hover:text-accent/80 font-sans underline"
                  >
                    Re-attach here
                  </button>
                </div>
              </div>
            )
          }
          return (
            <div
              key={t.id}
              className="absolute inset-0"
              style={{
                visibility:
                  t.id === group.activeTerminalId && !poppedOut ? "visible" : "hidden",
              }}
            >
              <TerminalView serverId={t.id} send={send} subscribe={subscribe} />
            </div>
          )
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          terminalId={contextMenu.terminalId}
          x={contextMenu.x}
          y={contextMenu.y}
          otherGroups={otherGroups}
          groupTerminalCount={groupTerminals.length}
          onSplitRight={() => {
            splitTerminal(contextMenu.terminalId, "horizontal")
            setContextMenu(null)
          }}
          onSplitDown={() => {
            splitTerminal(contextMenu.terminalId, "vertical")
            setContextMenu(null)
          }}
          onMoveToGroup={(targetId) => {
            moveTerminalToGroup(contextMenu.terminalId, targetId)
            setContextMenu(null)
          }}
          onClose={() => {
            handleCloseTab(
              { stopPropagation: () => {} } as React.MouseEvent,
              contextMenu.terminalId,
            )
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
