import { useState, useCallback } from "react"
import { FileTree } from "../layout/FileTree"
import { X, Box, ChevronRight, Settings } from "lucide-react"
import { useContainerStore } from "../../stores/container"

interface FilesSidePanelProps {
  width: number
  side: "left" | "right"
  onClose: () => void
  onResize: (width: number) => void
  containerIds?: string[]
  onOpenContainers?: () => void
}

// ─── Collapsible Section (VS Code style) ──────────────────────

function SidebarSection({
  title,
  icon,
  defaultCollapsed = true,
  badge,
  actions,
  children,
}: {
  title: string
  icon?: React.ReactNode
  defaultCollapsed?: boolean
  badge?: number
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="border-t border-border-weak">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1 px-2 py-1 hover:bg-surface-1 transition-colors group"
      >
        <ChevronRight
          className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${
            collapsed ? "" : "rotate-90"
          }`}
        />
        {icon}
        <span className="text-[11px] text-text-strong font-sans font-semibold uppercase tracking-wider flex-1 text-left">
          {title}
        </span>
        {badge !== undefined && badge > 0 && (
          <span className="text-[9px] text-text-weaker font-sans bg-surface-2 rounded px-1 py-px">
            {badge}
          </span>
        )}
        {actions && (
          <span
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </span>
        )}
      </button>
      {!collapsed && children}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export function FilesSidePanel({
  width,
  side,
  onClose,
  onResize,
  containerIds,
  onOpenContainers,
}: FilesSidePanelProps) {
  const [dragging, setDragging] = useState(false)
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

  const projectContainers = containerIds
    ? containers.filter((c) => containerIds.includes(c.name))
    : containers

  return (
    <div className="flex shrink-0" style={{ width }}>
      {side === "right" && (
        <div
          className={`w-[3px] shrink-0 cursor-col-resize transition-colors ${
            dragging ? "bg-accent/40" : "bg-border-weak hover:bg-accent/20"
          }`}
          onMouseDown={handleResizeStart}
        />
      )}

      <div className={`flex-1 min-w-0 ${borderClass} border-border-weak bg-surface-0 flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1 border-b border-border-weak shrink-0">
          <span className="text-[11px] text-text-strong font-sans font-semibold uppercase tracking-wider">
            Explorer
          </span>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-surface-2 transition-colors"
            title="Close panel"
          >
            <X className="w-3 h-3 text-text-weaker" />
          </button>
        </div>

        {/* File tree — takes remaining space */}
        <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
          <FileTree />
        </div>

        {/* Containers section — collapsible, bottom */}
        <SidebarSection
          title="Containers"
          icon={<Box className="w-3 h-3 text-text-weaker shrink-0" />}
          defaultCollapsed={false}
          badge={projectContainers.length}
          actions={
            onOpenContainers ? (
              <button
                onClick={onOpenContainers}
                className="p-0.5 rounded hover:bg-surface-2 transition-colors"
                title="Manage containers"
              >
                <Settings className="w-3 h-3 text-text-weaker" />
              </button>
            ) : undefined
          }
        >
          <div className="max-h-44 overflow-y-auto scrollbar-thin">
            {projectContainers.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-text-weaker font-sans">
                  No containers linked
                </p>
              </div>
            ) : (
              <div className="py-0.5">
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
                      className="flex items-center gap-2 px-4 py-1 hover:bg-surface-1 transition-colors"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}
                        title={c.state}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-text-base font-sans truncate">
                          {c.name}
                        </div>
                      </div>
                      <span className="text-[9px] text-text-weaker font-sans shrink-0">
                        {c.image?.split(":")[0]?.split("/").pop() || ""}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SidebarSection>
      </div>

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
