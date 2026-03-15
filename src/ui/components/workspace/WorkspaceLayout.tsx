import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { type Project, useProjectStore } from "../../stores/project"
import { useContainerStore } from "../../stores/container"
import { usePopOutStore } from "../../stores/popout"
import { useTerminalStore } from "../../stores/terminal"
import { useWorkspaceStore } from "../../stores/workspace"
import { useFileStore } from "../../stores/files"
import { useChatContextStore } from "../../stores/chatContext"
import { switchProject as orchestratorSwitchProject } from "../../stores/orchestrator"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { useToolApprovalStore } from "../../stores/toolApproval"
import { SettingsDialog } from "../settings/SettingsDialog"
import { type LayoutState, type LayoutPreset, loadLayout, saveLayout, LAYOUT_PRESETS } from "./layoutPersistence"
import { TopBar } from "./TopBar"
import { StatusBar } from "./StatusBar"
import { ChatSidePanel } from "./ChatSidePanel"
import { FilesSidePanel } from "./FilesSidePanel"
import { CenterArea } from "./CenterArea"
import { PopOutPortal } from "./PopOutPortal"
import { PopOutChatView } from "../chat/PopOutChatView"
import { CommandPaletteProvider } from "../../hooks/useCommandPalette"
import { CommandPaletteDialog } from "../CommandPaletteDialog"
import { UnifiedSearchDialog } from "../search/UnifiedSearchDialog"
import { SearchMiniPanel } from "../search/SearchMiniPanel"
import { useSearchStore } from "../../stores/search"
import { useBuiltinCommands, type LayoutActions } from "../../hooks/useBuiltinCommands"

// ─── Main component ──────────────────────────────────────────

interface Props {
  project: Project
}

