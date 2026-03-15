import { z } from "zod"
import { terminalManager } from "../../terminal/manager"
import { commandQueue } from "../../terminal/command-queue"
import type { Tool } from "ai"

/**
 * AI SDK v6 tools for terminal interaction.
 * These let the AI read output from any terminal, list terminals, and write commands.
 */

export const terminalCreateTool: Tool<
  { container: string; name?: string },
  { terminalId: string; name: string; container: string } | { error: string }
> = {
  description:
    "Create a new terminal connected to a specific container. Use this when you need " +
    "additional terminals for parallel command execution (e.g. running nmap in one terminal " +
    "and gobuster in another). Each terminal is an independent shell session inside the container.",
  inputSchema: z.object({
    container: z.string().describe("The Docker container name to connect to (e.g. 'exegol-bugbounty')"),
    name: z.string().optional().describe("A descriptive name for the terminal (e.g. 'nmap-scan', 'gobuster-web')"),
  }),
  execute: async ({ container, name }) => {
    try {
      const terminal = await terminalManager.createFromTool(container, name)
      return {
        terminalId: terminal.id,
        name: terminal.name,
        container: terminal.container,
      }
    } catch (err) {
      return { error: (err as Error).message }
    }
  },
}

export const terminalReadTool: Tool<
  { terminalId: string; lines: number },
  { terminalId: string; name: string; container: string; alive: boolean; lineCount: number; output: string } | { error: string }
> = {
  description:
    "Read the recent output from a terminal. Use this to see command results, " +
    "scan output, error messages, or any terminal activity. Returns the last N lines " +
    "(stripped of ANSI codes) from the terminal's ring buffer.",
  inputSchema: z.object({
    terminalId: z.string().describe("The terminal ID to read from"),
    lines: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Number of recent lines to return (default 100)"),
  }),
  execute: async ({ terminalId, lines }) => {
    const terminal = terminalManager.getTerminal(terminalId)
    if (!terminal) {
      return { error: `Terminal not found: ${terminalId}` }
    }

    const buffer = terminal.ringBuffer
    const selected = buffer.slice(-lines)
    return {
      terminalId,
      name: terminal.name,
      container: terminal.container,
      alive: terminal.alive,
      lineCount: selected.length,
      output: selected.join("\n"),
    }
  },
}

export const terminalListTool: Tool<
  Record<string, never>,
  { count: number; terminals: { id: string; name: string; container: string; alive: boolean }[] }
> = {
  description:
    "List all active terminals with their IDs, names, and container. " +
    "Use this to discover which terminals exist before reading them.",
  inputSchema: z.object({}),
  execute: async () => {
    const terminals = terminalManager.listTerminals()
    return {
      count: terminals.length,
      terminals: terminals.map((t) => ({
        id: t.id,
        name: t.name,
        container: t.container,
        alive: t.alive,
      })),
    }
  },
}

export const terminalWriteTool: Tool<
  { terminalId: string; input: string },
  { success: boolean; terminalId: string; status: string } | { error: string }
> = {
  description:
    "Propose a command for execution in a terminal. The command will be shown to the user " +
    "for approval before being injected into the terminal's PTY. Always add a trailing " +
    "newline (\\n) to actually execute the command.",
  inputSchema: z.object({
    terminalId: z.string().describe("The terminal ID to write to"),
    input: z.string().describe("The text to send to the terminal (include \\n to execute)"),
  }),
  execute: async ({ terminalId, input }) => {
    try {
      const terminal = terminalManager.getTerminal(terminalId)
      if (!terminal) {
        return { error: `Terminal not found: ${terminalId}` }
      }
      if (!terminal.alive) {
        return { error: `Terminal is closed: ${terminalId}` }
      }

      // Normalize literal \n sequences to real newlines
      // (some models send the two-char sequence instead of actual newline)
      const normalizedInput = input.replace(/\\n/g, "\n")

      // Queue the command for user approval (or auto-run if enabled)
      // Pool logic: if terminal is busy, command-queue may redirect to another terminal
      const result = await commandQueue.enqueue({
        terminalId,
        terminalName: terminal.name,
        command: normalizedInput,
      })

      if (result.approved) {
        return {
          success: true,
          terminalId: result.actualTerminalId || terminalId,
          status: result.actualTerminalId && result.actualTerminalId !== terminalId
            ? `executed (redirected to pool terminal)`
            : "executed",
        }
      } else {
        return { success: false, terminalId, status: "rejected" }
      }
    } catch (err) {
      return { error: (err as Error).message }
    }
  },
}

export const terminalCloseTool: Tool<
  { terminalId: string },
  { success: boolean; terminalId: string } | { error: string }
> = {
  description:
    "Close a terminal that is no longer needed. Use this to clean up terminals after " +
    "completing tasks to avoid accumulating unused terminals. Cannot close the last remaining terminal.",
  inputSchema: z.object({
    terminalId: z.string().describe("The terminal ID to close"),
  }),
  execute: async ({ terminalId }) => {
    try {
      const terminals = terminalManager.listTerminals()
      if (terminals.length <= 1) {
        return { error: "Cannot close the last terminal" }
      }
      const terminal = terminalManager.getTerminal(terminalId)
      if (!terminal) {
        return { error: `Terminal not found: ${terminalId}` }
      }
      terminalManager.close(terminalId)
      return { success: true, terminalId }
    } catch (err) {
      return { error: (err as Error).message }
    }
  },
}

/** All terminal tools bundled for use in streamText() */
export const terminalTools = {
  terminal_create: terminalCreateTool,
  terminal_read: terminalReadTool,
  terminal_list: terminalListTool,
  terminal_write: terminalWriteTool,
  terminal_close: terminalCloseTool,
}
