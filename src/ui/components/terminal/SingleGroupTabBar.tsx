import { useState, useRef } from "react"
import {
  useTerminalStore,
  type TerminalGroup,
} from "../../stores/terminal"
import { WEB_TOOLS, type RunningToolInfo } from "../../stores/webtools"
import {
  Terminal,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Loader2,
} from "lucide-react"
import type { WSMessage } from "../../hooks/useWebSocket"
import { TOOL_ICONS, ContainerBadge } from "./terminalConstants"
import { NewTerminalButton } from "./NewTerminalButton"
import { WebToolsDropdown } from "./WebToolsDropdown"

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
    <div className="flex items-center border-b border-border-weak bg-surface-1 shrink-0 min-w-0">
      {/* Scrollable tab area */}
      <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-1 px-2 py-1.5 scrollbar-none">
        {groupTerminals.map((t) => (
          <div
            key={t.id}
            onClick={() => {
              handleTabClick(t.id)
              // Clear active tool tab to show the terminal
              if (activeToolTab) onToolTabClick("")
            }}
            onDoubleClick={() => handleDoubleClick(t.id, t.name)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors group shrink-0 ${
              t.id === group.activeTerminalId && !activeToolTab
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
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors group shrink-0 ${
                activeToolTab === toolId
                  ? "bg-surface-2 text-text-strong"
                  : "text-text-weak hover:bg-surface-2/50"
              }`}
            >
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

        {/* Split actions — only when 2+ terminals */}
        {groupTerminals.length >= 2 && (
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

        <WebToolsDropdown
          openToolTabs={openToolTabs}
          onLaunch={onLaunchTool}
          onSettings={onToolSettings}
        />
      </div>
    </div>
  )
}
