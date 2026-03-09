import { useState, useRef, useEffect, useCallback } from "react"
import { useContainerStore } from "../../stores/container"
import {
  useTerminalStore,
  type LayoutNode,
  type TerminalGroup,
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

interface Props {
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
}

// ─── Main component ──────────────────────────────────────────

export function TerminalArea({ send, subscribe, connected }: Props) {
  const container = useContainerStore((s) => s.getActiveContainer())
  const terminals = useTerminalStore((s) => s.terminals)
  const groups = useTerminalStore((s) => s.groups)
  const layout = useTerminalStore((s) => s.layout)
  const addTerminal = useTerminalStore((s) => s.addTerminal)
  const unsplitAll = useTerminalStore((s) => s.unsplitAll)

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

  const isSingleGroup = groups.length <= 1

  // ── Empty state ──
  if (terminals.length === 0) {
    return (
      <div className="h-full flex flex-col bg-surface-0">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
          <button
            onClick={handleAddTerminal}
            disabled={!container || !connected}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-weak hover:text-text-base rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="font-sans">New terminal</span>
          </button>
        </div>
        <div
          className="flex-1 flex items-center justify-center"
          style={{ backgroundColor: "#101010" }}
        >
          <div className="text-center">
            <Terminal className="w-10 h-10 text-text-weaker mx-auto mb-3" />
            <p className="text-sm text-text-weak mb-1">Terminal</p>
            <p className="text-xs text-text-weaker">
              {container
                ? 'Click "+" to open a terminal'
                : "No container selected"}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Single group: original nice tab bar at top ──
  if (isSingleGroup) {
    const group = groups[0]
    if (!group) return null
    return (
      <div className="h-full flex flex-col bg-surface-0">
        <SingleGroupTabBar
          group={group}
          send={send}
          handleAddTerminal={handleAddTerminal}
          container={container}
          connected={connected}
        />
        <div
          className="flex-1 overflow-hidden relative"
          style={{ backgroundColor: "#101010" }}
        >
          {group.terminalIds.map((tid) => (
            <div
              key={tid}
              className="absolute inset-0"
              style={{
                visibility:
                  tid === group.activeTerminalId ? "visible" : "hidden",
              }}
            >
              <TerminalView
                serverId={tid}
                send={send}
                subscribe={subscribe}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Multiple groups: global bar + recursive layout ──
  return (
    <div className="h-full flex flex-col bg-surface-0">
      {/* Global toolbar — merge button */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
        <button
          onClick={handleAddTerminal}
          disabled={!container || !connected}
          className="p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          title="New terminal (in focused group)"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
        </button>

        <span className="text-[10px] text-text-weaker font-sans ml-1">
          {groups.length} groups
        </span>

        <button
          onClick={unsplitAll}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-weak hover:text-text-base hover:bg-surface-2 transition-colors ml-auto font-sans"
          title="Merge all groups into one"
        >
          <Merge className="w-3.5 h-3.5" />
          Unsplit
        </button>
      </div>

      {/* Split layout */}
      <div
        className="flex-1 overflow-hidden"
        style={{ backgroundColor: "#101010" }}
      >
        {layout && (
          <LayoutRenderer
            node={layout}
            path={[]}
            send={send}
            subscribe={subscribe}
            handleAddTerminal={handleAddTerminal}
          />
        )}
      </div>
    </div>
  )
}

// ─── Single-group tab bar (the nice original one) ────────────

function SingleGroupTabBar({
  group,
  send,
  handleAddTerminal,
  container,
  connected,
}: {
  group: TerminalGroup
  send: (msg: WSMessage) => void
  handleAddTerminal: () => void
  container: { name: string } | undefined
  connected: boolean
}) {
  const terminals = useTerminalStore((s) => s.terminals)
  const setActiveInGroup = useTerminalStore((s) => s.setActiveInGroup)
  const removeTerminal = useTerminalStore((s) => s.removeTerminal)
  const renameTerminal = useTerminalStore((s) => s.renameTerminal)
  const setNotification = useTerminalStore((s) => s.setNotification)
  const splitTerminal = useTerminalStore((s) => s.splitTerminal)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  const groupTerminals = group.terminalIds
    .map((id) => terminals.find((t) => t.id === id))
    .filter(Boolean) as typeof terminals

  const handleTabClick = (terminalId: string) => {
    setActiveInGroup(group.id, terminalId)
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

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
      {groupTerminals.map((t) => (
        <div
          key={t.id}
          onClick={() => handleTabClick(t.id)}
          onDoubleClick={() => handleDoubleClick(t.id, t.name)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors group ${
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
            <span className="truncate max-w-[100px]">{t.name}</span>
          )}

          <button
            onClick={(e) => handleCloseTab(e, t.id)}
            className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      <button
        onClick={handleAddTerminal}
        disabled={!container || !connected}
        className="p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="New terminal"
      >
        <Plus className="w-3.5 h-3.5 text-text-weaker" />
      </button>

      {/* Split actions — only when 2+ terminals */}
      {groupTerminals.length >= 2 && (
        <div className="ml-auto flex items-center gap-0.5 border-l border-border-weak pl-2">
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
        </div>
      )}
    </div>
  )
}

// ─── Recursive layout renderer ───────────────────────────────

function LayoutRenderer({
  node,
  path,
  send,
  subscribe,
  handleAddTerminal,
}: {
  node: LayoutNode
  path: number[]
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  handleAddTerminal: () => void
}) {
  if (node.type === "leaf") {
    return (
      <SplitGroupPane
        groupId={node.groupId}
        send={send}
        subscribe={subscribe}
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
  handleAddTerminal,
}: {
  node: Extract<LayoutNode, { type: "split" }>
  path: number[]
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  handleAddTerminal: () => void
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
}: {
  groupId: string
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
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
      <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-1 shrink-0 overflow-x-auto border-b border-border-weak">
        {groupTerminals.map((t) => (
          <div
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            onDoubleClick={() => handleDoubleClick(t.id, t.name)}
            onContextMenu={(e) => handleContextMenu(e, t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors group ${
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
              <span className="truncate max-w-[100px]">{t.name}</span>
            )}

            <button
              onClick={(e) => handleCloseTab(e, t.id)}
              className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Group actions */}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleAddTerminal}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="New terminal in this group"
          >
            <Plus className="w-3.5 h-3.5 text-text-weaker" />
          </button>
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

// ─── Context menu ────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  terminalId,
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
            const allTerminals = useTerminalStore.getState().terminals
            const names = g.terminalIds
              .map((id) => allTerminals.find((t) => t.id === id)?.name)
              .filter(Boolean)
              .join(", ")
            return (
              <MenuItem
                key={g.id}
                label={names || "Empty"}
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
