import { terminalManager } from "./manager"
import { opsTracker } from "./ops-tracker"

export interface PendingCommand {
  id: string
  terminalId: string
  terminalName: string
  command: string
  createdAt: number
}

interface QueueEntry extends PendingCommand {
  resolve: (result: { approved: boolean }) => void
  timeoutId: ReturnType<typeof setTimeout>
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
  }): Promise<{ approved: boolean; actualTerminalId?: string }> {
    const id = crypto.randomUUID()

    // ── Pool logic: if target terminal is busy, auto-allocate ──
    let targetId = opts.terminalId
    let targetName = opts.terminalName
    if (terminalManager.isBusy(targetId)) {
      const terminal = terminalManager.getTerminal(targetId)
      if (terminal) {
        const poolTerm = await terminalManager.getOrCreatePoolTerminal(terminal.container)
        if (poolTerm) {
          targetId = poolTerm.id
          targetName = poolTerm.name
        }
        // If pool is full, we'll wait for the terminal to be idle
        // by queuing on the original terminal — it'll execute when prompt returns
      }
    }

    // Auto-run: execute immediately with typing effect
    if (this.mode === "auto-run" || this.mode === "allow-all-session") {
      // NOTE: do NOT call markBusy here — writeTyping sets busy=true AFTER writing
      // the command. Calling markBusy before writeTyping deadlocks: writeTyping
      // starts with waitForIdle() which blocks because busy was just set to true.
      opsTracker.start({ id, command: opts.command, terminalId: targetId, terminalName: targetName })
      await terminalManager.writeTyping(targetId, opts.command)
      // Notify frontend that a command was auto-executed
      this.broadcast?.({
        type: "command:executed",
        data: {
          id,
          terminalId: targetId,
          terminalName: targetName,
          command: opts.command,
          auto: true,
        },
      })
      return { approved: true, actualTerminalId: targetId }
    }

    // Ask mode: send to frontend, wait for approval
    return new Promise<{ approved: boolean }>((resolve) => {
      // Timeout after 2 minutes — auto-reject
      const timeoutId = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve({ approved: false })
        }
      }, 120_000)

      const entry: QueueEntry = {
        id,
        terminalId: opts.terminalId,
        terminalName: opts.terminalName,
        command: opts.command,
        createdAt: Date.now(),
        resolve,
        timeoutId,
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
    clearTimeout(entry.timeoutId)

    if (allowAll) {
      this.mode = "allow-all-session"
    }

    // Track operation (writeTyping handles busy flag internally)
    opsTracker.start({
      id: entry.id,
      command: entry.command,
      terminalId: entry.terminalId,
      terminalName: entry.terminalName,
    })

    // Inject with typing effect
    await terminalManager.writeTyping(entry.terminalId, entry.command)
    entry.resolve({ approved: true })
  }

  /** Reject a pending command */
  reject(commandId: string): void {
    const entry = this.pending.get(commandId)
    if (!entry) return

    this.pending.delete(entry.id)
    clearTimeout(entry.timeoutId)
    entry.resolve({ approved: false })
  }

  /** Edit and approve — replace command text then execute */
  async approveEdited(commandId: string, newCommand: string): Promise<void> {
    const entry = this.pending.get(commandId)
    if (!entry) return

    this.pending.delete(entry.id)
    clearTimeout(entry.timeoutId)
    opsTracker.start({
      id: entry.id,
      command: newCommand,
      terminalId: entry.terminalId,
      terminalName: entry.terminalName,
    })
    await terminalManager.writeTyping(entry.terminalId, newCommand)
    entry.resolve({ approved: true })
  }

  /** Get all pending commands (for UI reconnect) */
  listPending(): PendingCommand[] {
    return [...this.pending.values()].map(({ resolve: _, timeoutId: __, ...rest }) => rest)
  }
}

export const commandQueue = new CommandQueue()
