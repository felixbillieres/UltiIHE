import { useState, useRef } from "react"
import { useSessionStore, type Session } from "../../stores/session"
import { formatTimeAgo } from "./layoutPersistence"
import { Plus, MessageSquare, Trash2, X } from "lucide-react"

interface SessionPanelProps {
  projectId: string
  side: "left" | "right"
  onClose: () => void
}

export function SessionPanel({ projectId, side, onClose }: SessionPanelProps) {
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
