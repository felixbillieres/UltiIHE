import { useState, useRef, useEffect, useMemo } from "react"
import { ChatPanel } from "./ChatPanel"
import { useProjectStore } from "../../stores/project"
import { useSessionStore, type Session } from "../../stores/session"
import {
  ExternalLink,
  Plus,
  Search,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Shield,
} from "lucide-react"

// ─── Greeting helper ────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return "Night owl"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

// ─── Session Sidebar ────────────────────────────────────────

function PopOutSidebar({
  projectId,
  collapsed,
  onToggle,
}: {
  projectId: string
  collapsed: boolean
  onToggle: () => void
}) {
  const allSessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionIdByProject[projectId] ?? null)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const startNewChat = useSessionStore((s) => s.startNewChat)

  const [search, setSearch] = useState("")
  const sessions = useMemo(
    () => allSessions.filter((s) => s.projectId === projectId),
    [allSessions, projectId],
  )
  const filtered = useMemo(
    () =>
      search.trim()
        ? sessions.filter((s) =>
            s.title.toLowerCase().includes(search.toLowerCase()),
          )
        : sessions,
    [sessions, search],
  )

  if (collapsed) return null

  return (
    <div className="w-60 shrink-0 border-r border-border-weak bg-surface-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <img
            src="/exegol-symbol-white.svg"
            alt=""
            className="w-5 h-5 opacity-80"
          />
          <span className="text-[13px] text-text-strong font-sans font-semibold tracking-tight">
            Exegol IHE
          </span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-surface-2 transition-colors"
          title="Close sidebar"
        >
          <PanelLeftClose className="w-4 h-4 text-text-weaker" />
        </button>
      </div>

      {/* New chat */}
      <div className="px-2.5 pb-2 shrink-0">
        <button
          onClick={() => startNewChat(projectId)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-2 text-text-weak hover:text-text-base text-xs font-sans transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New session
        </button>
      </div>

      {/* Search */}
      {sessions.length > 3 && (
        <div className="px-2.5 pb-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-1 border border-border-weak">
            <Search className="w-3 h-3 text-text-weaker shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-[11px] text-text-strong font-sans outline-none placeholder-text-weaker"
            />
          </div>
        </div>
      )}

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-1.5 py-0.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="w-5 h-5 text-text-weaker mx-auto mb-2 opacity-40" />
            <p className="text-[11px] text-text-weaker font-sans">
              {search ? "No matches" : "No sessions yet"}
            </p>
          </div>
        ) : (
          filtered.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => setActiveSession(session.id, projectId)}
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
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer group transition-colors mb-0.5 ${
        isActive
          ? "bg-accent/10 text-text-strong"
          : "hover:bg-surface-1 text-text-weak"
      }`}
    >
      <MessageSquare
        className={`w-3 h-3 shrink-0 ${isActive ? "text-accent" : "text-text-weaker"}`}
      />
      <span className="flex-1 min-w-0 text-[12px] truncate font-sans">
        {session.title}
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

// ─── Empty / Welcome State ──────────────────────────────────

function WelcomeState({
  projectName,
  onNewSession,
}: {
  projectName: string
  onNewSession: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-lg px-8">
        {/* Big Exegol logo */}
        <div className="mb-6 flex justify-center">
          <img
            src="/exegol-symbol-white.svg"
            alt=""
            className="w-16 h-16 opacity-30"
          />
        </div>

        {/* Greeting */}
        <h1 className="text-2xl font-sans font-semibold text-text-strong mb-2 tracking-tight">
          {getGreeting()}
        </h1>
        <p className="text-sm text-text-weak font-sans mb-8">
          {projectName} — ready to hack
        </p>

        {/* Action button */}
        <button
          onClick={onNewSession}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent text-sm font-sans font-medium transition-colors"
        >
          <Shield className="w-4 h-4" />
          Start a session
        </button>
      </div>
    </div>
  )
}

// ─── Main PopOutChatView ────────────────────────────────────

export function PopOutChatView({
  projectId,
  onReattach,
}: {
  projectId: string
  onReattach: () => void
}) {
  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  )
  const allSessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionIdByProject[projectId] ?? null)
  const startNewChat = useSessionStore((s) => s.startNewChat)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const sessions = useMemo(
    () => allSessions.filter((s) => s.projectId === projectId),
    [allSessions, projectId],
  )
  const activeSession = useMemo(
    () => allSessions.find((s) => s.id === activeSessionId),
    [allSessions, activeSessionId],
  )

  const hasNoSessions = sessions.length === 0 && !activeSession

  return (
    <div className="h-screen flex bg-surface-0 text-text-base font-sans">
      {/* Sidebar */}
      <PopOutSidebar
        projectId={projectId}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-weak bg-surface-1 shrink-0">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle (when collapsed) */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1 rounded hover:bg-surface-2 transition-colors"
                title="Open sidebar"
              >
                <PanelLeft className="w-4 h-4 text-text-weaker" />
              </button>
            )}

            {/* Project + session breadcrumb */}
            {project && (
              <span className="text-xs text-text-weak font-sans">
                {project.name}
              </span>
            )}
            {activeSession && (
              <>
                <span className="text-text-weaker text-xs">/</span>
                <span className="text-xs text-text-weaker font-sans truncate max-w-[300px]">
                  {activeSession.title}
                </span>
              </>
            )}
          </div>

          {/* Re-attach */}
          <button
            onClick={onReattach}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-weak hover:text-text-base hover:bg-surface-1 transition-colors font-sans"
            title="Re-attach to main window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Re-attach
          </button>
        </div>

        {/* Content */}
        {hasNoSessions ? (
          <WelcomeState
            projectName={project?.name || "Project"}
            onNewSession={() => startNewChat(projectId)}
          />
        ) : (
          <div className="flex-1 min-h-0 flex justify-center">
            {/* Centered chat with max-width — like Claude */}
            <div className="w-full max-w-3xl flex flex-col min-h-0">
              <ChatPanel projectId={projectId} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
