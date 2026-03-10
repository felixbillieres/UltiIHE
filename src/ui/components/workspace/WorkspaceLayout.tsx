import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { type Project, useProjectStore } from "../../stores/project"
import { useContainerStore } from "../../stores/container"
import { useSettingsStore } from "../../stores/settings"
import { useSessionStore, type Session } from "../../stores/session"
import { useFileStore } from "../../stores/files"
import { useWebSocket } from "../../hooks/useWebSocket"
import { ChatPanel } from "../chat/ChatPanel"
import { TerminalArea } from "../terminal/TerminalArea"
import { FileEditor } from "../files/FileEditor"
import { FileTree } from "../layout/FileTree"
import { SettingsDialog } from "../settings/SettingsDialog"
import {
  Shield,
  Settings,
  Plus,
  MessageSquare,
  Trash2,
  Bot,
  FolderTree,
  Sparkles,
} from "lucide-react"

interface Props {
  project: Project
}

export function WorkspaceLayout({ project }: Props) {
  const navigate = useNavigate()
  const container = useContainerStore((s) => s.getActiveContainer())
  const { activeModel } = useSettingsStore()
  const projects = useProjectStore((s) => s.projects)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  const [showSettings, setShowSettings] = useState(false)
  const [rightTab, setRightTab] = useState<"chat" | "files">("chat")
  const [rightPanelWidth] = useState(400)

  const { send, connected, subscribe } = useWebSocket({
    enabled: !!container,
  })

  return (
    <div className="h-full flex flex-col">
      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Icon rail (48px) ── */}
        <IconRail
          project={project}
          projects={projects}
          container={container}
          onNavigateHome={() => {
            useContainerStore.getState().setActiveContainer(null)
            navigate("/")
          }}
          onSwitchProject={(id) => {
            setActiveProject(id)
            navigate(`/project/${id}`)
          }}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/* ── Session panel (220px) ── */}
        <SessionPanel projectId={project.id} />

        {/* ── Center: terminals + file editor ── */}
        <CenterArea
          send={send}
          subscribe={subscribe}
          connected={connected}
        />

        {/* ── Right panel: Chat / Files tabs (400px) ── */}
        <div
          className="shrink-0 border-l border-border-weak flex flex-col"
          style={{ width: rightPanelWidth }}
        >
          {/* Tab bar */}
          <div className="flex items-center border-b border-border-weak bg-surface-1 shrink-0">
            <RightPanelTab
              active={rightTab === "chat"}
              onClick={() => setRightTab("chat")}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              label="Chat"
            />
            <RightPanelTab
              active={rightTab === "files"}
              onClick={() => setRightTab("files")}
              icon={<FolderTree className="w-3.5 h-3.5" />}
              label="Files"
            />
            <div className="ml-auto pr-2 flex items-center gap-1">
              <span className="text-[10px] text-text-weaker font-mono truncate max-w-[100px]">
                {activeModel}
              </span>
            </div>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {rightTab === "chat" ? (
              <ChatPanel projectId={project.id} />
            ) : (
              <div className="h-full overflow-y-auto">
                <FileTree />
              </div>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

// ─── Icon rail ───────────────────────────────────────────────

function IconRail({
  project,
  projects,
  container,
  onNavigateHome,
  onSwitchProject,
  onOpenSettings,
}: {
  project: Project
  projects: Project[]
  container: { name: string } | undefined
  onNavigateHome: () => void
  onSwitchProject: (id: string) => void
  onOpenSettings: () => void
}) {
  return (
    <div className="w-12 shrink-0 bg-surface-0 border-r border-border-weak flex flex-col items-center py-3 gap-2">
      {/* Project icons */}
      <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto no-scrollbar w-full px-1.5">
        {projects.map((p) => {
          const isActive = p.id === project.id
          const initial = p.name.charAt(0).toUpperCase()
          return (
            <button
              key={p.id}
              onClick={() =>
                isActive ? undefined : onSwitchProject(p.id)
              }
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
      <div className="shrink-0 flex flex-col items-center gap-2 pt-2 border-t border-border-weak/50 w-full px-1.5">
        {container && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center bg-status-success/10 shrink-0"
            title={container.name}
          >
            <Shield className="w-4 h-4 text-status-success" />
          </div>
        )}
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-text-weaker hover:bg-surface-2 hover:text-text-weak transition-colors shrink-0"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Session panel ───────────────────────────────────────────

function SessionPanel({ projectId }: { projectId: string }) {
  const {
    getProjectSessions,
    activeSessionId,
    setActiveSession,
    deleteSession,
    startNewChat,
  } = useSessionStore()

  const sessions = getProjectSessions(projectId)

  return (
    <div className="w-56 shrink-0 border-r border-border-weak bg-surface-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-weak shrink-0">
        <span className="text-xs text-text-strong font-sans font-medium">
          Sessions
        </span>
        <button
          onClick={() => startNewChat(projectId)}
          className="p-1 rounded hover:bg-surface-2 transition-colors"
          title="New chat"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
        </button>
      </div>

      {/* Session list */}
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
  const msgCount = session.messages?.length ?? 0
  const timeAgo = formatTimeAgo(session.updatedAt)

  return (
    <div
      onClick={onSelect}
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
        <div
          className={`text-xs truncate font-sans ${
            isActive ? "text-text-strong" : "text-text-weak"
          }`}
        >
          {session.title}
        </div>
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

// ─── Right panel tab ─────────────────────────────────────────

function RightPanelTab({
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

// ─── Center area (terminals + file editor) ───────────────────

function CenterArea({
  send,
  subscribe,
  connected,
}: {
  send: (data: any) => void
  subscribe: (handler: (data: any) => void) => () => void
  connected: boolean
}) {
  const hasOpenFiles = useFileStore((s) => s.openFiles.length > 0)
  const [editorHeight, setEditorHeight] = useState(300)
  const [dragging, setDragging] = useState(false)

  if (!hasOpenFiles) {
    return (
      <div className="flex-1 min-w-0">
        <TerminalArea
          send={send}
          subscribe={subscribe}
          connected={connected}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
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
        />
      </div>
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