export function WorkspaceLayout({ project }: Props) {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const fetchContainers = useContainerStore((s) => s.fetchContainers)

  const [showSettings, setShowSettings] = useState(false)
  const [showContainerManager, setShowContainerManager] = useState(false)
  const [chatPoppedOut, setChatPoppedOut] = useState(false)

  const handlePopOutChat = () => {
    setChatPoppedOut(true)
    usePopOutStore.getState().popOut({
      tabId: `chat-${project.id}`,
      type: "chat",
      windowRef: null,
      title: "Assistant",
    })
    // Close the main chat panel to free up space
    setLayout((l) => ({ ...l, chatPanelOpen: false }))
  }

  const handleReattachChat = () => {
    setChatPoppedOut(false)
    usePopOutStore.getState().reattach(`chat-${project.id}`)
    // Re-open the chat panel
    setLayout((l) => ({ ...l, chatPanelOpen: true }))
  }

  // Layout state
  const [layout, setLayoutRaw] = useState<LayoutState>(loadLayout)
  const setLayout = useCallback((updater: (prev: LayoutState) => LayoutState) => {
    setLayoutRaw((prev) => {
      const next = updater(prev)
      saveLayout(next)
      return next
    })
  }, [])

  // ── Project switch: scope all stores to the new project ──
  const prevProjectIdRef = useRef(project.id)
  useEffect(() => {
    if (prevProjectIdRef.current !== project.id) {
      // Orchestrator resets all per-project stores at once
      orchestratorSwitchProject(project.id)
    } else {
      // Initial mount — just scope the per-project stores
      useTerminalStore.getState().switchProject(project.id)
      useWorkspaceStore.getState().switchProject(project.id)
      useFileStore.getState().switchProject(project.id)
    }
    prevProjectIdRef.current = project.id
  }, [project.id])

  // Dynamic window title
  useEffect(() => {
    document.title = `Exegol IHE — ${project.name}`
  }, [project.name])

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers])

  const { send, connected, subscribe } = useWebSocket({ enabled: true })
  const addPendingCommand = useCommandApprovalStore((s) => s.addPending)
  const removePendingCommand = useCommandApprovalStore((s) => s.removePending)

  const addPendingTool = useToolApprovalStore((s) => s.addPending)
  const removePendingTool = useToolApprovalStore((s) => s.removePending)

  // Subscribe to command + tool approval messages from server
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "command:pending" && msg.data) {
        addPendingCommand({
          id: msg.data.commandId as string || msg.data.id as string,
          terminalId: msg.data.terminalId as string,
          terminalName: msg.data.terminalName as string,
          command: msg.data.command as string,
        })
      }
      if (msg.type === "command:executed" && msg.data) {
        const cmdId = msg.data.commandId as string || msg.data.id as string
        removePendingCommand(cmdId)
      }
      if (msg.type === "tool:pending") {
        addPendingTool({
          id: msg.id as string,
          toolName: msg.toolName as string,
          description: msg.description as string,
          args: (msg.args as Record<string, unknown>) || {},
          diff: (msg.diff as string) || undefined,
          fileKey: (msg.fileKey as string) || undefined,
          isNewFile: (msg.isNewFile as boolean) || undefined,
        })
      }
      // Mode switch or timeout → clear pending queues
      if (msg.type === "command:all-cleared") {
        useCommandApprovalStore.getState().clearAll()
      }
      if (msg.type === "tool:all-cleared") {
        useToolApprovalStore.getState().clearAll()
      }
      if (msg.type === "command:timeout" && msg.data) {
        removePendingCommand(msg.data.commandId as string)
      }
      if (msg.type === "tool:timeout" && msg.data) {
        removePendingTool(msg.data.id as string)
      }
    })
  }, [subscribe, addPendingCommand, removePendingCommand, addPendingTool, removePendingTool])

  const hasContainers = project.containerIds.length > 0

  const toggleFilesPanel = useCallback(() =>
    setLayout((l) => ({ ...l, filesPanelOpen: !l.filesPanelOpen })), [setLayout])
  const toggleChatPanel = useCallback(() =>
    setLayout((l) => ({ ...l, chatPanelOpen: !l.chatPanelOpen })), [setLayout])
  const toggleSessionSidebar = useCallback(() =>
    setLayout((l) => ({ ...l, sessionSidebarOpen: !l.sessionSidebarOpen })), [setLayout])
  const toggleBottomPanel = useCallback(() =>
    setLayout((l) => ({ ...l, bottomPanelOpen: !l.bottomPanelOpen })), [setLayout])
  const swapPanels = useCallback(() =>
    setLayout((l) => ({ ...l, swapped: !l.swapped })), [setLayout])
  const applyPreset = useCallback((preset: LayoutPreset) => {
    const p = LAYOUT_PRESETS[preset]
    setLayout((l) => ({ ...l, ...p.panels, activePreset: preset }))
  }, [setLayout])

  // Determine which panel is on which side
  const filesOnLeft = !layout.swapped
  const chatOnLeft = layout.swapped

  const filesPanel = layout.filesPanelOpen && (
    <FilesSidePanel
      width={layout.filesPanelWidth}
      side={filesOnLeft ? "left" : "right"}
      onClose={toggleFilesPanel}
      onResize={(w) => setLayout((l) => ({ ...l, filesPanelWidth: w }))}
      containerIds={project.containerIds}
      onOpenContainers={() => setShowContainerManager(true)}
    />
  )

  const chatPanel = layout.chatPanelOpen && (
    <ChatSidePanel
      projectId={project.id}
      project={project}
      width={layout.chatPanelWidth}
      side={chatOnLeft ? "left" : "right"}
      onClose={toggleChatPanel}
      onResize={(w) => setLayout((l) => ({ ...l, chatPanelWidth: w }))}
      sessionSidebarOpen={layout.sessionSidebarOpen}
      onToggleSessionSidebar={toggleSessionSidebar}
      onPopOut={handlePopOutChat}
    />
  )

  const layoutActions: LayoutActions = useMemo(() => ({
    toggleFilesPanel,
    toggleChatPanel,
    toggleBottomPanel,
    toggleSessionSidebar,
    swapPanels,
    openSettings: () => setShowSettings(true),
  }), [toggleFilesPanel, toggleChatPanel, toggleBottomPanel, toggleSessionSidebar, swapPanels])

  return (
    <CommandPaletteProvider>
      <CommandPaletteBindings projectId={project.id} layout={layoutActions} />
      <CommandPaletteDialog />
      <UnifiedSearchDialog />
      <SearchMiniPanel />

      <div className="h-full flex flex-col">
        {/* Chat pop-out portal — lives at root so it persists when panel is closed */}
        {chatPoppedOut && (
          <PopOutPortal
            windowName={`popout-chat-${project.id}`}
            title="Assistant — Exegol IHE"
            width={Math.round(window.screen.width * 0.65)}
            height={Math.round(window.screen.height * 0.8)}
            onClose={handleReattachChat}
          >
            <PopOutChatView
              projectId={project.id}
              onReattach={handleReattachChat}
            />
          </PopOutPortal>
        )}

        {/* Top bar — single 35px row */}
        <TopBar
          project={project}
          projects={projects}
          onNavigateHome={() => navigate("/")}
          onSwitchProject={(id) => {
            orchestratorSwitchProject(id)
            navigate(`/project/${id}`)
          }}
          onOpenSettings={() => setShowSettings(true)}
          containerCount={project.containerIds.length}
          filesPanelOpen={layout.filesPanelOpen}
          chatPanelOpen={layout.chatPanelOpen}
          bottomPanelOpen={layout.bottomPanelOpen}
          onToggleFilesPanel={toggleFilesPanel}
          onToggleChatPanel={toggleChatPanel}
          onToggleBottomPanel={toggleBottomPanel}
          swapped={layout.swapped}
          onSwapPanels={swapPanels}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* Left side panel */}
          {filesOnLeft ? filesPanel : chatPanel}

          {/* Center: terminals + file editor + bottom panel */}
          <CenterArea
            send={send}
            subscribe={subscribe}
            connected={connected}
            project={project}
            showContainerManager={!hasContainers || showContainerManager}
            onCloseContainerManager={() => setShowContainerManager(false)}
            bottomPanelOpen={layout.bottomPanelOpen}
            bottomPanelHeight={layout.bottomPanelHeight}
            onCloseBottomPanel={toggleBottomPanel}
            onResizeBottomPanel={(h) => setLayout((l) => ({ ...l, bottomPanelHeight: h }))}
          />

          {/* Right side panel */}
          {filesOnLeft ? chatPanel : filesPanel}
        </div>

        {/* Status bar — 22px at bottom */}
        <StatusBar
          project={project}
          containerCount={project.containerIds.length}
        />

        {showSettings && (
          <SettingsDialog onClose={() => setShowSettings(false)} />
        )}
      </div>
    </CommandPaletteProvider>
  )
}

// ─── Palette bindings (must be inside CommandPaletteProvider) ──

function CommandPaletteBindings({ projectId, layout }: { projectId: string; layout: LayoutActions }) {
  useBuiltinCommands(projectId, layout)
  return null
}
