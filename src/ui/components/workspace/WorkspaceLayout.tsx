import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { type Project, useProjectStore } from "../../stores/project"
import { useContainerStore } from "../../stores/container"
import { useSessionStore, type Session } from "../../stores/session"
import { useFileStore } from "../../stores/files"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { ChatPanel } from "../chat/ChatPanel"
import { TerminalArea } from "../terminal/TerminalArea"
import { FileEditor } from "../files/FileEditor"
import { FileTree } from "../layout/FileTree"
import { SettingsDialog } from "../settings/SettingsDialog"
import { ExegolManager } from "../exegol/ExegolManager"
import {
  Settings as SettingsIcon,
  Plus,
  MessageSquare,
  Trash2,
  FolderTree,
  Sparkles,
  Box,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeftRight,
} from "lucide-react"

// ─── Layout persistence ───────────────────────────────────────

const LAYOUT_KEY = "ultiIHE-layout"

interface LayoutState {
  sessionPanelOpen: boolean
  chatPanelOpen: boolean
  swapped: boolean // false = session left + chat right, true = chat left + session right
  sessionPanelWidth: number
  chatPanelWidth: number
}

const DEFAULT_LAYOUT: LayoutState = {
  sessionPanelOpen: true,
  chatPanelOpen: true,
  swapped: false,
  sessionPanelWidth: 224,
  chatPanelWidth: 400,
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_LAYOUT
}

function saveLayout(state: LayoutState) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(state))
}

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

  // Subscribe to command approval messages from server
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
    })
  }, [subscribe, addPendingCommand, removePendingCommand])

  const hasContainers = project.containerIds.length > 0

  // Panel toggle handlers
  const toggleSessionPanel = () =>
    setLayout((l) => ({ ...l, sessionPanelOpen: !l.sessionPanelOpen }))
  const toggleChatPanel = () =>
    setLayout((l) => ({ ...l, chatPanelOpen: !l.chatPanelOpen }))
  const swapPanels = () =>
    setLayout((l) => ({ ...l, swapped: !l.swapped }))

  // Determine which panel is on which side based on swap state
  const sessionOnLeft = !layout.swapped
  const chatOnLeft = layout.swapped

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
          sessionPanelOpen={layout.sessionPanelOpen}
          chatPanelOpen={layout.chatPanelOpen}
          swapped={layout.swapped}
          onToggleSessionPanel={toggleSessionPanel}
          onToggleChatPanel={toggleChatPanel}
          onSwapPanels={swapPanels}
        />

        {/* Left side panel */}
        {sessionOnLeft && layout.sessionPanelOpen && (
          <SessionPanel
            projectId={project.id}
            side="left"
            onClose={toggleSessionPanel}
          />
        )}
        {chatOnLeft && layout.chatPanelOpen && (
          <ChatSidePanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            projectId={project.id}
            project={project}
            width={layout.chatPanelWidth}
            side="left"
            onClose={toggleChatPanel}
            onResize={(w) => setLayout((l) => ({ ...l, chatPanelWidth: w }))}
          />
        )}

        {/* Center: terminals + file editor */}
        <CenterArea
          send={send}
          subscribe={subscribe}
          connected={connected}
          project={project}
          showContainerManager={!hasContainers || showContainerManager}
          onCloseContainerManager={() => setShowContainerManager(false)}
        />

        {/* Right side panel */}
        {!sessionOnLeft && layout.sessionPanelOpen && (
          <SessionPanel
            projectId={project.id}
            side="right"
            onClose={toggleSessionPanel}
          />
        )}
        {!chatOnLeft && layout.chatPanelOpen && (
          <ChatSidePanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            projectId={project.id}
            project={project}
            width={layout.chatPanelWidth}
            side="right"
            onClose={toggleChatPanel}
            onResize={(w) => setLayout((l) => ({ ...l, chatPanelWidth: w }))}
          />
        )}
      </div>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

// ─── Chat side panel (chat/files) with resize handle ─────────

