import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { type Project, useProjectStore } from "../../stores/project"
import { useContainerStore } from "../../stores/container"
import { usePopOutStore } from "../../stores/popout"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { useToolApprovalStore } from "../../stores/toolApproval"
import { SettingsDialog } from "../settings/SettingsDialog"
import { type LayoutState, loadLayout, saveLayout } from "./layoutPersistence"
import { IconRail } from "./IconRail"
import { ChatSidePanel } from "./ChatSidePanel"
import { FilesSidePanel } from "./FilesSidePanel"
import { CenterArea } from "./CenterArea"
import { PopOutPortal } from "./PopOutPortal"
import { PopOutChatView } from "../chat/PopOutChatView"

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
      title: "Chat",
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
    })
  }, [subscribe, addPendingCommand, removePendingCommand, addPendingTool, removePendingTool])

  const hasContainers = project.containerIds.length > 0

  const toggleFilesPanel = () =>
    setLayout((l) => ({ ...l, filesPanelOpen: !l.filesPanelOpen }))
  const toggleChatPanel = () =>
    setLayout((l) => ({ ...l, chatPanelOpen: !l.chatPanelOpen }))
  const toggleSessionSidebar = () =>
    setLayout((l) => ({ ...l, sessionSidebarOpen: !l.sessionSidebarOpen }))
  const toggleBottomPanel = () =>
    setLayout((l) => ({ ...l, bottomPanelOpen: !l.bottomPanelOpen }))
  const swapPanels = () =>
    setLayout((l) => ({ ...l, swapped: !l.swapped }))

  // Determine which panel is on which side
  const filesOnLeft = !layout.swapped
  const chatOnLeft = layout.swapped

  const filesPanel = layout.filesPanelOpen && (
    <FilesSidePanel
      width={layout.filesPanelWidth}
      side={filesOnLeft ? "left" : "right"}
      onClose={toggleFilesPanel}
      onResize={(w) => setLayout((l) => ({ ...l, filesPanelWidth: w }))}
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

  return (
    <div className="h-full flex flex-col">
      {/* Chat pop-out portal — lives at root so it persists when panel is closed */}
      {chatPoppedOut && (
        <PopOutPortal
          windowName={`popout-chat-${project.id}`}
          title="Chat — Exegol IHE"
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

      <div className="flex-1 flex overflow-hidden">
        {/* Icon rail */}
        <IconRail
          project={project}
          projects={projects}
          onNavigateHome={() => navigate("/")}
          onSwitchProject={(id) => {
            setActiveProject(id)
            navigate(`/project/${id}`)
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenContainers={() => setShowContainerManager(true)}
          containerCount={project.containerIds.length}
          filesPanelOpen={layout.filesPanelOpen}
          chatPanelOpen={layout.chatPanelOpen}
          bottomPanelOpen={layout.bottomPanelOpen}
          swapped={layout.swapped}
          onToggleFilesPanel={toggleFilesPanel}
          onToggleChatPanel={toggleChatPanel}
          onToggleBottomPanel={toggleBottomPanel}
          onSwapPanels={swapPanels}
        />

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

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
