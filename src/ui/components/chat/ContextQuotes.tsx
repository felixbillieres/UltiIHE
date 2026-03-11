import { useState } from "react"
import { type TerminalQuote } from "../../stores/chatContext"
import { ChevronDown, Terminal, X } from "lucide-react"

export function ContextQuotes({
  quotes,
  onRemove,
  onClear,
}: {
  quotes: TerminalQuote[]
  onRemove: (id: string) => void
  onClear: () => void
}) {
  return (
    <div className="px-3 pt-2 space-y-1.5">
      {quotes.map((q) => (
        <ContextQuoteItem key={q.id} quote={q} onRemove={onRemove} />
      ))}
      {quotes.length > 1 && (
        <button
          onClick={onClear}
          className="text-[10px] text-text-weaker hover:text-status-error transition-colors font-sans px-1"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

function ContextQuoteItem({
  quote: q,
  onRemove,
}: {
  quote: TerminalQuote
  onRemove: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border-weak bg-surface-1 overflow-hidden">
      {/* Header — always visible, clickable to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-surface-2 transition-colors group"
      >
        <ChevronDown
          className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${
            expanded ? "" : "-rotate-90"
          }`}
        />
        <Terminal className="w-3 h-3 text-cyan-400 shrink-0" />
        <span className="text-[11px] text-text-weak font-sans truncate">
          {q.terminalName}
        </span>
        <span className="text-[10px] text-text-weaker font-sans shrink-0">
          {q.lineCount === 1 ? "1 line" : `${q.lineCount} lines`}
        </span>
        {q.comment && (
          <span className="text-[10px] text-accent font-sans truncate ml-auto mr-1">
            "{q.comment}"
          </span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRemove(q.id)
          }}
          className="p-0.5 rounded hover:bg-surface-3 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          <X className="w-2.5 h-2.5 text-text-weaker" />
        </span>
      </button>

      {/* Expandable snippet */}
      {expanded && (
        <div className="border-t border-border-weak">
          {q.comment && (
            <div className="px-2.5 py-1.5 text-[11px] text-accent font-sans bg-accent/5 border-b border-border-weak">
              {q.comment}
            </div>
          )}
          <pre className="px-2.5 py-2 text-[11px] font-mono text-text-base overflow-x-auto max-h-[160px] overflow-y-auto scrollbar-none leading-relaxed">
            {q.text}
          </pre>
        </div>
      )}
    </div>
  )
}
