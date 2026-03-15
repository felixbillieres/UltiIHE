import { useContextStore } from "../../stores/context"

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function TokenBar() {
  const info = useContextStore((s) => s.info)
  if (!info?.total || !info?.limit) return null

  const pct = Math.round((info.total / info.limit) * 100)
  const clampedPct = Math.min(pct, 100)
  const color =
    pct < 60
      ? "bg-status-success"
      : pct < 85
        ? "bg-status-warning"
        : "bg-status-error"

  return (
    <div className="shrink-0 flex items-center gap-2 h-6 px-3 bg-surface-0 border-b border-border-weak">
      {/* Progress bar */}
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      {/* Label */}
      <span className="text-[10px] font-sans text-text-weaker tabular-nums whitespace-nowrap">
        {pct}% · {formatTokens(info.total)}/{formatTokens(info.limit)} tokens
      </span>
      {/* Warning text */}
      {pct > 80 && (
        <span
          className={`text-[10px] font-sans font-medium whitespace-nowrap ${
            pct >= 85 ? "text-status-error" : "text-status-warning"
          }`}
        >
          Context filling up
        </span>
      )}
    </div>
  )
}
