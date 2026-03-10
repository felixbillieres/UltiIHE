import { terminalManager } from "./manager"

export interface PendingCommand {
  id: string
  terminalId: string
  terminalName: string
  command: string
  createdAt: number
}

interface QueueEntry extends PendingCommand {
  resolve: (result: { approved: boolean }) => void
}

export type CommandApprovalMode = "ask" | "auto-run" | "allow-all-session"

type BroadcastFn = (msg: object) => void

class CommandQueue {
  private pending = new Map<string, QueueEntry>()
  private mode: CommandApprovalMode = "ask"
  private broadcast: BroadcastFn | null = null

  /** Set the broadcast function (called once from ws.ts) */
  setBroadcast(fn: BroadcastFn) {
    this.broadcast = fn
  }

  setMode(mode: CommandApprovalMode) {
    this.mode = mode
  }

  getMode(): CommandApprovalMode {
    return this.mode
  }

  /**
   * Enqueue a command for approval. Returns a promise that resolves
   * when the user approves or rejects.
   *
   * In auto-run or allow-all-session mode, executes immediately.
   */
  async enqueue(opts: {
    terminalId: string
    terminalName: string
    command: string
  }): Promise<{ approved: boolean }> {
    const id = crypto.randomUUID()

    // Auto-run: execute immediately with typing effect
    if (this.mode === "auto-run" || this.mode === "allow-all-session") {
      await terminalManager.writeTyping(opts.terminalId, opts.command)
      // Notify frontend that a command was auto-executed
      this.broadcast?.({
        type: "command:executed",
        data: {
          id,
          terminalId: opts.terminalId,
          terminalName: opts.terminalName,
          command: opts.command,
          auto: true,
        },
      })
      return { approved: true }
    }

    // Ask mode: send to frontend, wait for approval
    return new Promise<{ approved: boolean }>((resolve) => {
      const entry: QueueEntry = {
        id,
        terminalId: opts.terminalId,
        terminalName: opts.terminalName,
        command: opts.command,
        createdAt: Date.now(),
        resolve,
      }
      this.pending.set(id, entry)

      // Broadcast to frontend
      this.broadcast?.({
        type: "command:pending",
        data: {
          id,
          terminalId: opts.terminalId,
          terminalName: opts.terminalName,
          command: opts.command,
        },
      })

      // Timeout after 2 minutes — auto-reject
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve({ approved: false })
        }
      }, 120_000)
    })
  }

  /**
   * Approve a pending command. Injects with typing effect.
   * @param allowAll - if true, switch to allow-all-session mode
   */
  async approve(commandId: string, allowAll = false): Promise<void> {
    const entry = this.pending.get(commandId)
    if (!entry) return

    this.pending.delete(entry.id)

    if (allowAll) {
      this.mode = "allow-all-session"
    }

    // Inject with typing effect
    await terminalManager.writeTyping(entry.terminalId, entry.command)
    entry.resolve({ approved: true })
  }

  /** Reject a pending command */
  reject(commandId: string): void {
    const entry = this.pending.get(commandId)
    if (!entry) return

    this.pending.delete(entry.id)
    entry.resolve({ approved: false })
  }

  /** Edit and approve — replace command text then execute */
  async approveEdited(commandId: string, newCommand: string): Promise<void> {
    const entry = this.pending.get(commandId)
    if (!entry) return

    this.pending.delete(entry.id)
    await terminalManager.writeTyping(entry.terminalId, newCommand)
    entry.resolve({ approved: true })
  }

  /** Get all pending commands (for UI reconnect) */
  listPending(): PendingCommand[] {
    return [...this.pending.values()].map(({ resolve: _, ...rest }) => rest)
  }
}

export const commandQueue = new CommandQueue()
