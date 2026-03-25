/**
 * Context pills — shows what the AI "sees" (active terminals + open files).
 * Displayed above the chat input for transparency.
 * Shows first 3 terminals inline, overflow as a hoverable "+N" with tooltip list.
 */

import { useState } from "react"
import { Terminal, FileText, Eye } from "lucide-react"
import { useTerminalStore } from "../../stores/terminal"
import { useFileEditorStore } from "../../stores/fileEditor"

const MAX_VISIBLE = 3

export function ContextPills() {
  const terminals = useTerminalStore((s) => s.terminals)
  const openFiles = useFileEditorStore((s) => s.openFiles)
  const [overflowOpen, setOverflowOpen] = useState(false)

  const termCount = terminals.length
  const fileCount = openFiles.length

  if (termCount === 0 && fileCount === 0) return null

  const visible = terminals.slice(0, MAX_VISIBLE)
  const overflow = terminals.slice(MAX_VISIBLE)

  return (
    <div className="flex items-center gap-1 px-3 pt-1 flex-wrap">
      <Eye className="w-3 h-3 text-text-weaker shrink-0" />
      <span className="text-[10px] text-text-weaker font-sans mr-0.5">AI sees:</span>
      {visible.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 text-[10px] font-mono text-text-weak bg-surface-2 rounded px-1.5 py-0.5"
          title={`${t.name} on ${t.container}`}
        >
          <Terminal className="w-2.5 h-2.5" />
          {t.name}
        </span>
      ))}
      {overflow.length > 0 && (
        <div
          className="relative"
          onMouseEnter={() => setOverflowOpen(true)}
          onMouseLeave={() => setOverflowOpen(false)}
        >
          <span className="inline-flex items-center text-[10px] font-mono text-accent bg-accent/10 rounded px-1.5 py-0.5 cursor-default">
            +{overflow.length}
          </span>
          {overflowOpen && (
            <div className="absolute bottom-full left-0 mb-1 z-50 bg-surface-2 border border-border-base rounded-md shadow-lg py-1 min-w-[140px]">
              {overflow.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono text-text-weak"
                >
                  <Terminal className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{t.name}</span>
                  <span className="text-text-weaker ml-auto shrink-0">{t.container}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {fileCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-weak bg-surface-2 rounded px-1.5 py-0.5">
          <FileText className="w-2.5 h-2.5" />
          {fileCount} file{fileCount > 1 ? "s" : ""}
        </span>
      )}
    </div>
  )
}
