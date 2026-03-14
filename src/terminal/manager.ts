import { stripAnsi } from "./strip-ansi"
import { opsTracker } from "./ops-tracker"
import type { IPty } from "bun-pty"

const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const RING_BUFFER_MAX_LINES = 1000
const MAX_AI_POOL = 4

// Prompt patterns — matches Exegol format: [date] container /path #
// Also matches generic shells ending with $, #, >, or %
const EXEGOL_PROMPT_RE = /^\[.*?\]\s+\S+\s+\S+\s+#/
const GENERIC_PROMPT_RE = /[\$#>%]\s*$/

export interface Terminal {
  id: string
  name: string
  container: string
  process: IPty
  ringBuffer: string[]
  /** Accumulator for the current incomplete line (before \n) */
  _currentLine: string
  subscribers: Set<WebSocket>
  alive: boolean
  /** Whether a command is currently executing */
  busy: boolean
  /** Whether this terminal was created by the AI (part of the pool) */
  aiManaged: boolean
  /** Whether the terminal has shown its first prompt (shell is ready) */
  ready: boolean
  /** Timer for prompt detection debounce */
  _idleTimer?: ReturnType<typeof setTimeout>
  /** Per-terminal injection lock — prevents concurrent writeTyping calls */
  _injectionLock?: Promise<void>
}

export type WsBroadcast = (terminalId: string, message: object) => void

// Lazy-load bun-pty spawn to avoid top-level native import issues
let _spawn: typeof import("bun-pty").spawn | undefined
async function getPtySpawn() {
  if (!_spawn) {
    const mod = await import("bun-pty")
    _spawn = mod.spawn
  }
  return _spawn
}

class TerminalManager {
  private terminals = new Map<string, Terminal>()
  private _broadcast: WsBroadcast | null = null

  /** Store a broadcast function so tools can create terminals without a WS ref */
  setBroadcast(fn: WsBroadcast): void {
    this._broadcast = fn
  }

  /** Get an idle AI-managed terminal for a container, or create one if under pool limit */
  async getOrCreatePoolTerminal(container: string): Promise<Terminal | null> {
    // Find idle AI terminal for this container
    for (const t of this.terminals.values()) {
      if (t.aiManaged && t.container === container && t.alive && !t.busy) {
        return t
      }
    }
    // Count AI terminals for this container
    let aiCount = 0
    for (const t of this.terminals.values()) {
      if (t.aiManaged && t.container === container && t.alive) aiCount++
    }
    if (aiCount >= MAX_AI_POOL) return null // all busy, must queue
    // Create a new pool terminal
    const terminal = await this.createFromTool(container, `ai-ops-${aiCount + 1}`)
    terminal.aiManaged = true
    return terminal
  }

  /** Send SIGINT (Ctrl+C) to a terminal */
  sendInterrupt(terminalId: string): void {
    const terminal = this.terminals.get(terminalId)
    if (!terminal || !terminal.alive) return
    terminal.process.write("\x03") // Ctrl+C
    terminal.busy = false
  }

  /** Send SIGINT to all busy AI-managed terminals */
  interruptAllAI(): number {
    let count = 0
    for (const t of this.terminals.values()) {
      if (t.aiManaged && t.alive && t.busy) {
        t.process.write("\x03")
        t.busy = false
        count++
      }
    }
    return count
  }

  /** Mark a terminal as busy */
  markBusy(terminalId: string): void {
    const terminal = this.terminals.get(terminalId)
    if (terminal) terminal.busy = true
  }

  /** Check if a terminal is busy */
  isBusy(terminalId: string): boolean {
    return this.terminals.get(terminalId)?.busy ?? false
  }

  /** Create a terminal using the stored broadcast (for AI tool calls) */
  async createFromTool(container: string, name?: string): Promise<Terminal> {
    if (!this._broadcast) throw new Error("No broadcast function set — server not ready")
    const terminal = await this.create(container, name, this._broadcast)
    terminal.aiManaged = true
    console.log(`[Terminal] AI-created: ${terminal.name} (${terminal.id}) on ${container}, broadcasting terminal:created`)
    // Notify frontend so it adds the tab — ws.ts handleTerminalCreate does this
    // for user-created terminals, but AI-created ones bypass that handler.
    this._broadcast(terminal.id, {
      type: "terminal:created",
      data: { terminalId: terminal.id, name: terminal.name, container, aiCreated: true },
    })
    return terminal
  }

  getTerminal(id: string): Terminal | undefined {
    return this.terminals.get(id)
  }

  listTerminals(): { id: string; name: string; container: string; alive: boolean }[] {
    return [...this.terminals.values()].map((t) => ({
      id: t.id,
      name: t.name,
      container: t.container,
      alive: t.alive,
    }))
  }

  async create(
    container: string,
    name: string | undefined,
    broadcast: WsBroadcast,
    cols?: number,
    rows?: number,
  ): Promise<Terminal> {
    if (!CONTAINER_NAME_RE.test(container)) {
      throw new Error(`Invalid container name: ${container}`)
    }

    const id = crypto.randomUUID()
    const terminalName = name || `${container}-${id.slice(0, 8)}`

    const spawn = await getPtySpawn()

    // Two PTY layers exist: bun-pty's outer PTY and docker exec -t's inner PTY.
    // Both have ECHO enabled by default → double echo of everything.
    //
    // Fix: spawn sh on bun-pty's slave side, immediately set it to raw/no-echo
    // with `stty raw -echo`, then `exec` into docker. This disables echo on the
    // OUTER PTY so only the inner container TTY handles echo.
    //
    // Why this works now but didn't with `script`+`Bun.spawn`:
    // - Bun.spawn creates pipes, not a PTY → stty was a silent no-op
    // - bun-pty creates a real PTY → stty actually configures termios
    //
    // Shell: try zsh first (Exegol default — has autosuggestions, syntax highlighting,
    // oh-my-zsh plugins), fall back to bash if zsh isn't available.
    const shellCmd = `'if command -v zsh >/dev/null 2>&1; then exec zsh -l; else exec bash --login; fi'`
    const dockerCmd = `docker exec -it -w /workspace -e TERM=xterm-256color ${container} sh -c ${shellCmd}`
    const ptyProcess = spawn("sh", [
      "-c",
      `stty raw -echo 2>/dev/null; exec ${dockerCmd}`,
    ], {
      name: "xterm-256color",
      cols: cols || 120,
      rows: rows || 30,
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    })

    const terminal: Terminal = {
      id,
      name: terminalName,
      container,
      process: ptyProcess,
      ringBuffer: [],
      _currentLine: "",
      subscribers: new Set(),
      alive: true,
      busy: false,
      aiManaged: false,
      ready: false,
    }

    this.terminals.set(id, terminal)

    // Read PTY output — bun-pty delivers data via onData callback
    ptyProcess.onData((chunk: string) => {
      if (!terminal.alive) return

      // Store stripped output in ring buffer for AI context.
      // Uses a line accumulator (_currentLine) so partial PTY chunks
      // are joined into complete lines before being pushed.
      const stripped = stripAnsi(chunk)
      terminal._currentLine += stripped
      const parts = terminal._currentLine.split("\n")
      // All parts except the last are complete lines
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i].length > 0) {
          terminal.ringBuffer.push(parts[i])
        }
      }
      // Last part is the current incomplete line (or "" if chunk ended with \n)
      terminal._currentLine = parts[parts.length - 1]

      while (terminal.ringBuffer.length > RING_BUFFER_MAX_LINES) {
        terminal.ringBuffer.shift()
      }

      // Prompt detection: after output stops for 300ms, check for prompt.
      // Checks _currentLine (the visible line where the cursor sits),
      // not the ring buffer, since the prompt typically has no trailing \n.
      if (terminal._idleTimer) clearTimeout(terminal._idleTimer)
      terminal._idleTimer = setTimeout(() => {
        const curLine = terminal._currentLine
        const isPrompt = EXEGOL_PROMPT_RE.test(curLine) || GENERIC_PROMPT_RE.test(curLine)
        if (isPrompt) {
          if (!terminal.ready) {
            terminal.ready = true
            console.log(`[Terminal] ${terminal.name} (${terminal.id}) ready`)
          }
          if (terminal.busy) {
            terminal.busy = false
            opsTracker.completeByTerminal(terminal.id)
            broadcast(terminal.id, {
              type: "terminal:idle",
              data: { terminalId: terminal.id },
            })
          }
        }
      }, 300)

      // Send raw output to WebSocket clients (for xterm.js rendering)
      broadcast(terminal.id, {
        type: "terminal:output",
        data: { terminalId: terminal.id, output: chunk },
      })
    })

    // Handle process exit
    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      terminal.alive = false
      broadcast(id, {
        type: "terminal:closed",
        data: { terminalId: id },
      })
      this.terminals.delete(id)
      console.log(`[Terminal] ${terminalName} (${id}) exited with code ${exitCode}`)
    })

    return terminal
  }

  write(terminalId: string, input: string): void {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) throw new Error(`Terminal not found: ${terminalId}`)
    if (!terminal.alive) throw new Error(`Terminal is closed: ${terminalId}`)

    terminal.process.write(input)
  }

  /**
   * Wait until the terminal shows its first prompt (shell has finished init).
   * Times out after 10 seconds if no prompt is detected.
   */
  private waitForReady(terminal: Terminal, timeout = 10_000): Promise<void> {
    if (terminal.ready) return Promise.resolve()
    return new Promise((resolve) => {
      const start = Date.now()
      const check = () => {
        if (terminal.ready || !terminal.alive) {
          resolve()
          return
        }
        if (Date.now() - start > timeout) {
          console.warn(`[Terminal] waitForReady timed out for ${terminal.name} (${terminal.id}) after ${timeout}ms — forcing ready`)
          terminal.ready = true
          resolve()
          return
        }
        setTimeout(check, 200)
      }
      check()
    })
  }

  /**
   * Wait until the terminal is no longer busy (command finished, prompt returned).
   * Times out after `timeout` ms to avoid blocking forever on hung commands.
   */
  private waitForIdle(terminal: Terminal, timeout = 30_000): Promise<void> {
    if (!terminal.busy) return Promise.resolve()
    return new Promise((resolve) => {
      const start = Date.now()
      const check = () => {
        if (!terminal.busy || !terminal.alive) {
          resolve()
          return
        }
        if (Date.now() - start > timeout) {
          console.warn(`[Terminal] waitForIdle timed out for ${terminal.name} (${terminal.id}) after ${timeout}ms — forcing idle`)
          terminal.busy = false
          resolve()
          return
        }
        setTimeout(check, 300)
      }
      check()
    })
  }

  /**
   * Inject a command into the terminal (paste-style: whole command at once).
   * Uses a per-terminal lock to prevent concurrent injections from interleaving.
   * Waits for the terminal to be ready (first prompt) before injecting.
   * After sending Enter, waits for the command to finish (prompt returns)
   * before releasing the lock — so the next queued command doesn't pile up.
   *
   * Writes the command text in one shot (like clipboard paste) to avoid readline
   * wrapping issues that occur with char-by-char or chunk-based injection.
   */
  async writeTyping(terminalId: string, input: string): Promise<void> {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) throw new Error(`Terminal not found: ${terminalId}`)
    if (!terminal.alive) throw new Error(`Terminal is closed: ${terminalId}`)

    // Per-terminal injection lock: queue behind any ongoing injection
    const prevLock = terminal._injectionLock
    let releaseLock: () => void
    terminal._injectionLock = new Promise<void>((r) => { releaseLock = r })

    try {
      if (prevLock) await prevLock

      // Wait for shell to be ready (first prompt after sourcing rc files)
      await this.waitForReady(terminal)
      // Also wait for any previous command to finish
      await this.waitForIdle(terminal)

      if (!terminal.alive) return

      // Split command from its trailing newline
      const hasNewline = input.endsWith("\n")
      const command = hasNewline ? input.slice(0, -1) : input

      // Write the entire command at once (paste-style).
      // This lets readline handle the full text in a single pass,
      // avoiding wrapping/reflow bugs that happen with chunked input.
      if (command.length > 0) {
        terminal.process.write(command)
      }

      if (hasNewline && terminal.alive) {
        // Brief pause before Enter — lets readline render the full command first
        await new Promise((r) => setTimeout(r, 30))
        terminal.process.write("\n")

        // Mark terminal as busy and wait for the command to finish.
        // This prevents the next queued writeTyping from firing before
        // the prompt returns — avoiding command pileup.
        terminal.busy = true
        await this.waitForIdle(terminal)
      }
    } finally {
      releaseLock!()
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) throw new Error(`Terminal not found: ${terminalId}`)
    if (!terminal.alive) return

    terminal.process.resize(cols, rows)
  }

  close(terminalId: string): void {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) return

    terminal.alive = false
    if (terminal._idleTimer) clearTimeout(terminal._idleTimer)
    try {
      // SIGTERM first, then SIGKILL after 3s grace period (like OpenCode)
      terminal.process.kill()
      setTimeout(() => {
        try { terminal.process.kill("SIGKILL") } catch { /* already dead */ }
      }, 3000)
    } catch {
      // already dead
    }
    terminal.subscribers.clear()
    this.terminals.delete(terminalId)
    console.log(`[Terminal] Closed ${terminal.name} (${terminalId})`)
  }

  getOutput(terminalId: string): string {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) throw new Error(`Terminal not found: ${terminalId}`)
    return terminal.ringBuffer.join("\n")
  }

  subscribe(terminalId: string, ws: WebSocket): void {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) throw new Error(`Terminal not found: ${terminalId}`)
    terminal.subscribers.add(ws)
  }

  unsubscribe(ws: WebSocket): void {
    for (const terminal of this.terminals.values()) {
      terminal.subscribers.delete(ws)
    }
  }

  /** Close all terminals NOT in the given set of active IDs */
  closeExcept(activeIds: Set<string>): number {
    let count = 0
    for (const id of [...this.terminals.keys()]) {
      if (!activeIds.has(id)) {
        this.close(id)
        count++
      }
    }
    return count
  }

  closeAll(): void {
    for (const id of this.terminals.keys()) {
      this.close(id)
    }
  }
}

export const terminalManager = new TerminalManager()
