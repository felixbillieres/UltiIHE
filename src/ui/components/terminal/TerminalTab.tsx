import { Terminal, X } from "lucide-react"
import type { TerminalInstance } from "../../stores/terminal"
import { ContainerBadge } from "./terminalConstants"

// 8-color palette for terminal tab color tags
const TAB_COLORS = [
  "#4fa6ed", // blue
  "#8ebd6b", // green
  "#d18f52", // orange
  "#bf68d9", // purple
  "#48b0bd", // cyan
  "#e55561", // red
  "#facc15", // yellow
  "#f472b6", // pink
]

interface TerminalTabProps {
  terminal: TerminalInstance
  isActive: boolean
  isEditing: boolean
  editName: string
  containerIds: string[]
  onSelect: () => void
  onClose: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onEditChange: (val: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  editInputRef: React.RefObject<HTMLInputElement>
  // Drag & drop
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  isDragging?: boolean
  dropIndicator?: "before" | "after" | null
  colorIndex?: number
}

export function TerminalTab({
  terminal,
  isActive,
  isEditing,
  editName,
  containerIds,
  onSelect,
  onClose,
  onDoubleClick,
  onContextMenu,
  onEditChange,
  onEditCommit,
  onEditCancel,
  editInputRef,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  dropIndicator,
  colorIndex = 0,
}: TerminalTabProps) {
  const tagColor = TAB_COLORS[colorIndex % TAB_COLORS.length]
  return (
    <div
      className="relative flex items-center shrink-0 -mb-px"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drop indicator — before */}
      {dropIndicator === "before" && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent z-20 -translate-x-px" />
      )}

      <div
        draggable={!isEditing}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors group shrink-0 ${
          isActive
            ? "bg-surface-0 text-text-strong border-b-2 border-b-accent z-10"
            : "text-text-weak hover:bg-surface-2/50 border-b border-b-transparent"
        } ${isDragging ? "opacity-50" : ""}`}
      >
        {/* Color tag — 2px bar at top */}
        <div
          className="absolute top-0 left-2 right-2 h-[2px] rounded-b-full"
          style={{ backgroundColor: tagColor, opacity: isActive ? 1 : 0.5 }}
        />
        {/* Vertical separator — only on inactive tabs */}
        {!isActive && (
          <div className="absolute right-0 top-[6px] bottom-[6px] w-px bg-border-weak" />
        )}

        <Terminal className="w-3 h-3 shrink-0" />

        {terminal.hasNotification && !isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
        )}

        {isEditing ? (
          <input
            ref={editInputRef}
            value={editName}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditCommit()
              if (e.key === "Escape") onEditCancel()
            }}
            className="bg-transparent border-b border-accent text-xs text-text-strong outline-none w-20"
            autoFocus
          />
        ) : (
          <>
            <span className="truncate max-w-[100px]">{terminal.name}</span>
            {containerIds.length > 1 && (
              <ContainerBadge container={terminal.container} />
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Drop indicator — after */}
      {dropIndicator === "after" && (
        <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-accent z-20 translate-x-px" />
      )}
    </div>
  )
}
