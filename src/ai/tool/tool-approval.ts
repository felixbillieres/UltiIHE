/**
 * Generic tool approval queue.
 * Same pattern as command-queue.ts but for any tool call.
 * Tools wrapped with withApproval() will ask the user before executing.
 *
 * Enhanced: supports diff-based approvals for file operations (Cursor-style).
 */

import { randomUUID } from "crypto"

type BroadcastFn = (message: object) => void

interface PendingApproval {
  id: string
  toolName: string
  description: string
  args: Record<string, unknown>
  /** For file operations: the diff to show */
  diff?: string
  /** For file operations: container:path */
  fileKey?: string
  /** Whether this is a new file creation */
  isNewFile?: boolean
  resolve: (approved: boolean) => void
  timeoutId: ReturnType<typeof setTimeout>
}

class ToolApprovalQueue {
  private pending = new Map<string, PendingApproval>()
  private alwaysAllowed = new Set<string>() // tools approved with "allow always"
  private mode: "ask" | "auto-run" = "ask"
  private broadcast: BroadcastFn | null = null

  setBroadcast(fn: BroadcastFn) {
    this.broadcast = fn
  }

  setMode(mode: "ask" | "auto-run") {
    const prev = this.mode
    this.mode = mode

    // When switching TO auto-run: auto-approve all pending, clear allowlist
    if (mode === "auto-run" && prev === "ask") {
      // Approve all pending tools since we're now in auto-run
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timeoutId)
        entry.resolve(true)
      }
      this.pending.clear()
      this.alwaysAllowed.clear()
      // Broadcast cleared state
      this.broadcast?.({ type: "tool:all-cleared" })
    }
  }

  getMode() {
    return this.mode
  }

  /**
   * Request approval for a tool call.
   * Returns true if approved, false if rejected.
   */
  async request(
    toolName: string,
    description: string,
    args: Record<string, unknown>,
    extra?: { diff?: string; fileKey?: string; isNewFile?: boolean },
  ): Promise<boolean> {
    // Auto-run mode: skip approval
    if (this.mode === "auto-run") return true

    // Tool already "always allowed" this session
    if (this.alwaysAllowed.has(toolName)) return true

    const id = randomUUID()

    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve(false)
          // Broadcast timeout so frontend can remove the pending banner
          this.broadcast?.({ type: "tool:timeout", data: { id } })
        }
      }, 120_000)

      this.pending.set(id, {
        id,
        toolName,
        description,
        args,
        diff: extra?.diff,
        fileKey: extra?.fileKey,
        isNewFile: extra?.isNewFile,
        resolve,
        timeoutId,
      })

      this.broadcast?.({
        type: "tool:pending",
        id,
        toolName,
        description,
        args,
        diff: extra?.diff,
        fileKey: extra?.fileKey,
        isNewFile: extra?.isNewFile,
      })
    })
  }

  approve(id: string, allowAlways = false) {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    clearTimeout(entry.timeoutId)

    if (allowAlways) {
      this.alwaysAllowed.add(entry.toolName)
    }

    entry.resolve(true)
  }

  reject(id: string) {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    clearTimeout(entry.timeoutId)
    entry.resolve(false)
  }

  /**
   * Approve all pending file operation approvals at once.
   */
  approveAll(allowAlways = false) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timeoutId)
      if (allowAlways) {
        this.alwaysAllowed.add(entry.toolName)
      }
      entry.resolve(true)
    }
    this.pending.clear()
  }

  /**
   * Reject all pending approvals at once.
   */
  rejectAll() {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timeoutId)
      entry.resolve(false)
    }
    this.pending.clear()
  }

  getPending() {
    return Array.from(this.pending.values()).map(({ resolve: _, timeoutId: __, ...rest }) => rest)
  }
}

export const toolApprovalQueue = new ToolApprovalQueue()
