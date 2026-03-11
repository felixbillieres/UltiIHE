import { useState } from "react"
import { type Project } from "../../stores/project"
import { useFileStore } from "../../stores/files"
import { TerminalArea } from "../terminal/TerminalArea"
import { FileEditor } from "../files/FileEditor"
import { ExegolManager } from "../exegol/ExegolManager"

interface CenterAreaProps {
  send: (data: any) => void
  subscribe: (handler: (data: any) => void) => () => void
  connected: boolean
  project: Project
  showContainerManager: boolean
  onCloseContainerManager: () => void
}

export function CenterArea({
  send,
  subscribe,
  connected,
  project,
  showContainerManager,
  onCloseContainerManager,
}: CenterAreaProps) {
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