function ChatSidePanel({
  rightTab,
  setRightTab,
  projectId,
  project,
  width,
  side,
  onClose,
  onResize,
}: {
  rightTab: "chat" | "files"
  setRightTab: (tab: "chat" | "files") => void
  projectId: string
  project: Project
  width: number
  side: "left" | "right"
  onClose: () => void
  onResize: (width: number) => void
}) {
  const [dragging, setDragging] = useState(false)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      const startX = e.clientX
      const startW = width
      const factor = side === "right" ? -1 : 1

      function onMove(ev: MouseEvent) {
        const delta = (ev.clientX - startX) * factor
        onResize(Math.max(280, Math.min(startW + delta, 700)))
      }
      function onUp() {
        setDragging(false)
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [width, side, onResize],
  )

  const borderClass = side === "right" ? "border-l" : "border-r"

  return (
    <div className="flex shrink-0" style={{ width }}>
      {/* Resize handle on center-facing edge */}
      {side === "right" && (
        <div
          className={`w-[3px] shrink-0 cursor-col-resize transition-colors ${
            dragging ? "bg-accent/40" : "bg-border-weak hover:bg-accent/20"
          }`}
          onMouseDown={handleResizeStart}
        />
      )}

      <div
        className={`flex-1 min-w-0 ${borderClass} border-border-weak flex flex-col`}
      >
        {/* Tab bar */}
        <div className="flex items-center border-b border-border-weak bg-surface-1 shrink-0">
          <PanelTab
            active={rightTab === "chat"}
            onClick={() => setRightTab("chat")}
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Chat"
          />
          <PanelTab
            active={rightTab === "files"}
            onClick={() => setRightTab("files")}
            icon={<FolderTree className="w-3.5 h-3.5" />}
            label="Files"
          />
          <div className="ml-auto pr-1.5">
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-2 transition-colors"
              title="Close panel"
            >
              <X className="w-3 h-3 text-text-weaker" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {rightTab === "chat" ? (
            <ChatPanel projectId={projectId} />
          ) : (
            <FileTreeWithSelector project={project} />
          )}
        </div>
      </div>

      {/* Resize handle for left side */}
      {side === "left" && (
        <div
          className={`w-[3px] shrink-0 cursor-col-resize transition-colors ${
            dragging ? "bg-accent/40" : "bg-border-weak hover:bg-accent/20"
          }`}
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  )
}

// ─── File tree with container selector ───────────────────────

function FileTreeWithSelector({ project }: { project: Project }) {
  const [selectedContainer, setSelectedContainer] = useState(
    project.containerIds[0] || "",
  )
  const setActiveContainer = useContainerStore((s) => s.setActiveContainer)
  const containers = useContainerStore((s) => s.containers)

  useEffect(() => {
    if (selectedContainer) {
      const c = containers.find((c) => c.name === selectedContainer)
      if (c) setActiveContainer(c.id)
    }
  }, [selectedContainer, containers, setActiveContainer])

  if (project.containerIds.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-center">
        <div>
          <Box className="w-6 h-6 text-text-weaker mx-auto mb-2" />
          <p className="text-xs text-text-weaker font-sans">
            Add a container to browse files
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {project.containerIds.length > 1 && (
        <div className="px-2 py-1.5 border-b border-border-weak shrink-0">
          <select
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
            className="w-full bg-surface-1 border border-border-weak rounded px-2 py-1 text-xs text-text-base font-sans focus:outline-none focus:border-accent/50"
          >
            {project.containerIds.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </div>
  )
}

// ─── Icon rail ───────────────────────────────────────────────

function IconRail({
  project,
  projects,
  onNavigateHome,
  onSwitchProject,
  onOpenSettings,
  onOpenContainers,
  containerCount,
  sessionPanelOpen,
  chatPanelOpen,
  swapped,
  onToggleSessionPanel,
  onToggleChatPanel,
  onSwapPanels,
}: {
  project: Project
  projects: Project[]
  onNavigateHome: () => void
  onSwitchProject: (id: string) => void
  onOpenSettings: () => void
  onOpenContainers: () => void
  containerCount: number
  sessionPanelOpen: boolean
  chatPanelOpen: boolean
  swapped: boolean
  onToggleSessionPanel: () => void
  onToggleChatPanel: () => void
  onSwapPanels: () => void
}) {
  return (
    <div className="w-12 shrink-0 bg-surface-0 border-r border-border-weak flex flex-col items-center gap-2">
      {/* Project buttons — scrollable */}
      <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto scrollbar-none w-full px-1.5 pt-3">
        {projects.map((p) => {
          const isActive = p.id === project.id
          const initial = p.name.charAt(0).toUpperCase()
          return (
            <button
              key={p.id}
              onClick={() => (!isActive ? onSwitchProject(p.id) : undefined)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-sans font-bold transition-all shrink-0 ${
                isActive
                  ? "bg-accent/20 text-accent ring-2 ring-accent/50"
                  : "bg-surface-2 text-text-weak hover:bg-surface-3 hover:text-text-base"
              }`}
              title={p.name}
            >
              {initial}
            </button>
          )
        })}

        <button
          onClick={onNavigateHome}
          className="w-9 h-9 rounded-lg flex items-center justify-center border border-dashed border-border-weak text-text-weaker hover:border-border-base hover:text-text-weak transition-colors shrink-0"
          title="All projects"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 flex flex-col items-center gap-1.5 py-3 border-t border-border-weak/50 w-full px-1.5">
        {/* Panel toggles: session | swap | chat */}
        <button
          onClick={onToggleSessionPanel}
          className={`w-9 h-7 rounded flex items-center justify-center transition-colors shrink-0 ${
            sessionPanelOpen
              ? "text-accent bg-accent/10 hover:bg-accent/15"
              : "text-text-weaker hover:bg-surface-2 hover:text-text-weak"
          }`}
          title={sessionPanelOpen ? "Hide sessions" : "Show sessions"}
        >
          {sessionPanelOpen ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          onClick={onSwapPanels}
          className={`w-9 h-7 rounded flex items-center justify-center transition-colors shrink-0 ${
            swapped
              ? "text-accent bg-accent/10 hover:bg-accent/15"
              : "text-text-weaker hover:bg-surface-2 hover:text-text-weak"
          }`}
          title="Swap panels"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleChatPanel}
          className={`w-9 h-7 rounded flex items-center justify-center transition-colors shrink-0 ${
            chatPanelOpen
              ? "text-accent bg-accent/10 hover:bg-accent/15"
              : "text-text-weaker hover:bg-surface-2 hover:text-text-weak"
          }`}
          title={chatPanelOpen ? "Hide chat" : "Show chat"}
        >
          {chatPanelOpen ? (
            <PanelRightClose className="w-3.5 h-3.5" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="w-6 h-px bg-border-weak/50 my-0.5" />

        {/* Container + settings */}
        <button
          onClick={onOpenContainers}
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-text-weaker hover:bg-surface-2 hover:text-text-weak transition-colors shrink-0"
          title="Manage containers"
        >
          <Box className="w-4 h-4" />
          {containerCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-status-success text-[8px] text-white flex items-center justify-center font-bold">
              {containerCount}
            </span>
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-text-weaker hover:bg-surface-2 hover:text-text-weak transition-colors shrink-0"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Session panel ───────────────────────────────────────────

function SessionPanel({
  projectId,
  side,
  onClose,
}: {
  projectId: string
  side: "left" | "right"
  onClose: () => void
}) {
  const {
    getProjectSessions,
    activeSessionId,
    setActiveSession,
    deleteSession,
    startNewChat,
  } = useSessionStore()

  const sessions = getProjectSessions(projectId)

  const borderClass = side === "left" ? "border-r" : "border-l"

  return (
    <div className={`w-56 shrink-0 ${borderClass} border-border-weak bg-surface-0 flex flex-col`}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-weak shrink-0">
        <span className="text-xs text-text-strong font-sans font-medium">
          Sessions
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => startNewChat(projectId)}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5 text-text-weaker" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="Close sessions"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="w-6 h-6 text-text-weaker mx-auto mb-2" />
            <p className="text-xs text-text-weaker font-sans">
              No conversations yet
            </p>
            <button
              onClick={() => startNewChat(projectId)}
              className="mt-2 text-[10px] text-accent hover:text-accent-hover font-sans transition-colors"
            >
              Start a chat
            </button>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => setActiveSession(session.id)}
              onDelete={() => deleteSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SessionRow({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: Session
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const renameSession = useSessionStore((s) => s.renameSession)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const msgCount = session.messages?.length ?? 0
  const timeAgo = formatTimeAgo(session.updatedAt)

  const startEditing = () => {
    setEditName(session.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editName.trim() && editName.trim() !== session.title) {
      renameSession(session.id, editName.trim())
    }
    setEditing(false)
  }

  return (
    <div
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation()
        startEditing()
      }}
      className={`flex items-start gap-2 px-3 py-2 cursor-pointer group transition-colors ${
        isActive
          ? "bg-accent/8 border-l-2 border-accent"
          : "hover:bg-surface-2 border-l-2 border-transparent"
      }`}
    >
      <div
        className={`shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 ${
          isActive ? "text-accent" : "text-text-weaker"
        }`}
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") setEditing(false)
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent border-b border-accent text-xs text-text-strong font-sans outline-none"
            autoFocus
          />
        ) : (
          <div
            className={`text-xs truncate font-sans ${
              isActive ? "text-text-strong" : "text-text-weak"
            }`}
          >
            {session.title}
          </div>
        )}
        <div className="text-[10px] text-text-weaker font-sans mt-0.5">
          {msgCount} msg{msgCount !== 1 ? "s" : ""} · {timeAgo}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-3 transition-all shrink-0 mt-0.5"
      >
        <Trash2 className="w-3 h-3 text-text-weaker hover:text-status-error" />
      </button>
    </div>
  )
}

// ─── Panel tab ──────────────────────────────────────────────

function PanelTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-medium transition-colors ${
        active
          ? "text-text-strong border-b-2 border-accent"
          : "text-text-weaker hover:text-text-weak border-b-2 border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Center area ─────────────────────────────────────────────

function CenterArea({
  send,
  subscribe,
  connected,
  project,
  showContainerManager,
  onCloseContainerManager,
}: {
  send: (data: any) => void
  subscribe: (handler: (data: any) => void) => () => void
  connected: boolean
  project: Project
  showContainerManager: boolean
  onCloseContainerManager: () => void
}) {
  const hasOpenFiles = useFileStore((s) => s.openFiles.length > 0)
  const [editorHeight, setEditorHeight] = useState(300)
  const [dragging, setDragging] = useState(false)

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

  return (
    <div className="flex-1 min-w-0 flex flex-col relative">
      {showContainerManager && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <ExegolManager
            project={project}
            onClose={onCloseContainerManager}
            canClose={true}
          />
        </div>
      )}

      {hasOpenFiles ? (
        <>
          <div className="shrink-0" style={{ height: editorHeight }}>
            <FileEditor />
          </div>
          <div
            className={`h-1 cursor-row-resize shrink-0 transition-colors ${
              dragging ? "bg-accent/40" : "bg-border-weak hover:bg-accent/20"
            }`}
            onMouseDown={(e) => {
              e.preventDefault()
              setDragging(true)
              const startY = e.clientY
              const startH = editorHeight
              function onMove(ev: MouseEvent) {
                const delta = ev.clientY - startY
                setEditorHeight(Math.max(120, Math.min(startH + delta, 600)))
              }
              function onUp() {
                setDragging(false)
                document.removeEventListener("mousemove", onMove)
                document.removeEventListener("mouseup", onUp)
              }
              document.addEventListener("mousemove", onMove)
              document.addEventListener("mouseup", onUp)
            }}
          />
          <div className="flex-1 min-h-0">
            <TerminalArea
              send={send}
              subscribe={subscribe}
              connected={connected}
              project={project}
            />
          </div>
        </>
      ) : (
        <TerminalArea
          send={send}
          subscribe={subscribe}
          connected={connected}
          project={project}
        />
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
