import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { type Project } from "../../stores/project"
import { useWorkspaceStore } from "../../stores/workspace"
import { useFileStore } from "../../stores/files"
import { useTerminalStore } from "../../stores/terminal"
import { useWebToolsStore, WEB_TOOLS, toolKey } from "../../stores/webtools"
import { usePopOutStore } from "../../stores/popout"
import { TerminalView } from "../terminal/TerminalView"
import { LayoutRenderer } from "../terminal/SplitLayout"
import { ExegolManager } from "../exegol/ExegolManager"
import { BottomPanel } from "./BottomPanel"
import { WorkspaceTabBar } from "./WorkspaceTabBar"
import { FileEditorPane } from "../files/FileEditorPane"
import { PopOutPortal } from "./PopOutPortal"
import { PopOutGhost } from "./PopOutGhost"
import { Terminal, FileText, Globe, Loader2, X, ExternalLink, ChevronRight } from "lucide-react"
import { ContainerPickerModal } from "../terminal/WebToolModals"
import { useResizeHandle } from "../../hooks/useResizeHandle"

// ─── Tool panel renderer ────────────────────────────────────

function ToolPanel({ toolId, container, visible }: { toolId: string; container: string; visible: boolean }) {
  const storeKey = toolKey(toolId, container)
  const toolInfo = useWebToolsStore((s) => s.runningTools[storeKey])
  const getProxyUrl = useWebToolsStore((s) => s.getProxyUrl)
  const toolDef = WEB_TOOLS.find((t) => t.id === toolId)

  // Poll backend status to detect auto-stopped tools (e.g. process exited)
  useEffect(() => {
    if (!toolInfo || toolInfo.status !== "ready") return
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`http://localhost:3001/api/webtools/${toolId}/status?container=${encodeURIComponent(container)}`)
        const data = await resp.json()
        if (!data.running) {
          // Tool was auto-stopped by backend — clear store + close tab
          useWebToolsStore.setState((s) => {
            const { [storeKey]: _, ...rest } = s.runningTools
            return { runningTools: rest }
          })
          const ws = useWorkspaceStore.getState()
          const tab = ws.tabs.find((t) => t.type === "webtool" && t.toolId === toolId && t.container === container)
          if (tab) ws.removeTab(tab.id)
        }
      } catch { /* ignore */ }
    }, 4000)
    return () => clearInterval(interval)
  }, [toolId, container, storeKey, toolInfo?.status])

  return (
    <div
      className="absolute inset-0"
      style={{ visibility: visible ? "visible" : "hidden" }}
    >
      {toolInfo?.status === "ready" && (
        <iframe
          src={getProxyUrl(toolId, container)}
          className="w-full h-full border-0"
          title={toolDef?.name || ""}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      )}
      {toolInfo?.status === "starting" && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-text-weak font-sans">
              Starting {toolDef?.name}...
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
            <X className="w-8 h-8 text-status-error mx-auto mb-3" />
            <p className="text-sm text-text-weak font-sans mb-2">
              Failed to start {toolDef?.name}
            </p>
            <p className="text-xs text-status-error/80 font-mono bg-surface-2 rounded px-3 py-2">
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

// ─── Pop-out content wrapper (header + re-attach) ───────────

function PopOutContentWrapper({
  title,
  onReattach,
  children,
}: {
  title: string
  onReattach: () => void
  children: React.ReactNode
}) {
  return (
    <div className="h-screen flex flex-col bg-surface-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="/exegol-symbol-white.svg"
            alt=""
            className="w-4 h-4 opacity-60"
          />
          <span className="text-xs text-text-strong font-sans font-medium truncate max-w-[300px]">
            {title}
          </span>
        </div>
        <button
          onClick={onReattach}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-weak hover:text-text-base hover:bg-surface-2 transition-colors font-sans"
          title="Re-attach to main window"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Re-attach
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">{children}</div>
    </div>
  )
}

// ─── Empty workspace state ──────────────────────────────────

function EmptyWorkspace({ hasContainers }: { hasContainers: boolean }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Terminal className="w-8 h-8 text-text-weaker/40" />
          <FileText className="w-8 h-8 text-text-weaker/40" />
          <Globe className="w-8 h-8 text-text-weaker/40" />
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
  const allTabs = useWorkspaceStore((s) => s.tabs)
  const currentProjectId = useWorkspaceStore((s) => s._currentProjectId)
  const activeTabId = useWorkspaceStore((s) => {
    const pid = s._currentProjectId
    return pid ? s.activeTabIdByProject[pid] ?? null : null
  })
  const tabs = useMemo(
    () => currentProjectId ? allTabs.filter((t) => t.projectId === currentProjectId) : allTabs,
    [allTabs, currentProjectId],
  )
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const popOuts = usePopOutStore((s) => s.popOuts)
  const reattach = usePopOutStore((s) => s.reattach)

  const addTerminal = useTerminalStore((s) => s.addTerminal)
  const addTerminalInSplit = useTerminalStore((s) => s.addTerminalInSplit)
  const terminalGroups = useTerminalStore((s) => s.groups)
  const terminalLayout = useTerminalStore((s) => s.layout)
  const isSplit = terminalGroups.length > 1
  const openTerminalTab = useWorkspaceStore((s) => s.openTerminalTab)
  const openToolTab = useWorkspaceStore((s) => s.openToolTab)

  const launchTool = useWebToolsStore((s) => s.launchTool)
  const stopTool = useWebToolsStore((s) => s.stopTool)

  const [bottomDragging, setBottomDragging] = useState(false)
  const bottomStartHeightRef = useRef(bottomPanelHeight)
  const bottomResizeMouseDown = useResizeHandle(
    "vertical",
    (delta) => {
      // delta is (currentY - startY); dragging up = negative delta = bigger panel
      onResizeBottomPanel(Math.max(150, Math.min(bottomStartHeightRef.current - delta, 600)))
    },
    (dragging) => {
      if (dragging) bottomStartHeightRef.current = bottomPanelHeight
      setBottomDragging(dragging)
    },
  )
  const [pendingToolId, setPendingToolId] = useState<string | null>(null)
  const hasContainers = project.containerIds.length > 0

  // Sync active file in file store when a file tab is activated
  useEffect(() => {
    if (activeTab?.type === "file" && activeTab.fileId) {
      useFileStore.getState().setActiveFile(activeTab.fileId)
    }
  }, [activeTab])

  // Clean up ghost terminals on the server (from previous sessions / page reloads)
  useEffect(() => {
    if (!connected) return
    // Wait a moment for the WS connection to stabilize and any terminal:created messages to arrive
    const timer = setTimeout(() => {
      const knownIds = useTerminalStore.getState().terminals.map((t) => t.id)
      fetch("/api/terminals/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeIds: knownIds }),
      }).catch(() => { /* ignore */ })
    }, 1000)
    return () => clearTimeout(timer)
  }, [connected])

  // Listen for terminal:created from server
  useEffect(() => {
    const unsubscribe = subscribe((msg: any) => {
      if (msg.type === "terminal:created" && msg.data?.terminalId) {
        const serverId = msg.data.terminalId as string
        const name = (msg.data.name as string) || serverId.slice(0, 8)
        const containerName = (msg.data.container as string) || "unknown"
        const aiCreated = !!msg.data.aiCreated

        const termState = useTerminalStore.getState()
        if (!termState.terminals.find((t) => t.id === serverId)) {
          const newTerm = {
            id: serverId,
            name,
            container: containerName,
            projectId: project.id,
            createdAt: Date.now(),
            hasNotification: false,
          }

          // AI-created terminals respect the aiTerminalMode setting
          if (aiCreated && termState.aiTerminalMode === "split") {
            addTerminalInSplit(newTerm)
          } else {
            addTerminal(newTerm)
          }
          // Also create a workspace tab
          openTerminalTab(serverId, name, containerName)
        }
      }
    })
    return unsubscribe
  }, [subscribe, addTerminal, addTerminalInSplit, openTerminalTab, project.id])

  // Follow assistant: auto-focus terminal when AI executes a command
  // When not following, show notification badge on the target terminal tab
  useEffect(() => {
    const unsubscribe = subscribe((msg: any) => {
      let targetTerminalId: string | null = null

      if (msg.type === "command:executed" && msg.data?.terminalId) {
        targetTerminalId = msg.data.terminalId
      } else if (msg.type === "ops:update" && msg.data?.op?.status === "running" && msg.data?.op?.terminalId) {
        targetTerminalId = msg.data.op.terminalId
      }

      if (!targetTerminalId) return

      const termState = useTerminalStore.getState()

      if (termState.followAssistant) {
        termState.focusTerminalById(targetTerminalId)
        // Also switch workspace tab to terminal
        const wsState = useWorkspaceStore.getState()
        const termTab = wsState.tabs.find(
          (t) => t.type === "terminal" && t.terminalId === targetTerminalId,
        )
        if (termTab) {
          wsState.setActiveTab(termTab.id)
        }
      } else {
        // Not following — show notification badge if this isn't the active terminal
        if (termState.activeTerminalId !== targetTerminalId) {
          termState.setNotification(targetTerminalId, true)
        }
      }
    })
    return unsubscribe
  }, [subscribe])

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
          // Close pop-out window if this tab was popped out
          if (usePopOutStore.getState().isPopedOut(tab.id)) {
            usePopOutStore.getState().reattach(tab.id)
          }
          if (tab.type === "terminal" && tab.terminalId) {
            send({ type: "terminal:close", data: { terminalId: tab.terminalId } })
            useTerminalStore.getState().removeTerminal(tab.terminalId)
            // Dispose the xterm instance from the global pool
            import("../terminal/TerminalView").then(({ disposeTerminalInstance }) => {
              disposeTerminalInstance(tab.terminalId!)
            })
          }
          if (tab.type === "file" && tab.fileId) {
            useFileStore.getState().closeFile(tab.fileId)
          }
          if (tab.type === "webtool" && tab.toolId && tab.container) {
            stopTool(tab.toolId, tab.container)
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
      // Find next available terminal number (fill gaps)
      const currentTerminals = useTerminalStore.getState().terminals
      const usedNumbers = new Set(
        currentTerminals
          .map((t) => t.name.match(/^Terminal (\d+)$/))
          .filter(Boolean)
          .map((m) => parseInt(m![1], 10)),
      )
      let num = 1
      while (usedNumbers.has(num)) num++
      const name = `Terminal ${num}`
      // Estimate initial PTY size from the content area dimensions.
      // Uses approximate char metrics for a 14px monospace font.
      const contentEl = document.querySelector('[data-terminal-content]') as HTMLElement | null
      const cols = contentEl ? Math.floor(contentEl.clientWidth / 8.4) : 120
      const rows = contentEl ? Math.floor(contentEl.clientHeight / 17) : 30
      send({
        type: "terminal:create",
        data: { container: target, name, cols, rows },
      })
    },
    [hasContainers, connected, send, project.containerIds],
  )

  const doLaunchTool = useCallback(
    async (toolId: string, container: string) => {
      // If already has a tab for this tool+container, just activate it
      const existingTab = useWorkspaceStore.getState().tabs.find(
        (t) => t.type === "webtool" && t.toolId === toolId && t.container === container,
      )
      if (existingTab) {
        useWorkspaceStore.getState().setActiveTab(existingTab.id)
        return
      }
      const tool = WEB_TOOLS.find((t) => t.id === toolId)
      openToolTab(toolId, tool?.name || toolId, container)
      await launchTool(toolId, container)
    },
    [openToolTab, launchTool],
  )

  const handleLaunchTool = useCallback(
    async (toolId: string) => {
      if (!project.containerIds.length) return
      // Multiple containers → always show picker (user can pick any container, even one already running)
      if (project.containerIds.length > 1) {
        setPendingToolId(toolId)
        return
      }
      // Single container
      await doLaunchTool(toolId, project.containerIds[0])
    },
    [project.containerIds, doLaunchTool],
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

  // Collect popped-out tab IDs for quick lookup
  const poppedOutTabIds = new Set(popOuts.map((p) => p.tabId))

  // Check if the active tab is popped out
  const activeTabPoppedOut = activeTab ? poppedOutTabIds.has(activeTab.id) : false

  // Collect all tool tabs (toolId + container) for keeping iframes mounted
  // Exclude popped-out tabs from main window rendering
  const toolTabs = tabs
    .filter((t) => t.type === "webtool" && t.toolId && t.container && !poppedOutTabIds.has(t.id))
    .map((t) => ({ toolId: t.toolId!, container: t.container!, tabId: t.id }))

  // Collect all unique terminal IDs that have tabs (for keeping terminals mounted)
  // Exclude popped-out tabs from main window rendering
  const terminalTabIds = tabs
    .filter((t) => t.type === "terminal" && t.terminalId && !poppedOutTabIds.has(t.id))
    .map((t) => t.terminalId!)

  // Popped-out terminal tabs (render in portals)
  const poppedOutTerminals = popOuts.filter((p) => p.type === "terminal" && p.terminalId)
  const poppedOutTools = popOuts.filter((p) => p.type === "tool" && p.toolId)
  const poppedOutFiles = popOuts.filter((p) => p.type === "file" && p.fileId)

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

      {/* Pop-out portals — rendered outside main layout */}
      {poppedOutTerminals.map((p) => (
        <PopOutPortal
          key={p.tabId}
          windowName={`popout-${p.tabId}`}
          title={p.title}
          width={900}
          height={600}
          onClose={() => reattach(p.tabId)}
        >
          <PopOutContentWrapper title={p.title} onReattach={() => reattach(p.tabId)}>
            <TerminalView serverId={p.terminalId!} send={send} subscribe={subscribe} />
          </PopOutContentWrapper>
        </PopOutPortal>
      ))}
      {poppedOutTools.map((p) => (
        <PopOutPortal
          key={p.tabId}
          windowName={`popout-${p.tabId}`}
          title={p.title}
          width={1000}
          height={700}
          onClose={() => reattach(p.tabId)}
        >
          <PopOutContentWrapper title={p.title} onReattach={() => reattach(p.tabId)}>
            <ToolPanel toolId={p.toolId!} container={p.container || ""} visible={true} />
          </PopOutContentWrapper>
        </PopOutPortal>
      ))}
      {poppedOutFiles.map((p) => (
        <PopOutPortal
          key={p.tabId}
          windowName={`popout-${p.tabId}`}
          title={p.title}
          width={900}
          height={700}
          onClose={() => reattach(p.tabId)}
        >
          <PopOutContentWrapper title={p.title} onReattach={() => reattach(p.tabId)}>
            <FileEditorPane fileId={p.fileId!} />
          </PopOutContentWrapper>
        </PopOutPortal>
      ))}

      {/* Top: workspace tab bar + content */}
      <div className="flex-1 min-h-0 flex flex-col">
        <WorkspaceTabBar
          containerIds={project.containerIds}
          connected={connected}
          onAddTerminal={handleAddTerminal}
          onLaunchTool={handleLaunchTool}
        />

        {/* Breadcrumbs — shown when a file tab is active */}
        {activeTab?.type === "file" && activeTab.fileId && (() => {
          const parts = activeTab.fileId.split(":")
          const container = parts[0]
          const filePath = parts.slice(1).join(":")
          const segments = filePath.split("/").filter(Boolean)
          const fileName = segments.pop() || filePath
          const dirPath = segments.length > 0 ? "/" + segments.join("/") : "/"
          return (
            <div className="flex items-center gap-0.5 px-3 py-0.5 bg-surface-0 border-b border-border-weak text-[10px] font-mono text-text-weaker overflow-x-auto scrollbar-none shrink-0">
              <span className="text-accent/60">{container}</span>
              <ChevronRight className="w-2.5 h-2.5 shrink-0" />
              <span>{dirPath}</span>
              <ChevronRight className="w-2.5 h-2.5 shrink-0" />
              <span className="text-text-weak">{fileName}</span>
            </div>
          )
        })()}

        {/* Content area */}
        <div
          data-terminal-content
          className="flex-1 min-h-0 overflow-hidden relative"
          style={{ backgroundColor: "#101010" }}
        >
          {/* Ghost placeholder for popped-out active tab */}
          {activeTabPoppedOut && activeTab && (
            <PopOutGhost tabId={activeTab.id} title={activeTab.title} />
          )}

          {/* Terminal views — split layout or single terminal */}
          {isSplit && terminalLayout ? (
            <div
              className="absolute inset-0"
              style={{
                visibility:
                  activeTab?.type === "terminal" && !activeTabPoppedOut
                    ? "visible"
                    : "hidden",
              }}
            >
              <LayoutRenderer
                node={terminalLayout}
                path={[]}
                send={send}
                subscribe={subscribe}
                handleAddTerminal={handleAddTerminal}
                containerIds={project.containerIds}
              />
            </div>
          ) : (
            terminalTabIds.map((tid) => (
              <div
                key={tid}
                className="absolute inset-0"
                style={{
                  visibility:
                    activeTab?.type === "terminal" && activeTab.terminalId === tid && !activeTabPoppedOut
                      ? "visible"
                      : "hidden",
                }}
              >
                <TerminalView serverId={tid} send={send} subscribe={subscribe} />
              </div>
            ))
          )}

          {/* Tool iframes — kept mounted for persistence (excluding popped out) */}
          {toolTabs.map((tt) => (
            <ToolPanel
              key={tt.tabId}
              toolId={tt.toolId}
              container={tt.container}
              visible={
                activeTab?.type === "webtool" && activeTab.toolId === tt.toolId && activeTab.container === tt.container && !activeTabPoppedOut
              }
            />
          ))}

          {/* File editors — all open file tabs kept mounted with visibility toggle */}
          {tabs.filter(t => t.type === "file" && t.fileId && !poppedOutTabIds.has(t.id)).map(tab => (
            <div
              key={tab.id}
              className="absolute inset-0 bg-surface-0"
              style={{
                visibility: activeTab?.id === tab.id && !activeTabPoppedOut ? "visible" : "hidden"
              }}
            >
              <FileEditorPane fileId={tab.fileId!} />
            </div>
          ))}

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
            onMouseDown={bottomResizeMouseDown}
          />
          <div
            className="shrink-0 overflow-hidden flex flex-col"
            style={{ height: bottomPanelHeight }}
          >
            <BottomPanel project={project} onClose={onCloseBottomPanel} />
          </div>
        </>
      )}

      {/* Container picker for web tools */}
      {pendingToolId && (
        <ContainerPickerModal
          toolId={pendingToolId}
          containerIds={project.containerIds}
          onPick={async (toolId, container) => {
            setPendingToolId(null)
            await doLaunchTool(toolId, container)
          }}
          onCancel={() => setPendingToolId(null)}
        />
      )}
    </div>
  )
}
