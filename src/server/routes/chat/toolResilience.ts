/**
 * Tool call resilience — repair, doom loop detection, InvalidTool.
 *
 * Three mechanisms:
 * 1. Tool call repair: fix case-insensitive names + normalize malformed args
 * 2. Doom loop detection: detect 3+ identical consecutive tool calls
 * 3. InvalidTool: graceful error sink that returns actionable feedback to the model
 *
 * The repair callback handles common issues from weaker models (Qwen, Llama, etc.):
 * - Wrong tool name casing: "Read" → "read"
 * - Wrong parameter names in nested objects: "name"→"tool", "arguments"→"args"
 * - Stringified JSON args that should be parsed
 */

import { z } from "zod"
import type { Tool } from "ai"

// ── InvalidTool ──────────────────────────────────────────────────

export const invalidTool: Tool<{ tool: string; error: string }, string> = {
  description: "Internal error handler — do not call directly",
  inputSchema: z.object({
    tool: z.string().describe("The tool that was called"),
    error: z.string().describe("Why the call failed"),
  }),
  execute: async ({ tool: toolName, error }) => {
    return `Tool call failed for "${toolName}": ${error}. Please check the tool name and arguments, then try again.`
  },
}

// ── Arg normalization ────────────────────────────────────────────

/**
 * Common field name mappings that models get wrong.
 * Maps "wrong name" → "correct name" for nested objects in tool args.
 */
const FIELD_ALIASES: Record<string, string> = {
  // batch tool: calls[].{tool, args}
  name: "tool",
  function: "tool",
  function_name: "tool",
  tool_name: "tool",
  toolName: "tool",
  arguments: "args",
  parameters: "args",
  params: "args",
  input: "args",
  inputs: "args",
  // Common variants
  file_path: "filePath",
  filepath: "filePath",
  file_name: "fileName",
  filename: "fileName",
}

/**
 * Attempt to normalize tool call args by:
 * 1. Fixing known field name aliases in nested objects
 * 2. Parsing stringified JSON args
 *
 * Returns the normalized args, or the original if nothing changed.
 */
function normalizeArgs(args: any, toolName: string): any {
  if (!args || typeof args !== "object") return args

  // Special handling for batch tool — normalize each call's fields
  if (toolName === "batch" && args.calls && Array.isArray(args.calls)) {
    const normalized = args.calls.map((call: any) => normalizeCallEntry(call))
    return { ...args, calls: normalized }
  }

  // Generic: apply aliases to top-level fields
  return applyAliases(args)
}

/** Normalize a single entry in a batch tool's calls array */
function normalizeCallEntry(call: any): any {
  if (!call || typeof call !== "object") return call

  const result: any = {}
  for (const [key, value] of Object.entries(call)) {
    const alias = FIELD_ALIASES[key]
    if (alias && !(alias in call)) {
      // Map aliased field to the correct name
      result[alias] = value
    } else {
      result[key] = value
    }
  }

  // If args is a string, try to parse it as JSON
  if (typeof result.args === "string") {
    try {
      result.args = JSON.parse(result.args)
    } catch {
      // Keep as-is if not valid JSON
    }
  }

  return result
}

/** Apply field aliases to a flat object */
function applyAliases(obj: any): any {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj

  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    const alias = FIELD_ALIASES[key]
    if (alias && !(alias in obj)) {
      result[alias] = value
    } else {
      result[key] = value
    }
  }
  return result
}

// ── Tool Call Repair ─────────────────────────────────────────────

/**
 * Build the experimental_repairToolCall callback for streamText().
 *
 * Repair chain (ordered by likelihood):
 * 1. Case-insensitive tool name match (Read → read, File_Read → file_read)
 * 2. Arg normalization: fix common field name mistakes in args
 * 3. Parse stringified JSON args
 * 4. Fallback to InvalidTool with structured error
 */
export function buildRepairCallback(tools: Record<string, any>) {
  const toolNames = Object.keys(tools)
  const lowerMap = new Map<string, string>()
  for (const name of toolNames) {
    lowerMap.set(name.toLowerCase(), name)
  }

  return async (options: any) => {
    const { toolCall, error } = options
    const originalName = toolCall.toolName
    const lower = originalName.toLowerCase()

    // ── Step 1: fix tool name casing ──
    let repairedName = originalName
    if (lower !== originalName && lowerMap.has(lower)) {
      repairedName = lowerMap.get(lower)!
      console.log(`[Tool Repair] Fixed case: "${originalName}" → "${repairedName}"`)
    } else if (!tools[originalName] && lowerMap.has(lower)) {
      repairedName = lowerMap.get(lower)!
      console.log(`[Tool Repair] Fixed case: "${originalName}" → "${repairedName}"`)
    }

    // ── Step 2: normalize args ──
    let args = toolCall.args
    if (typeof args === "string") {
      try {
        args = JSON.parse(args)
      } catch {
        // keep as string — will fail validation and go to InvalidTool
      }
    }

    if (typeof args === "object" && args !== null) {
      const normalizedArgs = normalizeArgs(args, repairedName)
      if (JSON.stringify(normalizedArgs) !== JSON.stringify(args)) {
        console.log(`[Tool Repair] Normalized args for "${repairedName}":`, Object.keys(normalizedArgs))
        args = normalizedArgs
      }
    }

    // ── Step 3: if we fixed something, return the repaired call ──
    if (repairedName !== originalName || args !== toolCall.args) {
      // Re-serialize args for the AI SDK
      const input = typeof args === "string" ? args : JSON.stringify(args)
      return {
        ...toolCall,
        toolName: repairedName,
        args: input,
      }
    }

    // ── Step 4: redirect to InvalidTool ──
    console.log(`[Tool Repair] Unknown/invalid tool: "${originalName}" — redirecting to invalid`)
    return {
      ...toolCall,
      args: JSON.stringify({
        tool: originalName,
        error: error.message,
      }),
      toolName: "invalid",
    }
  }
}

