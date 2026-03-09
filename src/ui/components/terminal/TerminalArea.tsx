import { useState, useRef, useEffect, useCallback } from "react"
import { useContainerStore } from "../../stores/container"
import {
  useTerminalStore,
  type LayoutNode,
  type TerminalGroup,
  type SplitDirection,
} from "../../stores/terminal"
import { TerminalView } from "./TerminalView"
import {
  Terminal,
  Plus,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Merge,
  GripVertical,
} from "lucide-react"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"

// ─── Props ────────────────────────────────────────────────────

interface Props {
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
}

// ─── Main component ──────────────────────────────────────────

export function TerminalArea({ send, subscribe, connected }: Props) {
  const container = useContainerStore((s) => s.getActiveContainer())
  const {
    terminals,
    groups,
    layout,
    focusedGroupId,
    addTerminal,
    removeTerminal,
    unsplitAll,
  } = useTerminalStore()

  const terminalCountRef = useRef(0)

  // Listen for terminal:created
  useEffect(() => {
    const unsubscribe = subscribe((msg: WSMessage) => {
      if (msg.type === "terminal:created" && msg.data?.terminalId) {
        const serverId = msg.data.terminalId as string
        const name = (msg.data.name as string) || serverId.slice(0, 8)
        const containerName =
          (msg.data.container as string) || container?.name || "unknown"

        const state = useTerminalStore.getState()
        if (!state.terminals.find((t) => t.id === serverId)) {
          addTerminal({
            id: serverId,
            name,
            container: containerName,
            createdAt: Date.now(),
            hasNotification: false,
          })
        }
      }
    })
    return unsubscribe
  }, [subscribe, addTerminal, container])

  const handleAddTerminal = useCallback(() => {
    if (!container || !connected) return
    terminalCountRef.current += 1
    const name = `Terminal ${terminalCountRef.current}`
    send({
      type: "terminal:create",
      data: { container: container.name, name },
    })
  }, [container, connected, send])

  // Empty state
  if (terminals.length === 0) {
    return (
      <div className="h-full flex flex-col bg-surface-0">
        {/* Minimal toolbar */}
        <div className="flex items-center px-2 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
          <button
            onClick={handleAddTerminal}
            disabled={!container || !connected}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-weak hover:text-text-base rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="font-sans">New terminal</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: "#101010" }}>
          <div className="text-center">
            <Terminal className="w-10 h-10 text-text-weaker mx-auto mb-3" />
            <p className="text-sm text-text-weak mb-1">Terminal</p>
            <p className="text-xs text-text-weaker">
              {container ? 'Click "+" to open a terminal' : "No container selected"}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface-0">
      {/* Global toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border-weak bg-surface-1 shrink-0">
        <button
          onClick={handleAddTerminal}
          disabled={!container || !connected}
          className="p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          title="New terminal (in focused group)"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
        </button>

        {groups.length > 1 && (
          <button
            onClick={unsplitAll}
            className="p-1 rounded hover:bg-surface-2 transition-colors ml-auto"
            title="Merge all groups"
          >
            <Merge className="w-3.5 h-3.5 text-text-weaker" />
          </button>
        )}
      </div>

      {/* Layout area */}
      <div className="flex-1 overflow-hidden" style={{ backgroundColor: "#101010" }}>
        {layout && (
          <LayoutRenderer
            node={layout}
            path={[]}
            send={send}
            subscribe={subscribe}
            connected={connected}
            handleAddTerminal={handleAddTerminal}
          />
        )}
      </div>
    </div>
  )
}

// ─── Recursive layout renderer ───────────────────────────────

function LayoutRenderer({
  node,
  path,
  send,
  subscribe,
  connected,
  handleAddTerminal,
}: {
  node: LayoutNode
  path: number[]
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
  handleAddTerminal: () => void
}) {
  if (node.type === "leaf") {
    return (
      <GroupPane
        groupId={node.groupId}
        send={send}
        subscribe={subscribe}
        connected={connected}
        handleAddTerminal={handleAddTerminal}
      />
    )
  }

  return (
    <SplitContainer
      node={node}
      path={path}
      send={send}
      subscribe={subscribe}
      connected={connected}
      handleAddTerminal={handleAddTerminal}
    />
  )
}

// ─── Split container with resize handles ─────────────────────

