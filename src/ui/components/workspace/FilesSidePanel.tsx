import { useState, useCallback } from "react"
import { FileTree } from "../layout/FileTree"
import { FolderTree, X, Box, Settings } from "lucide-react"
import { useContainerStore } from "../../stores/container"

interface FilesSidePanelProps {
  width: number
  side: "left" | "right"
  onClose: () => void
  onResize: (width: number) => void
  containerIds?: string[]
  onOpenContainers?: () => void
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
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium transition-colors border-b-2 ${
        active
          ? "text-text-strong border-accent"
          : "text-text-weaker hover:text-text-weak border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

export function FilesSidePanel({
  width,
  side,
  onClose,
  onResize,
  containerIds,
  onOpenContainers,
}: FilesSidePanelProps) {
  const [dragging, setDragging] = useState(false)
  const [activeTab, setActiveTab] = useState<"files" | "environments">("files")

  const containers = useContainerStore((s) => s.containers)

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

  // Filter containers to those in this project (if containerIds provided)
  const projectContainers = containerIds
    ? containers.filter((c) => containerIds.includes(c.name))
    : containers

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
        {/* Tab bar */}
        <div className="flex items-center border-b border-border-weak shrink-0">
          <TabButton
            active={activeTab === "files"}
            onClick={() => setActiveTab("files")}
            icon={<FolderTree className="w-3.5 h-3.5" />}
            label="Files"
          />
          <TabButton
            active={activeTab === "environments"}
            onClick={() => setActiveTab("environments")}
            icon={<Box className="w-3.5 h-3.5" />}
            label="Environments"
          />
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1 mr-1 rounded hover:bg-surface-2 transition-colors"
            title="Close panel"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "files" ? (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <FileTree />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {projectContainers.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Box className="w-5 h-5 text-text-weaker mx-auto mb-2" />
                <p className="text-[11px] text-text-weaker font-sans">
                  No containers
                </p>
              </div>
            ) : (
              <div className="py-1">
                {projectContainers.map((c) => {
                  const dotColor =
                    c.state === "running"
                      ? "bg-green-500"
                      : c.state === "exited" || c.state === "paused"
                        ? "bg-red-500"
                        : "bg-gray-500"
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-1 transition-colors"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
                        title={c.state}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-text-strong font-sans truncate">
                          {c.name}
                        </div>
                        <div className="text-[10px] text-text-weaker font-sans truncate">
                          {c.image}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {onOpenContainers && (
              <div className="px-3 py-2 border-t border-border-weak">
                <button
                  onClick={onOpenContainers}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-sans text-text-weak hover:text-text-strong bg-surface-1 hover:bg-surface-2 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  Manage containers
                </button>
              </div>
            )}
          </div>
        )}
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
