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
  private paused = false
  private broadcast: BroadcastFn | null = null

  /** Set the broadcast function (called once from ws.ts) */
  setBroadcast(fn: BroadcastFn) {
    this.broadcast = fn
  }

  setMode(mode: CommandApprovalMode) {
    const prev = this.mode
    this.mode = mode

    // When switching to auto-run/allow-all: approve all pending commands
    if ((mode === "auto-run" || mode === "allow-all-session") && prev === "ask") {
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timeoutId)
        entry.resolve({ approved: true })
      }
      this.pending.clear()
      this.broadcast?.({ type: "command:all-cleared" })
    }
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

    // Ensure command has a trailing newline — writeTyping only sends Enter
    // when the input ends with \n. Without this, the command is typed into the
    // terminal but never executed (the user would have to press Enter manually).
    const commandWithNewline = opts.command.endsWith("\n") ? opts.command : opts.command + "\n"

    // Auto-run: execute immediately with typing effect
    if (this.mode === "auto-run" || this.mode === "allow-all-session") {
      // NOTE: do NOT call markBusy here — writeTyping sets busy=true AFTER writing
      // the command. Calling markBusy before writeTyping deadlocks: writeTyping
      // starts with waitForIdle() which blocks because busy was just set to true.
      opsTracker.start({ id, command: opts.command, terminalId: targetId, terminalName: targetName })
      await terminalManager.writeTyping(targetId, commandWithNewline)
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
      const now = Date.now()

      // If paused, don't start a timeout
      const timeoutId = this.paused
        ? setTimeout(() => {}, 0)
        : setTimeout(() => {
            if (this.pending.has(id)) {
              this.pending.delete(id)
              resolve({ approved: false })
              this.broadcast?.({ type: "command:timeout", data: { commandId: id } })
            }
          }, 120_000)

      if (this.paused) clearTimeout(timeoutId)

      const entry: QueueEntry = {
        id,
        terminalId: opts.terminalId,
        terminalName: opts.terminalName,
        command: opts.command,
        createdAt: now,
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

    // Inject with typing effect — ensure trailing newline for Enter
    const cmd = entry.command.endsWith("\n") ? entry.command : entry.command + "\n"
    await terminalManager.writeTyping(entry.terminalId, cmd)
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
    // Ensure trailing newline for Enter
    const cmd = newCommand.endsWith("\n") ? newCommand : newCommand + "\n"
    await terminalManager.writeTyping(entry.terminalId, cmd)
    entry.resolve({ approved: true })
  }

  /** Pause all timeouts — commands stay pending without auto-rejecting */
  pause() {
    if (this.paused) return
    this.paused = true
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timeoutId)
    }
    this.broadcast?.({ type: "command:paused" })
  }

  /** Resume timeouts with remaining time */
  resume() {
    if (!this.paused) return
    this.paused = false
    for (const entry of this.pending.values()) {
      const elapsed = Date.now() - entry.createdAt
      const remaining = Math.max(0, 120_000 - elapsed)
      entry.timeoutId = setTimeout(() => {
        if (this.pending.has(entry.id)) {
          this.pending.delete(entry.id)
          entry.resolve({ approved: false })
          this.broadcast?.({ type: "command:timeout", data: { commandId: entry.id } })
        }
      }, remaining)
    }
    this.broadcast?.({ type: "command:resumed" })
  }

  isPaused() {
    return this.paused
  }

  /** Get all pending commands (for UI reconnect) */
  listPending(): PendingCommand[] {
    return [...this.pending.values()].map(({ resolve: _, timeoutId: __, ...rest }) => rest)
  }
}

export const commandQueue = new CommandQueue()