function SplitContainer({
  node,
  path,
  send,
  subscribe,
  connected,
  handleAddTerminal,
}: {
  node: Extract<LayoutNode, { type: "split" }>
  path: number[]
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
  handleAddTerminal: () => void
}) {
  const setGroupSizes = useTerminalStore((s) => s.setGroupSizes)
  const isHorizontal = node.direction === "horizontal"
  const containerRef = useRef<HTMLDivElement>(null)

  // Local sizes state for smooth dragging
  const [localSizes, setLocalSizes] = useState(node.sizes)
  useEffect(() => setLocalSizes(node.sizes), [node.sizes])

  // Use ref to read latest sizes in onUp without stale closure
  const latestSizesRef = useRef(localSizes)
  useEffect(() => {
    latestSizesRef.current = localSizes
  }, [localSizes])

  const handleDragStart = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const totalSize = isHorizontal ? rect.width : rect.height
      const startPos = isHorizontal ? e.clientX : e.clientY

      const startSizes = [...latestSizesRef.current]

      function onMove(ev: MouseEvent) {
        const currentPos = isHorizontal ? ev.clientX : ev.clientY
        const delta = ((currentPos - startPos) / totalSize) * 100

        const minSize = 10
        const newLeft = startSizes[index] + delta
        const newRight = startSizes[index + 1] - delta

        if (newLeft >= minSize && newRight >= minSize) {
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
              connected={connected}
              handleAddTerminal={handleAddTerminal}
            />
          </div>
          {/* Resize handle between children */}
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

// ─── Group pane (tab bar + terminal content) ─────────────────

function GroupPane({
  groupId,
  send,
  subscribe,
  connected,
  handleAddTerminal,
}: {
  groupId: string
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
  handleAddTerminal: () => void
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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    terminalId: string
  } | null>(null)

  if (!group) return null

  const isFocused = focusedGroupId === groupId
  const groupTerminals = group.terminalIds
    .map((id) => terminals.find((t) => t.id === id))
    .filter(Boolean) as typeof terminals

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

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [contextMenu])

  // Other groups for "Move to group" submenu
  const otherGroups = groups.filter((g) => g.id !== groupId)

  return (
    <div
      className={`h-full flex flex-col ${
        isFocused ? "ring-1 ring-accent/30 ring-inset" : ""
      }`}
      onClick={() => focusGroup(groupId)}
    >
      {/* Group tab bar */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 bg-surface-1/80 shrink-0 overflow-x-auto border-b border-border-weak/50">
        {groupTerminals.map((t) => (
          <div
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            onDoubleClick={() => handleDoubleClick(t.id, t.name)}
            onContextMenu={(e) => handleContextMenu(e, t.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors group ${
              t.id === group.activeTerminalId
                ? "bg-surface-2 text-text-strong"
                : "text-text-weak hover:bg-surface-2/50"
            }`}
          >
            <Terminal className="w-2.5 h-2.5 shrink-0" />

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
                className="bg-transparent border-b border-accent text-[11px] text-text-strong outline-none w-16"
                autoFocus
              />
            ) : (
              <span className="truncate max-w-[80px]">{t.name}</span>
            )}

            <button
              onClick={(e) => handleCloseTab(e, t.id)}
              className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}

        {/* Group actions */}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleAddTerminal}
            className="p-0.5 rounded hover:bg-surface-2 transition-colors"
            title="New terminal in this group"
          >
            <Plus className="w-3 h-3 text-text-weaker" />
          </button>
          {group.activeTerminalId && groupTerminals.length > 0 && (
            <>
              <button
                onClick={() =>
                  group.activeTerminalId &&
                  splitTerminal(group.activeTerminalId, "horizontal")
                }
                className="p-0.5 rounded hover:bg-surface-2 transition-colors"
                title="Split right"
                disabled={groupTerminals.length < 2}
              >
                <SplitSquareHorizontal className="w-3 h-3 text-text-weaker" />
              </button>
              <button
                onClick={() =>
                  group.activeTerminalId &&
                  splitTerminal(group.activeTerminalId, "vertical")
                }
                className="p-0.5 rounded hover:bg-surface-2 transition-colors"
                title="Split down"
                disabled={groupTerminals.length < 2}
              >
                <SplitSquareVertical className="w-3 h-3 text-text-weaker" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Terminal content — all terminals mounted but only active visible */}
      <div className="flex-1 overflow-hidden relative">
        {groupTerminals.map((t) => (
          <div
            key={t.id}
            className="absolute inset-0"
            style={{
              visibility: t.id === group.activeTerminalId ? "visible" : "hidden",
            }}
          >
            <TerminalView serverId={t.id} send={send} subscribe={subscribe} />
          </div>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          terminalId={contextMenu.terminalId}
          currentGroupId={groupId}
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
            send({ type: "terminal:close", data: { terminalId: contextMenu.terminalId } })
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

// ─── Context menu ────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  terminalId,
  currentGroupId,
  otherGroups,
  groupTerminalCount,
  onSplitRight,
  onSplitDown,
  onMoveToGroup,
  onClose,
  onRename,
}: {
  x: number
  y: number
  terminalId: string
  currentGroupId: string
  otherGroups: TerminalGroup[]
  groupTerminalCount: number
  onSplitRight: () => void
  onSplitDown: () => void
  onMoveToGroup: (groupId: string) => void
  onClose: () => void
  onRename: () => void
}) {
  const canSplit = groupTerminalCount >= 2

  return (
    <div
      className="fixed z-50 min-w-[180px] bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label="Rename" onClick={onRename} />
      <div className="h-px bg-border-weak my-1" />
      <MenuItem
        label="Split Right"
        onClick={onSplitRight}
        disabled={!canSplit}
        icon={<SplitSquareHorizontal className="w-3.5 h-3.5" />}
      />
      <MenuItem
        label="Split Down"
        onClick={onSplitDown}
        disabled={!canSplit}
        icon={<SplitSquareVertical className="w-3.5 h-3.5" />}
      />
      {otherGroups.length > 0 && (
        <>
          <div className="h-px bg-border-weak my-1" />
          <div className="px-3 py-1 text-text-weaker text-[10px] uppercase tracking-wider">
            Move to group
          </div>
          {otherGroups.map((g) => {
            const terminals = useTerminalStore.getState().terminals
            const groupTerminals = g.terminalIds
              .map((id) => terminals.find((t) => t.id === id))
              .filter(Boolean)
            const label = groupTerminals.map((t) => t!.name).join(", ") || "Empty"
            return (
              <MenuItem
                key={g.id}
                label={label}
                onClick={() => onMoveToGroup(g.id)}
                icon={<GripVertical className="w-3.5 h-3.5" />}
              />
            )
          })}
        </>
      )}
      <div className="h-px bg-border-weak my-1" />
      <MenuItem
        label="Close"
        onClick={onClose}
        className="text-status-error hover:bg-status-error/10"
      />
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  disabled,
  icon,
  className,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        disabled
          ? "text-text-weaker cursor-not-allowed"
          : className || "text-text-base hover:bg-surface-3"
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {label}
    </button>
  )
}
