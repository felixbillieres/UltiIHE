import { useState, useEffect, useCallback, useRef } from "react"
import { type Project } from "../../stores/project"
import { useWorkspaceStore } from "../../stores/workspace"
import { useFileStore } from "../../stores/files"
import { useTerminalStore } from "../../stores/terminal"
import { useWebToolsStore, WEB_TOOLS } from "../../stores/webtools"
import { TerminalView } from "../terminal/TerminalView"
import { ExegolManager } from "../exegol/ExegolManager"
import { BottomPanel } from "./BottomPanel"
import { WorkspaceTabBar } from "./WorkspaceTabBar"
import { FileEditorPane } from "../files/FileEditorPane"
import { Terminal, FileText, Globe, Loader2, X } from "lucide-react"

// ─── Tool iframe renderer ───────────────────────────────────

function ToolPanel({ toolId, visible }: { toolId: string; visible: boolean }) {
  const toolInfo = useWebToolsStore((s) => s.runningTools[toolId])
  const getProxyUrl = useWebToolsStore((s) => s.getProxyUrl)

  return (
    <div
      className="absolute inset-0"
      style={{ visibility: visible ? "visible" : "hidden" }}
    >
      {toolInfo?.status === "ready" && (
        <iframe
          src={getProxyUrl(toolId)}
          className="w-full h-full border-0"
          title={WEB_TOOLS.find((t) => t.id === toolId)?.name || ""}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      )}
      {toolInfo?.status === "starting" && (
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
      {toolInfo?.status === "error" && (
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

// ─── Empty workspace state ──────────────────────────────────

function EmptyWorkspace({ hasContainers }: { hasContainers: boolean }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Terminal className="w-8 h-8 text-green-400/40" />
          <FileText className="w-8 h-8 text-blue-400/40" />
          <Globe className="w-8 h-8 text-purple-400/40" />
        </div>
        <p className="text-sm text-text-weak font-sans mb-1">Workspace</p>
        <p className="text-xs text-text-weaker font-sans">
          {hasContainers
            ? "Open a terminal, file, or tool to get started"
            : "No container linked to this project"}
        </p>
      </div>
    </div>
  )
}

// ─── Main CenterArea ────────────────────────────────────────

interface CenterAreaProps {
  send: (data: any) => void
  subscribe: (handler: (data: any) => void) => () => void
  connected: boolean
  project: Project
  showContainerManager: boolean
  onCloseContainerManager: () => void
  bottomPanelOpen: boolean
  bottomPanelHeight: number
  onCloseBottomPanel: () => void
  onResizeBottomPanel: (height: number) => void
}

export function CenterArea({
  send,
  subscribe,
  connected,
  project,
  showContainerManager,
  onCloseContainerManager,
  bottomPanelOpen,
  bottomPanelHeight,
  onCloseBottomPanel,
  onResizeBottomPanel,
}: CenterAreaProps) {
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const addTerminal = useTerminalStore((s) => s.addTerminal)
  const openTerminalTab = useWorkspaceStore((s) => s.openTerminalTab)
  const openToolTab = useWorkspaceStore((s) => s.openToolTab)

  const launchTool = useWebToolsStore((s) => s.launchTool)
  const stopTool = useWebToolsStore((s) => s.stopTool)

  const [bottomDragging, setBottomDragging] = useState(false)
  const terminalCountRef = useRef(0)

  const hasContainers = project.containerIds.length > 0

  // Sync active file in file store when a file tab is activated
  useEffect(() => {
    if (activeTab?.type === "file" && activeTab.fileId) {
      useFileStore.getState().setActiveFile(activeTab.fileId)
    }
  }, [activeTab])

  // Listen for terminal:created from server
  useEffect(() => {
    const unsubscribe = subscribe((msg: any) => {
      if (msg.type === "terminal:created" && msg.data?.terminalId) {
        const serverId = msg.data.terminalId as string
        const name = (msg.data.name as string) || serverId.slice(0, 8)
        const containerName = (msg.data.container as string) || "unknown"

        const termState = useTerminalStore.getState()
        if (!termState.terminals.find((t) => t.id === serverId)) {
          addTerminal({
            id: serverId,
            name,
            container: containerName,
            projectId: project.id,
            createdAt: Date.now(),
            hasNotification: false,
          })
          // Also create a workspace tab
          openTerminalTab(serverId, name, containerName)
        }
      }
    })
    return unsubscribe
  }, [subscribe, addTerminal, openTerminalTab, project.id])

  // When workspace tabs are removed, clean up the underlying resources
  useEffect(() => {
    // Subscribe to workspace tab removals to sync with other stores
    const unsub = useWorkspaceStore.subscribe((state, prevState) => {
      // Find removed tabs
      const prevIds = new Set(prevState.tabs.map((t) => t.id))
      const currentIds = new Set(state.tabs.map((t) => t.id))
      for (const id of prevIds) {
        if (!currentIds.has(id)) {
          const tab = prevState.tabs.find((t) => t.id === id)
          if (!tab) continue
          if (tab.type === "terminal" && tab.terminalId) {
            send({ type: "terminal:close", data: { terminalId: tab.terminalId } })
            useTerminalStore.getState().removeTerminal(tab.terminalId)
          }
          if (tab.type === "file" && tab.fileId) {
            useFileStore.getState().closeFile(tab.fileId)
          }
          if (tab.type === "webtool" && tab.toolId) {
            stopTool(tab.toolId)
          }
        }
      }
    })
    return unsub
  }, [send, stopTool])

  const handleAddTerminal = useCallback(
    (containerName?: string) => {
      if (!hasContainers || !connected) return
      const target = containerName || project.containerIds[0]
      terminalCountRef.current += 1
      const name = `Terminal ${terminalCountRef.current}`
      send({
        type: "terminal:create",
        data: { container: target, name },
      })
    },
    [hasContainers, connected, send, project.containerIds],
  )

  const handleLaunchTool = useCallback(
    async (toolId: string) => {
      // If tool already has a tab, just activate it
      const existingTab = useWorkspaceStore
        .getState()
        .tabs.find((t) => t.type === "webtool" && t.toolId === toolId)
      if (existingTab) {
        useWorkspaceStore.getState().setActiveTab(existingTab.id)
        return
      }
      // For now, use first container
      const container = project.containerIds[0]
      if (!container) return
      const tool = WEB_TOOLS.find((t) => t.id === toolId)
      openToolTab(toolId, tool?.name || toolId, container)
      await launchTool(toolId, container)
    },
    [project.containerIds, openToolTab, launchTool],
  )

  // Container manager overlay
  if (showContainerManager && project.containerIds.length === 0) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center bg-surface-0">
        <ExegolManager
          project={project}
          onClose={onCloseContainerManager}
          canClose={project.containerIds.length > 0}
        />
      </div>
    )
  }

  // Collect all unique tool IDs that have tabs (for keeping iframes mounted)
  const toolTabIds = tabs
    .filter((t) => t.type === "webtool" && t.toolId)
    .map((t) => t.toolId!)

  // Collect all unique terminal IDs that have tabs (for keeping terminals mounted)
  const terminalTabIds = tabs
    .filter((t) => t.type === "terminal" && t.terminalId)
    .map((t) => t.terminalId!)

  return (
    <div className="flex-1 min-w-0 flex flex-col relative">
      {/* Container manager overlay */}
      {showContainerManager && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <ExegolManager
            project={project}
            onClose={onCloseContainerManager}
            canClose={true}
          />
        </div>
      )}

      {/* Top: workspace tab bar + content */}
      <div className="flex-1 min-h-0 flex flex-col">
        <WorkspaceTabBar
          containerIds={project.containerIds}
          connected={connected}
          onAddTerminal={handleAddTerminal}
          onLaunchTool={handleLaunchTool}
        />

        {/* Content area */}
        <div
          className="flex-1 min-h-0 overflow-hidden relative"
          style={{ backgroundColor: "#101010" }}
        >
          {/* Terminal views — kept mounted for persistence */}
          {terminalTabIds.map((tid) => (
            <div
              key={tid}
              className="absolute inset-0"
              style={{
                visibility:
                  activeTab?.type === "terminal" && activeTab.terminalId === tid
                    ? "visible"
                    : "hidden",
              }}
            >
              <TerminalView serverId={tid} send={send} subscribe={subscribe} />
            </div>
          ))}

          {/* Tool iframes — kept mounted for persistence */}
          {toolTabIds.map((toolId) => (
            <ToolPanel
              key={toolId}
              toolId={toolId}
              visible={
                activeTab?.type === "webtool" && activeTab.toolId === toolId
              }
            />
          ))}

          {/* File editor — rendered for active file tab */}
          {activeTab?.type === "file" && activeTab.fileId && (
            <div className="absolute inset-0 bg-surface-0">
              <FileEditorPane fileId={activeTab.fileId} />
            </div>
          )}

          {/* Empty state */}
          {!activeTab && <EmptyWorkspace hasContainers={hasContainers} />}
        </div>
      </div>

      {/* Bottom panel resize handle + panel */}
      {bottomPanelOpen && (
        <>
          <div
            className={`h-[3px] cursor-row-resize shrink-0 transition-colors ${
              bottomDragging
                ? "bg-accent/40"
                : "bg-border-weak hover:bg-accent/20"
            }`}
            onMouseDown={(e) => {
              e.preventDefault()
              setBottomDragging(true)
              const startY = e.clientY
              const startH = bottomPanelHeight
              function onMove(ev: MouseEvent) {
                const delta = startY - ev.clientY
                onResizeBottomPanel(
                  Math.max(150, Math.min(startH + delta, 600)),
                )
              }
              function onUp() {
                setBottomDragging(false)
                document.removeEventListener("mousemove", onMove)
                document.removeEventListener("mouseup", onUp)
                document.body.style.cursor = ""
                document.body.style.userSelect = ""
              }
              document.body.style.cursor = "row-resize"
              document.body.style.userSelect = "none"
              document.addEventListener("mousemove", onMove)
              document.addEventListener("mouseup", onUp)
            }}
          />
          <div
            className="shrink-0 overflow-hidden flex flex-col"
            style={{ height: bottomPanelHeight }}
          >
            <BottomPanel project={project} onClose={onCloseBottomPanel} />
          </div>
        </>
      )}
    </div>
  )
}
