/**
 * Operations Tracker — tracks AI-initiated command executions.
 * Broadcasts status changes to the frontend.
 */

export interface Operation {
  id: string
  command: string
  terminalId: string
  terminalName: string
  status: "running" | "done" | "error" | "cancelled"
  startTime: number
  endTime?: number
}

type BroadcastFn = (msg: object) => void

class OpsTracker {
  private ops = new Map<string, Operation>()
  /** Maps terminalId -> active operation id */
  private activeByTerminal = new Map<string, string>()
  private broadcast: BroadcastFn | null = null
  private pruneTimer: ReturnType<typeof setInterval> | null = null

  setBroadcast(fn: BroadcastFn) {
    this.broadcast = fn
    // Start auto-pruning every 30s
    if (!this.pruneTimer) {
      this.pruneTimer = setInterval(() => this.prune(), 30_000)
    }
  }

  /** Start tracking a new operation */
  start(opts: { id: string; command: string; terminalId: string; terminalName: string }): Operation {
    const op: Operation = {
      id: opts.id,
      command: opts.command,
      terminalId: opts.terminalId,
      terminalName: opts.terminalName,
      status: "running",
      startTime: Date.now(),
    }
    this.ops.set(op.id, op)
    this.activeByTerminal.set(opts.terminalId, op.id)
    this.broadcast?.({ type: "ops:update", data: { op: { ...op } } })
    return op
  }

  /** Mark the active operation on a terminal as done (called when terminal becomes idle) */
  completeByTerminal(terminalId: string): void {
    const opId = this.activeByTerminal.get(terminalId)
    if (!opId) return
    const op = this.ops.get(opId)
    if (!op || op.status !== "running") return
    op.status = "done"
    op.endTime = Date.now()
    this.activeByTerminal.delete(terminalId)
    this.broadcast?.({ type: "ops:update", data: { op: { ...op } } })
  }

  /** Cancel all running operations */
  cancelAll(): void {
    for (const op of this.ops.values()) {
      if (op.status === "running") {
        op.status = "cancelled"
        op.endTime = Date.now()
      }
    }
    this.activeByTerminal.clear()
    this.broadcast?.({ type: "ops:clear-running", data: { ops: this.getAllSerialized() } })
  }

  /** Get all running operations */
  getRunning(): Operation[] {
    return [...this.ops.values()].filter((o) => o.status === "running")
  }

  /** Get all operations (for reconnect sync) */
  getAllSerialized(): Operation[] {
    return [...this.ops.values()]
  }

  /** Clear completed/cancelled ops older than 30s */
  prune(): void {
    const cutoff = Date.now() - 30_000
    for (const [id, op] of this.ops) {
      if (op.status !== "running" && op.endTime && op.endTime < cutoff) {
        this.ops.delete(id)
      }
    }
  }
}

export const opsTracker = new OpsTracker()
