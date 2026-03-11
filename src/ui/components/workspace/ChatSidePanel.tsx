import { useState, useCallback, useRef } from "react"
import { type Project } from "../../stores/project"
import { useSessionStore, type Session } from "../../stores/session"
import { ChatPanel } from "../chat/ChatPanel"
import { formatTimeAgo } from "./layoutPersistence"
import {
  X,
  Plus,
  Clock,
  PanelRightClose,
  MessageSquare,
  Trash2,
  Search,
  ChevronDown,
} from "lucide-react"

// ─── Session Tab Bar (Cursor-style) ─────────────────────────────

function SessionTabBar({
  projectId,
  onToggleSidebar,
  sidebarOpen,
}: {
  projectId: string
  onToggleSidebar: () => void
  sidebarOpen: boolean
}) {
  const {
    getProjectSessions,
    activeSessionId,
    setActiveSession,
    startNewChat,
  } = useSessionStore()

  const sessions = getProjectSessions(projectId)
  const tabsRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex items-center border-b border-border-weak bg-surface-0 shrink-0 h-9">
      {/* Session tabs — scrollable */}
      <div
        ref={tabsRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-none min-w-0 px-1 gap-0.5"
      >
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId
          return (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={`shrink-0 max-w-[160px] px-2.5 py-1 text-[11px] font-sans rounded-md transition-colors truncate ${
                isActive
                  ? "bg-surface-2 text-text-strong font-medium"
                  : "text-text-weaker hover:text-text-weak hover:bg-surface-1"
              }`}
              title={s.title}
            >
              {s.title}
            </button>
          )
        })}
        {sessions.length === 0 && (
          <span className="text-[11px] text-text-weaker font-sans px-2">
            No sessions
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center shrink-0 pr-1.5 gap-0.5">
        <button
          onClick={() => startNewChat(projectId)}
          className="p-1 rounded hover:bg-surface-2 transition-colors"
          title="New chat"
        >
          <Plus className="w-3.5 h-3.5 text-text-weaker" />
        </button>
        <button
          onClick={onToggleSidebar}
          className={`p-1 rounded transition-colors ${
            sidebarOpen
              ? "text-accent bg-accent/10 hover:bg-accent/15"
              : "text-text-weaker hover:bg-surface-2"
          }`}
          title={sidebarOpen ? "Hide session list" : "Show session list"}
        >
          {sidebarOpen ? (
            <PanelRightClose className="w-3.5 h-3.5" />
          ) : (
            <Clock className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Session Sidebar (toggleable) ───────────────────────────────

function SessionSidebar({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const {
    getProjectSessions,
    activeSessionId,
    setActiveSession,
    deleteSession,
    startNewChat,
    renameSession,
  } = useSessionStore()

  const [search, setSearch] = useState("")
  const sessions = getProjectSessions(projectId)
  const filtered = search.trim()
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()),
      )
    : sessions

  return (
    <div className="w-56 shrink-0 border-l border-border-weak bg-surface-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-weak shrink-0">
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
            title="Close"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-1 border border-border-weak">
          <Search className="w-3 h-3 text-text-weaker shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="flex-1 bg-transparent text-[11px] text-text-strong font-sans outline-none placeholder-text-weaker"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-0.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="w-5 h-5 text-text-weaker mx-auto mb-2" />
            <p className="text-[11px] text-text-weaker font-sans">
              {search ? "No matches" : "No sessions yet"}
            </p>
          </div>
        ) : (
          filtered.map((session) => (
            <SidebarSessionRow
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => setActiveSession(session.id)}
              onDelete={() => deleteSession(session.id)}
              onRename={(name) => renameSession(session.id, name)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SidebarSessionRow({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  session: Session
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const timeAgo = formatTimeAgo(session.updatedAt)

  const startEditing = () => {
    setEditName(session.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editName.trim() && editName.trim() !== session.title) {
      onRename(editName.trim())
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
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer group transition-colors ${
        isActive
          ? "bg-accent/8 text-text-strong"
          : "hover:bg-surface-1 text-text-weak"
      }`}
    >
      <MessageSquare
        className={`w-3 h-3 shrink-0 ${isActive ? "text-accent" : "text-text-weaker"}`}
      />
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
            className="w-full bg-transparent border-b border-accent text-[11px] text-text-strong font-sans outline-none"
            autoFocus
          />
        ) : (
          <div className="text-[11px] truncate font-sans">{session.title}</div>
        )}
      </div>
      <span className="text-[9px] text-text-weaker font-sans shrink-0">
        {timeAgo}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-3 transition-all shrink-0"
      >
        <Trash2 className="w-2.5 h-2.5 text-text-weaker hover:text-status-error" />
      </button>
    </div>
  )
}

// ─── Past Chats (bottom of chat, collapsed by default) ──────────

function PastChats({ projectId }: { projectId: string }) {
  const { getProjectSessions, activeSessionId, setActiveSession } =
    useSessionStore()
  const [expanded, setExpanded] = useState(false)

  const sessions = getProjectSessions(projectId)
  const pastSessions = sessions
    .filter((s) => s.id !== activeSessionId)
    .slice(0, expanded ? 20 : 3)

  if (sessions.length <= 1) return null

  return (
    <div className="shrink-0 border-t border-border-weak bg-surface-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 group"
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown
            className={`w-3 h-3 text-text-weaker transition-transform ${
              expanded ? "" : "-rotate-90"
            }`}
          />
          <span className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wide">
            Past Chats
          </span>
        </div>
        <span className="text-[10px] text-text-weaker font-sans">
          {sessions.length - 1}
        </span>
      </button>
      {expanded && (
        <div className="max-h-40 overflow-y-auto pb-1">
          {pastSessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className="w-full flex items-center justify-between px-4 py-1 text-left hover:bg-surface-1 transition-colors"
            >
              <span className="text-[11px] text-text-weak font-sans truncate flex-1 min-w-0 mr-2">
                {s.title}
              </span>
              <span className="text-[9px] text-text-weaker font-sans shrink-0">
                {formatTimeAgo(s.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ChatSidePanel ─────────────────────────────────────────

interface ChatSidePanelProps {
  projectId: string
  project: Project
  width: number
  side: "left" | "right"
  onClose: () => void
  onResize: (width: number) => void
  sessionSidebarOpen: boolean
  onToggleSessionSidebar: () => void
}

export function ChatSidePanel({
  projectId,
  project,
  width,
  side,
  onClose,
  onResize,
  sessionSidebarOpen,
  onToggleSessionSidebar,
}: ChatSidePanelProps) {
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
        onResize(Math.max(320, Math.min(startW + delta, 800)))
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

  const totalWidth = sessionSidebarOpen ? width + 224 : width
  const borderClass = side === "right" ? "border-l" : "border-r"

  return (
    <div className="flex shrink-0" style={{ width: totalWidth }}>
      {/* Resize handle on center-facing edge */}
      {side === "right" && (
        <div
          className={`w-[3px] shrink-0 cursor-col-resize transition-colors ${
            dragging ? "bg-accent/40" : "bg-border-weak hover:bg-accent/20"
          }`}
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Chat panel */}
      <div
        className={`flex-1 min-w-0 ${borderClass} border-border-weak flex flex-col`}
        style={{ width }}
      >
        {/* Session tabs header (hidden when sidebar open) */}
        {!sessionSidebarOpen && (
          <SessionTabBar
            projectId={projectId}
            onToggleSidebar={onToggleSessionSidebar}
            sidebarOpen={sessionSidebarOpen}
          />
        )}

        {/* Chat header with close */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-weak bg-surface-1 shrink-0">
          <span className="text-xs text-text-strong font-sans font-medium">
            Chat
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="Close panel"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>

        {/* Chat content */}
        <div className="flex-1 overflow-hidden">
          <ChatPanel projectId={projectId} />
        </div>

        {/* Past chats (only when session sidebar is closed) */}
        {!sessionSidebarOpen && (
          <PastChats projectId={projectId} />
        )}
      </div>

      {/* Session sidebar (togglable, right of chat) */}
      {sessionSidebarOpen && (
        <SessionSidebar
          projectId={projectId}
          onClose={onToggleSessionSidebar}
        />
      )}

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
