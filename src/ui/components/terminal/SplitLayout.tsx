import { useState, useRef, useEffect, useCallback } from "react"
import {
  useTerminalStore,
  type LayoutNode,
} from "../../stores/terminal"
import { TerminalView } from "./TerminalView"
import {
  Terminal,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
} from "lucide-react"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"
import { ContainerBadge } from "./terminalConstants"
import { NewTerminalButton } from "./NewTerminalButton"
import { ContextMenu } from "./TerminalContextMenu"

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

// ─── Group pane inside a split (compact but clean tab bar) ───

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
  const groups = useTerminalStore((s) => s.groups)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

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

  const handleTabClick = (terminalId: string) => {
    setActiveInGroup(groupId, terminalId)
    setNotification(terminalId, false)
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

  const handleContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, terminalId })
  }

  return (
    <div
      className={`h-full flex flex-col ${
        isFocused ? "ring-1 ring-accent/30 ring-inset" : ""
      }`}
      onClick={() => focusGroup(groupId)}
    >
      {/* Tab bar — same style as the single-group one */}
      <div className="flex items-center bg-surface-1 shrink-0 border-b border-border-weak min-w-0">
        {/* Scrollable tab area */}
        <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-1 px-2 py-1.5 scrollbar-none">
          {groupTerminals.map((t) => (
            <div
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              onDoubleClick={() => handleDoubleClick(t.id, t.name)}
              onContextMenu={(e) => handleContextMenu(e, t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors group shrink-0 ${
                t.id === group.activeTerminalId
                  ? "bg-surface-2 text-text-strong"
                  : "text-text-weak hover:bg-surface-2/50"
              }`}
            >
              <Terminal className="w-3 h-3 shrink-0" />

              {t.hasNotification && t.id !== group.activeTerminalId && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              )}

              {editingTabId === t.id ? (
                <input
                  ref={editInputRef}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename()
                    if (e.key === "Escape") setEditingTabId(null)
                  }}
                  className="bg-transparent border-b border-accent text-xs text-text-strong outline-none w-20"
                  autoFocus
                />
              ) : (
                <>
                  <span className="truncate max-w-[100px]">{t.name}</span>
                  {containerIds.length > 1 && (
                    <ContainerBadge container={t.container} />
                  )}
                </>
              )}

              <button
                onClick={(e) => handleCloseTab(e, t.id)}
                className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
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
          {group.activeTerminalId && groupTerminals.length >= 2 && (
            <>
              <button
                onClick={() =>
                  group.activeTerminalId &&
                  splitTerminal(group.activeTerminalId, "horizontal")
                }
                className="p-1 rounded text-text-weaker hover:bg-surface-2/50 hover:text-text-weak transition-colors"
                title="Split right"
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  group.activeTerminalId &&
                  splitTerminal(group.activeTerminalId, "vertical")
                }
                className="p-1 rounded text-text-weaker hover:bg-surface-2/50 hover:text-text-weak transition-colors"
                title="Split down"
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden relative">
        {groupTerminals.map((t) => (
          <div
            key={t.id}
            className="absolute inset-0"
            style={{
              visibility:
                t.id === group.activeTerminalId ? "visible" : "hidden",
            }}
          >
            <TerminalView serverId={t.id} send={send} subscribe={subscribe} />
          </div>
        ))}
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
