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
  { terminalId: string; command: string },
  { success: boolean; terminalId: string; status: string } | { error: string }
> = {
  description:
    "Execute a command in a terminal. The command will be shown to the user for approval " +
    "before execution. Do NOT include trailing newlines — the system adds them automatically. " +
    "Do NOT call this tool just to press Enter or send empty input.",
  inputSchema: z.object({
    terminalId: z.string().describe("The terminal ID to write to"),
    command: z.string().describe("The command to execute (e.g. 'nmap -sV 10.10.10.1')"),
  }),
  execute: async (args) => {
    const { terminalId } = args
    // Accept both "command" (new) and "input" (legacy) arg names
    const input = (args as any).command || (args as any).input || ""

    try {
      const terminal = terminalManager.getTerminal(terminalId)
      if (!terminal) {
        return { error: `Terminal not found: ${terminalId}` }
      }
      if (!terminal.alive) {
        return { error: `Terminal is closed: ${terminalId}` }
      }

      // Normalize literal \n sequences to real newlines
      const normalizedInput = input.replace(/\\n/g, "\n")

      // Reject empty/whitespace-only commands
      const trimmed = normalizedInput.replace(/\n/g, "").trim()
      if (!trimmed) {
        return { error: "Empty command — nothing to execute" }
      }

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

export const terminalSearchTool: Tool<
  { terminalId: string; pattern: string; maxResults?: number },
  string | { error: string }
> = {
  description:
    "Search terminal output for lines matching a regex pattern. Useful for finding specific " +
    "results in long command outputs (IPs, ports, errors, credentials) without reading the " +
    "entire buffer. Returns matching lines with line numbers.",
  inputSchema: z.object({
    terminalId: z.string().describe("The terminal ID to search in"),
    pattern: z.string().describe("Regex pattern to search for (case-insensitive)"),
    maxResults: z.number().optional().describe("Maximum results to return (default 50)"),
  }),
  execute: async ({ terminalId, pattern, maxResults }) => {
    try {
      const matches = terminalManager.searchOutput(terminalId, pattern, maxResults)
      if (matches.length === 0) return `No matches found for pattern: ${pattern}`
      return matches.join("\n")
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
  terminal_search: terminalSearchTool,
}
