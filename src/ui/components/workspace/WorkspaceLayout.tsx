import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { type Project, useProjectStore } from "../../stores/project"
import { useContainerStore } from "../../stores/container"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { useToolApprovalStore } from "../../stores/toolApproval"
import { SettingsDialog } from "../settings/SettingsDialog"
import { type LayoutState, loadLayout, saveLayout } from "./layoutPersistence"
import { IconRail } from "./IconRail"
import { ChatSidePanel } from "./ChatSidePanel"
import { CenterArea } from "./CenterArea"

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
  const [rightTab, setRightTab] = useState<"chat" | "files">("chat")

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
      // Command approval (terminal_write)
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
      // Tool approval (file_write, web_fetch, web_search, etc.)
      if (msg.type === "tool:pending") {
        addPendingTool({
          id: msg.id as string,
          toolName: msg.toolName as string,
          description: msg.description as string,
          args: (msg.args as Record<string, unknown>) || {},
        })
      }
    })
  }, [subscribe, addPendingCommand, removePendingCommand, addPendingTool, removePendingTool])

  const hasContainers = project.containerIds.length > 0

  const toggleChatPanel = () =>
    setLayout((l) => ({ ...l, chatPanelOpen: !l.chatPanelOpen }))
  const toggleSessionSidebar = () =>
    setLayout((l) => ({ ...l, sessionSidebarOpen: !l.sessionSidebarOpen }))

  return (
    <div className="h-full flex flex-col">
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
          chatPanelOpen={layout.chatPanelOpen}
          onToggleChatPanel={toggleChatPanel}
        />

        {/* Center: terminals + file editor */}
        <CenterArea
          send={send}
          subscribe={subscribe}
          connected={connected}
          project={project}
          showContainerManager={!hasContainers || showContainerManager}
          onCloseContainerManager={() => setShowContainerManager(false)}
        />

        {/* Chat panel (right side, with integrated session tabs + sidebar) */}
        {layout.chatPanelOpen && (
          <ChatSidePanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            projectId={project.id}
            project={project}
            width={layout.chatPanelWidth}
            side="right"
            onClose={toggleChatPanel}
            onResize={(w) => setLayout((l) => ({ ...l, chatPanelWidth: w }))}
            sessionSidebarOpen={layout.sessionSidebarOpen}
            onToggleSessionSidebar={toggleSessionSidebar}
          />
        )}
      </div>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