// ── Doom Loop Detection ──────────────────────────────────────────
//
// Adapted from Cline's two-level approach:
// 1. Identical-args detection (our original) — catches exact same call repeated
// 2. consecutiveMistakeCount (from Cline's TaskState) — accumulates across all
//    tool types, with escalating feedback instead of hard abort
//
// Cline's key insight: counter only resets after a SUCCESSFUL tool result,
// not at operation start (they had a known bug from resetting too early).
//
// Escalation levels (from Cline's responses.ts):
// - Level 1 (warn): inject feedback asking model to change approach
// - Level 2 (directive): stronger message with specific alternatives
// - Level 3 (abort): stop execution entirely

const DOOM_LOOP_THRESHOLD = 4

// Tools that legitimately poll with identical args (output changes between calls)
const EXEMPT_TOOLS = new Set(["terminal_read", "terminal_list", "terminal_close"])

// Tools that may retry the same args in complex workflows
const HIGH_THRESHOLD_TOOLS = new Set(["terminal_write", "terminal_create"])
const HIGH_THRESHOLD = 8

// Cline-style: max consecutive mistakes before hard abort (configurable)
const MAX_CONSECUTIVE_MISTAKES = 3

interface ToolCallRecord {
  toolName: string
  argsHash: string
}

export type DoomLoopResult =
  | { action: "ok" }
  | { action: "warn"; message: string; toolName: string }
  | { action: "abort"; message: string; toolName: string }

/**
 * Cline-style escalating error messages.
 * Adapted from Cline's responses.ts writeToFileMissingContentError pattern.
 * Provides progressively stronger guidance as failures accumulate.
 */
function getEscalatingMessage(toolName: string, consecutiveCount: number, argsHash: string): string {
  if (consecutiveCount >= MAX_CONSECUTIVE_MISTAKES) {
    // Level 3: hard abort (Cline's "CRITICAL" level)
    return (
      `Stopped: tool "${toolName}" was called repeatedly with identical arguments. ` +
      `This usually means the approach isn't working — try a different strategy.`
    )
  }

  if (consecutiveCount === 2) {
    // Level 2: strong directive (Cline's "2nd failed attempt" level)
    return (
      `WARNING: You called "${toolName}" with the same arguments again (${consecutiveCount}x). ` +
      `You MUST change your approach. Do NOT call this tool again with the same arguments. ` +
      `Consider: use a different tool, modify your arguments, or explain to the user why you're stuck.`
    )
  }

  // Level 1: gentle warn (Cline's "1st failure" level)
  return (
    `Note: "${toolName}" was just called with identical arguments to a previous call. ` +
    `The result will be the same. Consider using different arguments or a different approach.`
  )
}

export function createDoomLoopTracker() {
  const recent: ToolCallRecord[] = []
  // Cline-style consecutive mistake counter — tracks across all tool types
  let consecutiveMistakeCount = 0

  return {
    /**
     * Check a tool call for doom loop patterns.
     * Returns an action: "ok" (proceed), "warn" (inject feedback), or "abort" (stop).
     *
     * Adapted from Cline's two-tier approach:
     * - Identical args detection (same tool + same args repeated)
     * - consecutiveMistakeCount for escalating responses
     */
    check(toolName: string, args: any): DoomLoopResult {
      // Exempt tools: same args != same result (polling changing state)
      if (EXEMPT_TOOLS.has(toolName)) return { action: "ok" }

      const argsHash = JSON.stringify(args)
      recent.push({ toolName, argsHash })

      // Keep enough history for the highest threshold
      while (recent.length > HIGH_THRESHOLD) {
        recent.shift()
      }

      // Use higher threshold for terminal action tools
      const threshold = HIGH_THRESHOLD_TOOLS.has(toolName) ? HIGH_THRESHOLD : DOOM_LOOP_THRESHOLD

      if (recent.length < 2) return { action: "ok" }

      // Check for identical consecutive calls
      const prev = recent[recent.length - 2]
      if (prev.toolName === toolName && prev.argsHash === argsHash) {
        // Same tool + same args as previous call — increment mistake counter
        // (Cline: only reset after SUCCESS, not at operation start)
        consecutiveMistakeCount++

        if (consecutiveMistakeCount >= MAX_CONSECUTIVE_MISTAKES) {
          return {
            action: "abort",
            message: getEscalatingMessage(toolName, consecutiveMistakeCount, argsHash),
            toolName,
          }
        }

        return {
          action: "warn",
          message: getEscalatingMessage(toolName, consecutiveMistakeCount, argsHash),
          toolName,
        }
      }

      return { action: "ok" }
    },

    /**
     * Reset on text output — conversation progress breaks the loop.
     */
    resetOnText() {
      recent.length = 0
      // Cline: text output from model means it's making progress
      consecutiveMistakeCount = 0
    },

    /**
     * Reset on successful tool result — Cline's pattern.
     * Only called when a tool completes successfully (not on error).
     */
    resetOnSuccess() {
      consecutiveMistakeCount = 0
    },

    /**
     * Get the tool name that's looping (for error messages).
     */
    getLoopTool(): string | null {
      if (recent.length < 2) return null
      const last = recent[recent.length - 1]
      const prev = recent[recent.length - 2]
      if (last.toolName === prev.toolName && last.argsHash === prev.argsHash) {
        return last.toolName
      }
      return null
    },

    /** Current consecutive mistake count (for debugging/logging) */
    get mistakes(): number {
      return consecutiveMistakeCount
    },
  }
}
