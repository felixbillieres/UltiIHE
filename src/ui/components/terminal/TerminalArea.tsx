import { useState, useRef, useEffect, useCallback } from "react"
import {
  useTerminalStore,
} from "../../stores/terminal"
import { useWebToolsStore, WEB_TOOLS } from "../../stores/webtools"
import { TerminalView } from "./TerminalView"
import {
  Terminal,
  X,
  Merge,
  Loader2,
} from "lucide-react"
import type { WSMessage, WSMessageHandler } from "../../hooks/useWebSocket"
import type { Project } from "../../stores/project"
import { TOOL_ICONS } from "./terminalConstants"
import { NewTerminalButton } from "./NewTerminalButton"
import { WebToolsDropdown } from "./WebToolsDropdown"
import { ContainerPickerModal, ToolCloseConfirmModal, WebToolsSettings } from "./WebToolModals"
import { SingleGroupTabBar } from "./SingleGroupTabBar"
import { LayoutRenderer } from "./SplitLayout"

interface Props {
  send: (msg: WSMessage) => void
  subscribe: (handler: WSMessageHandler) => () => void
  connected: boolean
  project: Project
}

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
  const [containerPicker, setContainerPicker] = useState<string | null>(null)
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null)

  const openTool = useCallback((id: string) => {
    if (openToolTabs.includes(id)) {
      setActiveToolTab(id)
      return
    }
    const running = useWebToolsStore.getState().runningTools[id]
    if (running && running.status === "ready") {
      setOpenToolTabs((prev) => [...prev, id])
      setActiveToolTab(id)
      return
    }
    setContainerPicker(id)
  }, [openToolTabs])

  const handleContainerPick = useCallback(async (toolId: string, container: string) => {
    setContainerPicker(null)
    setOpenToolTabs((prev) => (prev.includes(toolId) ? prev : [...prev, toolId]))
    setActiveToolTab(toolId)
    await launchTool(toolId, container)
  }, [launchTool])

  const requestCloseTool = useCallback((id: string) => {
    setCloseConfirm(id)
  }, [])

  const confirmCloseTool = useCallback((id: string) => {
    setCloseConfirm(null)
    setOpenToolTabs((prev) => prev.filter((t) => t !== id))
    setActiveToolTab((prev) => (prev === id ? null : prev))
    const info = Object.values(useWebToolsStore.getState().runningTools).find((r) => r.toolId === id)
    stopToolService(id, info?.container || "")
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
            src={getProxyUrl(toolId, runningTools[toolId]?.container || "")}
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
        <div className="flex items-stretch border-b border-border-weak bg-surface-1 shrink-0 min-w-0">
          <div className="flex-1 min-w-0 overflow-x-auto flex items-end gap-0 scrollbar-none">
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
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors group shrink-0 -mb-px ${
                    activeToolTab === toolId
                      ? "bg-surface-0 text-text-strong border-b-2 border-b-accent z-10"
                      : "text-text-weak hover:bg-surface-2/50 border-b border-b-transparent"
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
