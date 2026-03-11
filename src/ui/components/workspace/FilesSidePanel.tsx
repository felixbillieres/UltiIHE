import { useState, useCallback } from "react"
import { FileTree } from "../layout/FileTree"
import { FolderTree, X } from "lucide-react"

interface FilesSidePanelProps {
  width: number
  side: "left" | "right"
  onClose: () => void
  onResize: (width: number) => void
}

export function FilesSidePanel({
  width,
  side,
  onClose,
  onResize,
}: FilesSidePanelProps) {
  const [dragging, setDragging] = useState(false)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      const startX = e.clientX
      const startW = width
      const factor = side === "left" ? 1 : -1

      function onMove(ev: MouseEvent) {
        const delta = (ev.clientX - startX) * factor
        onResize(Math.max(180, Math.min(startW + delta, 500)))
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

  const borderClass = side === "left" ? "border-r" : "border-l"

  return (
    <div className="flex shrink-0" style={{ width }}>
      {/* Resize handle for right side */}
      {side === "right" && (
        <div
          className={`w-[3px] shrink-0 cursor-col-resize transition-colors ${
            dragging ? "bg-accent/40" : "bg-border-weak hover:bg-accent/20"
          }`}
          onMouseDown={handleResizeStart}
        />
      )}

      <div
        className={`flex-1 min-w-0 ${borderClass} border-border-weak bg-surface-0 flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-weak shrink-0">
          <div className="flex items-center gap-1.5">
            <FolderTree className="w-3.5 h-3.5 text-text-weaker" />
            <span className="text-xs text-text-strong font-sans font-medium">
              Files
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="Close files"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-hidden">
          <FileTree />
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
