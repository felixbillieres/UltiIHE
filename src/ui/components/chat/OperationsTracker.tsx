import { useEffect, useMemo } from "react"
import { useOpsStore, type Operation } from "../../stores/operations"
import { useWebSocket } from "../../hooks/useWebSocket"
import { useTerminalStore } from "../../stores/terminal"
import {
  ChevronDown,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  return `${m}m${rs > 0 ? `${rs}s` : ""}`
}

function OpStatusIcon({ status }: { status: Operation["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3 h-3 text-accent animate-spin" />
    case "done":
      return <CheckCircle2 className="w-3 h-3 text-status-success" />
    case "error":
      return <XCircle className="w-3 h-3 text-status-error" />
    case "cancelled":
      return <XCircle className="w-3 h-3 text-text-weaker" />
  }
}

function OpRow({ op, onShow, onStop }: { op: Operation; onShow: () => void; onStop: () => void }) {
  const elapsed = op.endTime
    ? formatDuration(op.endTime - op.startTime)
    : formatDuration(Date.now() - op.startTime)

  // Truncate command for display
  const cmd = op.command.replace(/\n$/, "").slice(0, 60) + (op.command.length > 60 ? "..." : "")

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-2/50 transition-colors rounded">
      <OpStatusIcon status={op.status} />
      <span className="flex-1 text-[11px] font-mono text-text-base truncate" title={op.command}>
        {cmd}
      </span>
      <span className="text-[10px] text-text-weaker font-mono tabular-nums shrink-0">
        {op.terminalName}
      </span>
      <span className="text-[10px] text-text-weaker font-mono tabular-nums shrink-0 w-10 text-right">
        {elapsed}
      </span>
      {op.status === "running" && (
        <button
          onClick={(e) => { e.stopPropagation(); onStop() }}
          className="p-0.5 rounded hover:bg-status-error/20 text-text-weaker hover:text-status-error transition-colors shrink-0"
          title="Stop this operation"
        >
          <Square className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={onShow}
        className="p-0.5 rounded hover:bg-surface-3 text-text-weaker hover:text-text-base transition-colors shrink-0"
        title="Focus terminal"
      >
        <ExternalLink className="w-3 h-3" />
      </button>
    </div>
  )
}

export function OperationsTracker() {
  const operations = useOpsStore((s) => s.operations)
  const expanded = useOpsStore((s) => s.expanded)
  const setExpanded = useOpsStore((s) => s.setExpanded)
  const upsertOp = useOpsStore((s) => s.upsertOp)
  const clearAll = useOpsStore((s) => s.clearAll)
  const clearCompleted = useOpsStore((s) => s.clearCompleted)
  const { subscribe, send } = useWebSocket()

  // Listen for ops events from WS
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "ops:update" && msg.data?.op) {
        upsertOp(msg.data.op as Operation)
      }
      if (msg.type === "ops:clear-running" && msg.data?.ops) {
        clearAll(msg.data.ops as Operation[])
      }
      if (msg.type === "ops:stopped") {
        const count = (msg.data?.count as number) || 0
        toast.success(`Stopped ${count} running operation${count !== 1 ? "s" : ""}`)
      }
    })
  }, [subscribe, upsertOp, clearAll])

  // Auto-clear completed ops after 30s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const store = useOpsStore.getState()
      const hasStale = store.operations.some(
        (o) => o.status !== "running" && o.endTime && now - o.endTime > 30_000,
      )
      if (hasStale) clearCompleted()
    }, 5000)
    return () => clearInterval(interval)
  }, [clearCompleted])

  // Force re-render every second for running timers
  useEffect(() => {
    const hasRunning = operations.some((o) => o.status === "running")
    if (!hasRunning) return
    const interval = setInterval(() => {
      useOpsStore.setState((s) => ({ ...s })) // force re-render
    }, 1000)
    return () => clearInterval(interval)
  }, [operations])

  const running = useMemo(() => operations.filter((o) => o.status === "running"), [operations])
  const done = useMemo(() => operations.filter((o) => o.status !== "running"), [operations])

  // Focus a terminal by its ID — update store state + DOM focus
  function focusTerminal(terminalId: string) {
    const store = useTerminalStore.getState()
    const group = store.groups.find((g) => g.terminalIds.includes(terminalId))
    if (group) {
      store.setActiveInGroup(group.id, terminalId)
      store.focusGroup(group.id)
    }
    // After React re-renders with the new active terminal, focus the xterm element
    requestAnimationFrame(() => {
      const textarea = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement
      textarea?.focus()
    })
  }

  function handleStopOne(opId: string) {
    send({ type: "ops:stop-one", data: { opId } })
  }

  function handleStopAll() {
    send({ type: "ops:stop-all", data: {} })
  }

  if (operations.length === 0) return null

  return (
    <div className="border-t border-border-weak bg-surface-0/80">
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-1 transition-colors cursor-pointer"
      >
        <Zap className="w-3 h-3 text-accent shrink-0" />
        <span className="text-[11px] font-sans text-text-base font-medium">
          {running.length > 0
            ? `${running.length} running`
            : "Operations"
          }
          {done.length > 0 && (
            <span className="text-text-weaker font-normal ml-1">
              · {done.length} done
            </span>
          )}
        </span>
        <div className="flex-1" />
        {running.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); handleStopAll() }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-status-error/10 hover:bg-status-error/20 text-status-error text-[10px] font-sans transition-colors"
          >
            <Square className="w-2.5 h-2.5" />
            Stop All
          </button>
        )}
        <ChevronDown
          className={`w-3 h-3 text-text-weaker transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="px-1 pb-1.5 max-h-[200px] overflow-y-auto scrollbar-thin">
          {operations.map((op) => (
            <OpRow key={op.id} op={op} onShow={() => focusTerminal(op.terminalId)} onStop={() => handleStopOne(op.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
