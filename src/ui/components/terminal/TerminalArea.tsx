import { useState, useRef, useEffect, useCallback } from "react"
import { useContainerStore } from "../../stores/container"
import { useTerminalStore, type LayoutMode } from "../../stores/terminal"
import { TerminalView } from "./TerminalView"
import { Terminal, Plus, X, Columns2, Rows2, LayoutGrid, Layers } from "lucide-react"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"

interface Props {
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
}

const LAYOUT_OPTIONS: { mode: LayoutMode; icon: typeof Columns2; title: string }[] = [
  { mode: "tabs", icon: Layers, title: "Tabs" },
  { mode: "split-h", icon: Columns2, title: "Split horizontal" },
  { mode: "split-v", icon: Rows2, title: "Split vertical" },
  { mode: "grid", icon: LayoutGrid, title: "Grid" },
]

export function TerminalArea({ send, subscribe, connected }: Props) {
  const container = useContainerStore((s) => s.getActiveContainer())
  const {
    terminals,
    activeTerminalId,
    layoutMode,
    addTerminal,
    removeTerminal,
    setActiveTerminal,
    renameTerminal,
    setNotification,
    setLayoutMode,
  } = useTerminalStore()

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)
  const terminalCountRef = useRef(0)

  // Listen for terminal:created to add terminal to store with server ID
  useEffect(() => {
    const unsubscribe = subscribe((msg: WSMessage) => {
      if (msg.type === "terminal:created" && msg.data?.terminalId) {
        const serverId = msg.data.terminalId as string
        const name = (msg.data.name as string) || serverId.slice(0, 8)
        const containerName = (msg.data.container as string) || container?.name || "unknown"

        // Only add if not already tracked (prevent duplicates)
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

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    send({ type: "terminal:close", data: { terminalId: id } })
    removeTerminal(id)
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

  const handleTabClick = (id: string) => {
    setActiveTerminal(id)
    setNotification(id, false)
  }

  // Compute grid layout CSS based on mode and terminal count
  const getContainerStyle = (): React.CSSProperties => {
    const count = terminals.length
    if (count === 0 || layoutMode === "tabs") return {}

    if (layoutMode === "split-h") {
      return {
        display: "grid",
        gridTemplateColumns: `repeat(${count}, 1fr)`,
        gridTemplateRows: "1fr",
        gap: "2px",
      }
    }

    if (layoutMode === "split-v") {
      return {
        display: "grid",
        gridTemplateColumns: "1fr",
        gridTemplateRows: `repeat(${count}, 1fr)`,
        gap: "2px",
      }
    }

    // grid: auto layout
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    return {
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: "2px",
    }
  }

  const isSplitMode = layoutMode !== "tabs"

  return (
    <div className="h-full flex flex-col bg-surface-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
        {terminals.map((t) => (
          <div
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            onDoubleClick={() => handleDoubleClick(t.id, t.name)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors group ${
              t.id === activeTerminalId
                ? "bg-surface-2 text-text-strong"
                : "text-text-weak hover:bg-surface-2/50"
            }`}
          >
            <Terminal className="w-3 h-3 shrink-0" />

            {t.hasNotification && t.id !== activeTerminalId && (
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
          title={container ? "New terminal" : "Select a container first"}
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
        </button>

        {/* Layout mode switcher */}
        {terminals.length > 1 && (
          <div className="ml-auto flex items-center gap-0.5 border-l border-border-weak pl-2">
            {LAYOUT_OPTIONS.map(({ mode, icon: Icon, title }) => (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                className={`p-1 rounded transition-colors ${
                  layoutMode === mode
                    ? "bg-surface-2 text-text-strong"
                    : "text-text-weaker hover:bg-surface-2/50 hover:text-text-weak"
                }`}
                title={title}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Terminal content */}
      <div
        className="flex-1 overflow-hidden relative"
        style={{ backgroundColor: "#101010", ...getContainerStyle() }}
      >
        {terminals.map((t) => {
          // In tabs mode, only show active terminal
          // In split modes, show all terminals
          const isVisible = isSplitMode || t.id === activeTerminalId

          if (isSplitMode) {
            return (
              <div
                key={t.id}
                className={`overflow-hidden border ${
                  t.id === activeTerminalId
                    ? "border-accent/40"
                    : "border-border-weak/30"
                }`}
                onClick={() => handleTabClick(t.id)}
              >
                <TerminalView
                  serverId={t.id}
                  send={send}
                  subscribe={subscribe}
                />
              </div>
            )
          }

          return (
            <div
              key={t.id}
              className="absolute inset-0"
              style={{ visibility: isVisible ? "visible" : "hidden" }}
            >
              <TerminalView
                serverId={t.id}
                send={send}
                subscribe={subscribe}
              />
            </div>
          )
        })}
        {terminals.length === 0 && (
          <div className="h-full flex items-center justify-center">
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
        )}
      </div>
    </div>
  )
}
