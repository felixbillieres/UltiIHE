import { useState, useEffect } from "react"
import { useContainerStore } from "../../stores/container"
import { useSessionStore, type Session } from "../../stores/session"
import {
  FolderTree,
  MessageSquare,
  Plus,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  Loader2,
  Trash2,
} from "lucide-react"

type Tab = "files" | "sessions"

interface Props {
  projectId: string
}

export function Sidebar({ projectId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("sessions")

  return (
    <div className="h-full flex flex-col bg-surface-0">
      {/* Tab bar */}
      <div className="flex border-b border-border-weak shrink-0">
        <TabButton
          active={activeTab === "sessions"}
          onClick={() => setActiveTab("sessions")}
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          label="Sessions"
        />
        <TabButton
          active={activeTab === "files"}
          onClick={() => setActiveTab("files")}
          icon={<FolderTree className="w-3.5 h-3.5" />}
          label="Files"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "sessions" && <SessionList projectId={projectId} />}
        {activeTab === "files" && <FileTree />}
      </div>
    </div>
  )
}

function TabButton({
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
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-sans font-medium transition-colors ${
        active
          ? "text-text-strong border-b-2 border-accent"
          : "text-text-weaker hover:text-text-weak"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function SessionList({ projectId }: { projectId: string }) {
  const { getProjectSessions, createSession, deleteSession, activeSessionId, setActiveSession } =
    useSessionStore()
  const sessions = getProjectSessions(projectId)

  function handleNew() {
    const session = createSession(projectId)
    setActiveSession(session.id)
  }

  return (
    <div className="p-2">
      <button
        onClick={handleNew}
        className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-xs text-text-weak hover:text-text-base rounded-lg hover:bg-surface-2 transition-colors border border-dashed border-border-weak hover:border-border-base"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="font-sans">New session</span>
      </button>

      {sessions.length === 0 && (
        <p className="text-xs text-text-weaker text-center py-8">
          No sessions yet
        </p>
      )}

      <div className="space-y-0.5">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
              activeSessionId === session.id
                ? "bg-accent/10 text-accent"
                : "text-text-weak hover:bg-surface-2 hover:text-text-base"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs truncate flex-1 font-sans">{session.title}</span>
            <span className="text-[10px] text-text-weaker">
              {session.messageCount}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteSession(session.id)
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-3 transition-all"
            >
              <Trash2 className="w-3 h-3 text-text-weaker hover:text-status-error" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

interface FileEntry {
  name: string
  path: string
  type: "file" | "dir"
  size: number
  modified: number
}

function FileTree() {
  const container = useContainerStore((s) => s.getActiveContainer())
  const [entries, setEntries] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())

  const roots = ["/workspace", "/opt/tools", "/root", "/etc", "/tmp"]

  async function loadDir(path: string) {
    if (!container) return
    setLoading((s) => new Set(s).add(path))
    try {
      const res = await fetch(
        `/api/files/${container.name}/list?path=${encodeURIComponent(path)}`,
      )
      const data = await res.json()
      setEntries((prev) => ({ ...prev, [path]: data.entries || [] }))
    } catch {
      // ignore
    }
    setLoading((s) => {
      const next = new Set(s)
      next.delete(path)
      return next
    })
  }

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        if (!entries[path]) loadDir(path)
      }
      return next
    })
  }

  if (!container) {
    return (
      <div className="p-4 text-xs text-text-weaker text-center">
        No container selected
      </div>
    )
  }

  return (
    <div className="p-2 text-xs">
      <div className="px-2 py-1.5 text-text-weaker uppercase tracking-wider text-[10px] mb-1">
        {container.name}
      </div>
      {roots.map((root) => (
        <DirNode
          key={root}
          path={root}
          name={root}
          entries={entries}
          expanded={expanded}
          loading={loading}
          toggleDir={toggleDir}
          loadDir={loadDir}
          depth={0}
        />
      ))}
    </div>
  )
}

function DirNode({
  path,
  name,
  entries,
  expanded,
  loading,
  toggleDir,
  loadDir,
  depth,
}: {
  path: string
  name: string
  entries: Record<string, FileEntry[]>
  expanded: Set<string>
  loading: Set<string>
  toggleDir: (path: string) => void
  loadDir: (path: string) => void
  depth: number
}) {
  const isExpanded = expanded.has(path)
  const isLoading = loading.has(path)
  const children = entries[path] || []

  return (
    <div>
      <div
        onClick={() => toggleDir(path)}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-2 cursor-pointer text-text-weak hover:text-text-base transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        ) : isExpanded ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        <Folder className="w-3.5 h-3.5 text-text-weak shrink-0" />
        <span className="truncate font-sans">{name}</span>
      </div>
      {isExpanded && (
        <div>
          {children.map((entry) =>
            entry.type === "dir" ? (
              <DirNode
                key={entry.path}
                path={entry.path}
                name={entry.name}
                entries={entries}
                expanded={expanded}
                loading={loading}
                toggleDir={toggleDir}
                loadDir={loadDir}
                depth={depth + 1}
              />
            ) : (
              <div
                key={entry.path}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-2 cursor-pointer text-text-weak hover:text-text-base transition-colors"
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              >
                <File className="w-3.5 h-3.5 text-text-weaker shrink-0" />
                <span className="truncate font-sans">{entry.name}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
