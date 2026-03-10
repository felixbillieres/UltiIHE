import { z } from "zod"
import { terminalManager } from "../../terminal/manager"
import { commandQueue } from "../../terminal/command-queue"
import type { Tool } from "ai"

/**
 * AI SDK v6 tools for terminal interaction.
 * These let the AI read output from any terminal, list terminals, and write commands.
 */

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
      const result = await commandQueue.enqueue({
        terminalId,
        terminalName: terminal.name,
        command: normalizedInput,
      })

      if (result.approved) {
        return { success: true, terminalId, status: "executed" }
      } else {
        return { success: false, terminalId, status: "rejected" }
      }
    } catch (err) {
      return { error: (err as Error).message }
    }
  },
}

/** All terminal tools bundled for use in streamText() */
export const terminalTools = {
  terminal_read: terminalReadTool,
  terminal_list: terminalListTool,
  terminal_write: terminalWriteTool,
}
