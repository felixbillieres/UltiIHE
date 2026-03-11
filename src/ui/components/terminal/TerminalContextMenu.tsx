import {
  SplitSquareHorizontal,
  SplitSquareVertical,
  GripVertical,
} from "lucide-react"
import { useTerminalStore, type TerminalGroup } from "../../stores/terminal"

function MenuItem({
  label,
  onClick,
  disabled,
  icon,
  className,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        disabled
          ? "text-text-weaker cursor-not-allowed"
          : className || "text-text-base hover:bg-surface-3"
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {label}
    </button>
  )
}

interface ContextMenuProps {
  x: number
  y: number
  terminalId: string
  otherGroups: TerminalGroup[]
  groupTerminalCount: number
  onSplitRight: () => void
  onSplitDown: () => void
  onMoveToGroup: (groupId: string) => void
  onClose: () => void
  onRename: () => void
}

export function ContextMenu({
  x,
  y,
  terminalId,
  otherGroups,
  groupTerminalCount,
  onSplitRight,
  onSplitDown,
  onMoveToGroup,
  onClose,
  onRename,
}: ContextMenuProps) {
  const canSplit = groupTerminalCount >= 2

  return (
    <div
      className="fixed z-50 min-w-[180px] bg-surface-2 border border-border-weak rounded-lg shadow-xl py-1 text-xs font-sans"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label="Rename" onClick={onRename} />
      <div className="h-px bg-border-weak my-1" />
      <MenuItem
        label="Split Right"
        onClick={onSplitRight}
        disabled={!canSplit}
        icon={<SplitSquareHorizontal className="w-3.5 h-3.5" />}
      />
      <MenuItem
        label="Split Down"
        onClick={onSplitDown}
        disabled={!canSplit}
        icon={<SplitSquareVertical className="w-3.5 h-3.5" />}
      />
      {otherGroups.length > 0 && (
        <>
          <div className="h-px bg-border-weak my-1" />
          <div className="px-3 py-1 text-text-weaker text-[10px] uppercase tracking-wider">
            Move to group
          </div>
          {otherGroups.map((g) => {
            const allTerminals = useTerminalStore.getState().terminals
            const names = g.terminalIds
              .map((id) => allTerminals.find((t) => t.id === id)?.name)
              .filter(Boolean)
              .join(", ")
            return (
              <MenuItem
                key={g.id}
                label={names || "Empty"}
                onClick={() => onMoveToGroup(g.id)}
                icon={<GripVertical className="w-3.5 h-3.5" />}
              />
            )
          })}
        </>
      )}
      <div className="h-px bg-border-weak my-1" />
      <MenuItem
        label="Close"
        onClick={onClose}
        className="text-status-error hover:bg-status-error/10"
      />
    </div>
  )
}
