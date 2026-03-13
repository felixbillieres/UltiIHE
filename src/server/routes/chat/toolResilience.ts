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

const DOOM_LOOP_THRESHOLD = 3

// Tools that legitimately poll with identical args (output changes between calls)
// These are completely exempt from doom loop detection.
const EXEMPT_TOOLS = new Set(["terminal_read", "terminal_list"])

// Tools that may retry the same args in complex workflows (e.g. AI retrying
// a command after reading output). These get a higher threshold.
const HIGH_THRESHOLD_TOOLS = new Set(["terminal_write", "terminal_create"])
const HIGH_THRESHOLD = 6

interface ToolCallRecord {
  toolName: string
  argsHash: string
}

export function createDoomLoopTracker() {
  const recent: ToolCallRecord[] = []

  return {
    check(toolName: string, args: any): boolean {
      // Exempt tools: same args != same result (polling changing state)
      if (EXEMPT_TOOLS.has(toolName)) return false

      const argsHash = JSON.stringify(args)
      recent.push({ toolName, argsHash })

      // Use higher threshold for terminal action tools
      const threshold = HIGH_THRESHOLD_TOOLS.has(toolName) ? HIGH_THRESHOLD : DOOM_LOOP_THRESHOLD

      // Keep enough history for the highest threshold
      while (recent.length > HIGH_THRESHOLD) {
        recent.shift()
      }

      if (recent.length < threshold) return false

      // Check the last `threshold` entries
      const window = recent.slice(-threshold)
      const first = window[0]
      return window.every(
        (r) => r.toolName === first.toolName && r.argsHash === first.argsHash,
      )
    },

    resetOnText() {
      recent.length = 0
    },

    getLoopTool(): string | null {
      // Check with standard threshold first
      if (recent.length >= DOOM_LOOP_THRESHOLD) {
        const window = recent.slice(-DOOM_LOOP_THRESHOLD)
        const first = window[0]
        if (!HIGH_THRESHOLD_TOOLS.has(first.toolName) && !EXEMPT_TOOLS.has(first.toolName)) {
          if (window.every((r) => r.toolName === first.toolName && r.argsHash === first.argsHash)) {
            return first.toolName
          }
        }
      }
      // Check with high threshold for terminal tools
      if (recent.length >= HIGH_THRESHOLD) {
        const window = recent.slice(-HIGH_THRESHOLD)
        const first = window[0]
        if (window.every((r) => r.toolName === first.toolName && r.argsHash === first.argsHash)) {
          return first.toolName
        }
      }
      return null
    },
  }
}
