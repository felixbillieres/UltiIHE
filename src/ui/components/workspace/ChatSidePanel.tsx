import { useState, useCallback } from "react"
import { type Project } from "../../stores/project"
import { ChatPanel } from "../chat/ChatPanel"
import { FileTree } from "../layout/FileTree"
import { Sparkles, FolderTree, X } from "lucide-react"

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

interface ChatSidePanelProps {
  rightTab: "chat" | "files"
  setRightTab: (tab: "chat" | "files") => void
  projectId: string
  project: Project
  width: number
  side: "left" | "right"
  onClose: () => void
  onResize: (width: number) => void
}

export function ChatSidePanel({
  rightTab,
  setRightTab,
  projectId,
  project,
  width,
  side,
  onClose,
  onResize,
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
            <FileTree />
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
