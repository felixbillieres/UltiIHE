import { useState, useRef, useEffect, useCallback } from "react"
import {
  useTerminalStore,
  type LayoutNode,
  type TerminalGroup,
} from "../../stores/terminal"
import { useWebToolsStore, WEB_TOOLS, type RunningToolInfo } from "../../stores/webtools"
import { TerminalView } from "./TerminalView"
import {
  Terminal,
  Plus,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Merge,
  GripVertical,
  ChevronDown,
  Radar,
  Network,
  Wrench,
  Settings as SettingsIcon,
  ExternalLink,
  Loader2,
} from "lucide-react"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"
import type { Project } from "../../stores/project"

const TOOL_ICONS: Record<string, React.ReactNode> = {
  Radar: <Radar className="w-3 h-3 shrink-0" />,
  Network: <Network className="w-3 h-3 shrink-0" />,
}

const TOOL_ICONS_SM: Record<string, React.ReactNode> = {
  Radar: <Radar className="w-3.5 h-3.5" />,
  Network: <Network className="w-3.5 h-3.5" />,
}

interface Props {
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
  project: Project
}

/** Short container badge shown when project has multiple containers */
function ContainerBadge({ container }: { container: string }) {
  return (
    <span className="px-1 py-px rounded text-[9px] font-mono bg-accent/10 text-accent/70 truncate max-w-[60px] shrink-0">
      {container}
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────

export function TerminalArea({ send, subscribe, connected, project }: Props) {
  const terminals = useTerminalStore((s) => s.terminals)
  const groups = useTerminalStore((s) => s.groups)
  const layout = useTerminalStore((s) => s.layout)
  const addTerminal = useTerminalStore((s) => s.addTerminal)
  const unsplitAll = useTerminalStore((s) => s.unsplitAll)

  const launchTool = useWebToolsStore((s) => s.launchTool)
  const stopToolService = useWebToolsStore((s) => s.stopTool)
  const getProxyUrl = useWebToolsStore((s) => s.getProxyUrl)
  const runningTools = useWebToolsStore((s) => s.runningTools)
  const [openToolTabs, setOpenToolTabs] = useState<string[]>([])
  const [activeToolTab, setActiveToolTab] = useState<string | null>(null)
  const [showToolSettings, setShowToolSettings] = useState(false)
  const [containerPicker, setContainerPicker] = useState<string | null>(null) // toolId waiting for container pick
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null) // toolId waiting for close confirmation

  const openTool = useCallback((id: string) => {
    // If tool is already open, just switch to it
    if (openToolTabs.includes(id)) {
      setActiveToolTab(id)
      return
    }
    // If tool is already running on backend, just open the tab
    const running = useWebToolsStore.getState().runningTools[id]
    if (running && running.status === "ready") {
      setOpenToolTabs((prev) => [...prev, id])
      setActiveToolTab(id)
      return
    }
    // Show container picker to choose where to launch
    setContainerPicker(id)
  }, [openToolTabs])

  const handleContainerPick = useCallback(async (toolId: string, container: string) => {
    setContainerPicker(null)
    setOpenToolTabs((prev) => (prev.includes(toolId) ? prev : [...prev, toolId]))
    setActiveToolTab(toolId)
    await launchTool(toolId, container)
  }, [launchTool])

  // Show confirmation dialog before closing a tool
  const requestCloseTool = useCallback((id: string) => {
    setCloseConfirm(id)
  }, [])

  // Actually close and stop the tool
  const confirmCloseTool = useCallback((id: string) => {
    setCloseConfirm(null)
    setOpenToolTabs((prev) => prev.filter((t) => t !== id))
    setActiveToolTab((prev) => (prev === id ? null : prev))
    stopToolService(id)
  }, [stopToolService])

  const terminalCountRef = useRef(0)
  const hasContainers = project.containerIds.length > 0

  // Listen for terminal:created
  useEffect(() => {
    const unsubscribe = subscribe((msg: WSMessage) => {
      if (msg.type === "terminal:created" && msg.data?.terminalId) {
        const serverId = msg.data.terminalId as string
        const name = (msg.data.name as string) || serverId.slice(0, 8)
        const containerName =
          (msg.data.container as string) || "unknown"

        const state = useTerminalStore.getState()
        if (!state.terminals.find((t) => t.id === serverId)) {
          addTerminal({
            id: serverId,
            name,
            container: containerName,
            projectId: project.id,
            createdAt: Date.now(),
            hasNotification: false,
          })
        }
      }
    })
    return unsubscribe
  }, [subscribe, addTerminal, project.id])

  const handleAddTerminal = useCallback((containerName?: string) => {
    if (!hasContainers || !connected) return
    const target = containerName || project.containerIds[0]
    terminalCountRef.current += 1
    const name = `Terminal ${terminalCountRef.current}`
    send({
      type: "terminal:create",
      data: { container: target, name },
    })
  }, [hasContainers, connected, send, project.containerIds])

  const isSingleGroup = groups.length <= 1

  const settingsModal = showToolSettings && <WebToolsSettings onClose={() => setShowToolSettings(false)} />
  const containerPickerModal = containerPicker && (
    <ContainerPickerModal
      toolId={containerPicker}
      containerIds={project.containerIds}
      onPick={handleContainerPick}
      onCancel={() => setContainerPicker(null)}
    />
  )
  const closeConfirmModal = closeConfirm && (
    <ToolCloseConfirmModal
      toolId={closeConfirm}
      container={runningTools[closeConfirm]?.container}
      onConfirm={confirmCloseTool}
      onCancel={() => setCloseConfirm(null)}
    />
  )

  /** Render tool iframe or loading/error state */
  const renderToolPanel = (toolId: string, visible: boolean) => {
    const toolInfo = runningTools[toolId]
    const isReady = toolInfo?.status === "ready"
    const isStarting = toolInfo?.status === "starting"
    const hasError = toolInfo?.status === "error"

    return (
      <div
        key={toolId}
        className="absolute inset-0"
        style={{ visibility: visible ? "visible" : "hidden" }}
      >
        {isReady && (
          <iframe
            src={getProxyUrl(toolId)}
            className="w-full h-full border-0"
            title={WEB_TOOLS.find((t) => t.id === toolId)?.name || ""}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        )}
        {isStarting && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
              <p className="text-sm text-text-weak font-sans">
                Starting {WEB_TOOLS.find((t) => t.id === toolId)?.name}...
              </p>
              <p className="text-xs text-text-weaker font-sans mt-1">
                Launching in {toolInfo.container}
              </p>
            </div>
          </div>
        )}
        {hasError && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <X className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-text-weak font-sans mb-2">
                Failed to start {WEB_TOOLS.find((t) => t.id === toolId)?.name}
              </p>
              <p className="text-xs text-red-400/80 font-mono bg-surface-2 rounded px-3 py-2">
                {toolInfo.error || "Unknown error"}
              </p>
            </div>
          </div>
        )}
        {!toolInfo && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-text-weaker animate-spin" />
          </div>
        )}
      </div>
    )
  }

  // ── Empty state (no terminals, but may have tool tabs) ──
  if (terminals.length === 0) {
    return (
      <>
      {settingsModal}
      {containerPickerModal}
      {closeConfirmModal}
      <div className="h-full flex flex-col bg-surface-0">
        <div className="flex items-center border-b border-border-weak bg-surface-1 shrink-0 min-w-0">
          <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-1 px-2 py-1.5 scrollbar-none">
            {/* Tool tabs */}
            {openToolTabs.map((toolId) => {
              const tool = WEB_TOOLS.find((t) => t.id === toolId)
              if (!tool) return null
              const toolInfo = runningTools[toolId]
              const isStarting = toolInfo?.status === "starting"
              return (
                <div
                  key={toolId}
                  onClick={() => setActiveToolTab(toolId)}
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
                    onClick={(e) => { e.stopPropagation(); requestCloseTool(toolId) }}
                    className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-l border-border-weak">
            <NewTerminalButton
              containerIds={project.containerIds}
              connected={connected}
              onAdd={handleAddTerminal}
              compact
            />
            <WebToolsDropdown
              openToolTabs={openToolTabs}
              onLaunch={openTool}
              onSettings={() => setShowToolSettings(true)}
            />
          </div>
        </div>
        <div
          className="flex-1 overflow-hidden relative"
          style={{ backgroundColor: "#101010" }}
        >
          {/* Web tool panels */}
          {openToolTabs.map((toolId) => renderToolPanel(toolId, activeToolTab === toolId))}

          {/* Empty state */}
          {!activeToolTab && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Terminal className="w-10 h-10 text-text-weaker mx-auto mb-3" />
                <p className="text-sm text-text-weak mb-1">Terminal</p>
                <p className="text-xs text-text-weaker">
                  {hasContainers
                    ? 'Click "+" to open a terminal'
                    : "No container linked"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      </>
    )
  }

  // ── Single group: original nice tab bar at top ──
  if (isSingleGroup) {
    const group = groups[0]
    if (!group) return null
    return (
      <>
      {settingsModal}
      {containerPickerModal}
      {closeConfirmModal}
      <div className="h-full flex flex-col bg-surface-0">
        <SingleGroupTabBar
          group={group}
          send={send}
          handleAddTerminal={handleAddTerminal}
          containerIds={project.containerIds}
          connected={connected}
          activeToolTab={activeToolTab}
          openToolTabs={openToolTabs}
          runningTools={runningTools}
          onToolTabClick={(id) => setActiveToolTab(id || null)}
          onToolTabClose={requestCloseTool}
          onLaunchTool={openTool}
          onToolSettings={() => setShowToolSettings(true)}
        />
        <div
          className="flex-1 overflow-hidden relative"
          style={{ backgroundColor: "#101010" }}
        >
          {/* Web tool panels — kept mounted to preserve state */}
          {openToolTabs.map((toolId) => renderToolPanel(toolId, activeToolTab === toolId))}

          {group.terminalIds.map((tid) => (
            <div
              key={tid}
              className="absolute inset-0"
              style={{
                visibility:
                  tid === group.activeTerminalId && !activeToolTab ? "visible" : "hidden",
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
      </>
    )
  }

  // ── Multiple groups: global bar + recursive layout ──
  return (
    <>
    {settingsModal}
    {containerPickerModal}
    <div className="h-full flex flex-col bg-surface-0">
      {/* Global toolbar — merge button */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
        <NewTerminalButton
          containerIds={project.containerIds}
          connected={connected}
          onAdd={handleAddTerminal}
          compact
        />

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
            containerIds={project.containerIds}
          />
        )}
      </div>
    </div>
    </>
  )
}

// ─── Single-group tab bar (the nice original one) ────────────

function SingleGroupTabBar({
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
}: {
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

// ─── Recursive layout renderer ───────────────────────────────

function LayoutRenderer({
  node,
  path,
  send,
  subscribe,
  handleAddTerminal,
  containerIds,
}: {
  node: LayoutNode
  path: number[]
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  handleAddTerminal: (containerName?: string) => void
  containerIds: string[]
}) {
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

// ─── New terminal button (with container dropdown) ──────────

function NewTerminalButton({
  containerIds,
  connected,
  onAdd,
  compact,
}: {
  containerIds: string[]
  connected: boolean
  onAdd: (containerName?: string) => void
  compact?: boolean
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showDropdown) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [showDropdown])

  const disabled = containerIds.length === 0 || !connected

  // Single container: just a button
  if (containerIds.length <= 1) {
    if (compact) {
      return (
        <button
          onClick={() => onAdd()}
          disabled={disabled}
          className="p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          title="New terminal"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
        </button>
      )
    }
    return (
      <button
        onClick={() => onAdd()}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-weak hover:text-text-base rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="font-sans">New terminal</span>
      </button>
    )
  }

  // Multiple containers: dropdown
  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled}
          className="flex items-center gap-0.5 p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          title="New terminal"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
          <ChevronDown className="w-2.5 h-2.5 text-text-weaker" />
        </button>
      ) : (
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-weak hover:text-text-base rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="font-sans">New terminal</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans">
          {containerIds.map((name) => (
            <button
              key={name}
              onClick={() => {
                onAdd(name)
                setShowDropdown(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
            >
              <Terminal className="w-3 h-3 text-text-weaker shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Web tools dropdown ─────────────────────────────────────

function WebToolsDropdown({
  openToolTabs,
  onLaunch,
  onSettings,
}: {
  openToolTabs: string[]
  onLaunch: (id: string) => void
  onSettings: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`p-1 rounded transition-colors ${
          open ? "bg-surface-2 text-text-base" : "text-text-weaker hover:bg-surface-2/50 hover:text-text-weak"
        }`}
        title="Web tools"
      >
        <Wrench className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans">
          <div className="px-3 py-1.5 text-[10px] text-text-weaker uppercase tracking-wider">
            Web Tools
          </div>
          {WEB_TOOLS.map((tool) => {
            const isOpen = openToolTabs.includes(tool.id)
            return (
              <button
                key={tool.id}
                onClick={() => {
                  onLaunch(tool.id)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-text-base hover:bg-surface-3 transition-colors"
              >
                <span className="shrink-0 text-text-weak">
                  {TOOL_ICONS_SM[tool.icon]}
                </span>
                <span className="flex-1">{tool.name}</span>
                {isOpen && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </button>
            )
          })}
          <div className="h-px bg-border-weak my-1" />
          <button
            onClick={() => {
              onSettings()
              setOpen(false)
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-text-weak hover:bg-surface-3 hover:text-text-base transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Configure tools...</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Container picker modal ─────────────────────────────────

function ContainerPickerModal({
  toolId,
  containerIds,
  onPick,
  onCancel,
}: {
  toolId: string
  containerIds: string[]
  onPick: (toolId: string, container: string) => void
  onCancel: () => void
}) {
  const tool = WEB_TOOLS.find((t) => t.id === toolId)

  // If only one container, auto-pick
  useEffect(() => {
    if (containerIds.length === 1) {
      onPick(toolId, containerIds[0])
    }
  }, [containerIds, toolId, onPick])

  // Don't render if auto-picking
  if (containerIds.length <= 1) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-surface-1 border border-border-weak rounded-xl shadow-2xl w-[360px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-weak">
          <div className="flex items-center gap-2.5">
            {TOOL_ICONS_SM[tool?.icon || ""]}
            <h2 className="text-sm font-sans font-semibold text-text-strong">
              Launch {tool?.name}
            </h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-surface-2 transition-colors">
            <X className="w-4 h-4 text-text-weaker" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-xs text-text-weak font-sans mb-3">
            Select a container to run {tool?.name} in:
          </p>
          <div className="space-y-1.5">
            {containerIds.map((cid) => (
              <button
                key={cid}
                onClick={() => onPick(toolId, cid)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-md bg-surface-0 hover:bg-surface-2 border border-border-weak hover:border-accent/30 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-text-weaker shrink-0" />
                <span className="text-xs font-mono text-text-base">{cid}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tool close confirmation modal ──────────────────────────

function ToolCloseConfirmModal({
  toolId,
  container,
  onConfirm,
  onCancel,
}: {
  toolId: string
  container?: string
  onConfirm: (toolId: string) => void
  onCancel: () => void
}) {
  const tool = WEB_TOOLS.find((t) => t.id === toolId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-surface-1 border border-border-weak rounded-xl shadow-2xl w-[380px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border-weak">
          <div className="flex items-center gap-2.5">
            {TOOL_ICONS_SM[tool?.icon || ""]}
            <h2 className="text-sm font-sans font-semibold text-text-strong">
              Stop {tool?.name}?
            </h2>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-text-weak font-sans leading-relaxed">
            This will stop all {tool?.name} processes
            {container && (
              <> running in <span className="font-mono text-accent">{container.replace(/^exegol-/, "")}</span></>
            )}
            {" "}and close the tab.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-weak">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-sans rounded-md text-text-weak hover:text-text-base hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(toolId)}
            className="px-3 py-1.5 text-xs font-sans font-medium rounded-md bg-red-500/80 hover:bg-red-500 text-white transition-colors"
          >
            Stop & Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Web tools settings modal ───────────────────────────────

function WebToolsSettings({ onClose }: { onClose: () => void }) {
  const runningTools = useWebToolsStore((s) => s.runningTools)
  const stopTool = useWebToolsStore((s) => s.stopTool)
  const getProxyUrl = useWebToolsStore((s) => s.getProxyUrl)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-1 border border-border-weak rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-weak">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-text-weak" />
            <h2 className="text-sm font-sans font-semibold text-text-strong">Web Tools</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-2 transition-colors">
            <X className="w-4 h-4 text-text-weaker" />
          </button>
        </div>

        {/* Tool list */}
        <div className="p-5 space-y-4">
          {WEB_TOOLS.map((tool) => {
            const running = runningTools[tool.id]
            return (
              <div key={tool.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-0 border border-border-weak">
                <span className="text-text-weak shrink-0">{TOOL_ICONS_SM[tool.icon]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-sans font-medium text-text-strong">{tool.name}</div>
                  {running ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {running.status === "ready" && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-sans">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Running in {running.container}
                        </span>
                      )}
                      {running.status === "starting" && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-sans">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          Starting in {running.container}...
                        </span>
                      )}
                      {running.status === "error" && (
                        <span className="text-[10px] text-red-400 font-sans">
                          Error: {running.error?.slice(0, 80)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-weaker font-sans">Not running</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {running?.status === "ready" && (
                    <>
                      <a
                        href={getProxyUrl(tool.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-3 text-text-weak hover:text-text-base transition-colors"
                        title="Open in browser"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        onClick={() => stopTool(tool.id)}
                        className="px-2 py-1 text-[10px] font-sans rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-border-weak text-[10px] text-text-weaker font-sans">
          Tools are launched inside Exegol containers and proxied through the server.
        </div>
      </div>
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
