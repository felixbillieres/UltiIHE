import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { type Project } from "../../stores/project"
import { useContainerStore } from "../../stores/container"
import { useSettingsStore } from "../../stores/settings"
import { useFileStore } from "../../stores/files"
import { useWebSocket } from "../../hooks/useWebSocket"
import { Sidebar } from "../layout/Sidebar"
import { ChatPanel } from "../chat/ChatPanel"
import { TerminalArea } from "../terminal/TerminalArea"
import { FileEditor } from "../files/FileEditor"
import { SettingsDialog } from "../settings/SettingsDialog"
import {
  Shield,
  Settings,
  ArrowLeft,
  Bot,
  ChevronDown,
} from "lucide-react"

interface Props {
  project: Project
}

export function WorkspaceLayout({ project }: Props) {
  const navigate = useNavigate()
  const container = useContainerStore((s) => s.getActiveContainer())
  const { activeProvider, activeModel } = useSettingsStore()
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarWidth] = useState(280)
  const [chatWidth] = useState(420)

  // Establish WebSocket when a container is selected
  const { send, connected, subscribe } = useWebSocket({
    enabled: !!container,
  })

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-weak bg-surface-1 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              useContainerStore.getState().setActiveContainer(null)
              navigate("/")
            }}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-text-weak" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" />
            <span className="text-sm text-text-strong font-sans font-medium">{project.name}</span>
          </div>
          {container && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-status-success/10 text-status-success font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
              {container.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Model selector */}
          <button className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-weak hover:text-text-base rounded-lg hover:bg-surface-2 transition-colors font-sans">
            <Bot className="w-3.5 h-3.5" />
            <span className="font-mono text-[11px]">{activeModel}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors"
          >
            <Settings className="w-4 h-4 text-text-weak" />
          </button>
        </div>
      </div>

      {/* Main layout: sidebar | terminals | chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className="shrink-0 border-r border-border-weak"
          style={{ width: sidebarWidth }}
        >
          <Sidebar projectId={project.id} />
        </div>

        {/* Terminal + Editor area (center) */}
        <CenterArea send={send} subscribe={subscribe} connected={connected} />

        {/* Chat panel */}
        <div
          className="shrink-0 border-l border-border-weak"
          style={{ width: chatWidth }}
        >
          <ChatPanel projectId={project.id} />
        </div>
      </div>

      {/* Settings dialog */}
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

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
        <TerminalArea send={send} subscribe={subscribe} connected={connected} />
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* File editor */}
      <div className="shrink-0" style={{ height: editorHeight }}>
        <FileEditor />
      </div>

      {/* Resize handle */}
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

      {/* Terminal area */}
      <div className="flex-1 min-h-0">
        <TerminalArea send={send} subscribe={subscribe} connected={connected} />
      </div>
    </div>
  )
}
