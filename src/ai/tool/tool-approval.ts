/**
 * Generic tool approval queue.
 * Same pattern as command-queue.ts but for any tool call.
 * Tools wrapped with withApproval() will ask the user before executing.
 */

import { randomUUID } from "crypto"

type BroadcastFn = (message: object) => void

interface PendingApproval {
  id: string
  toolName: string
  description: string
  args: Record<string, unknown>
  resolve: (approved: boolean) => void
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
    this.mode = mode
    if (mode === "auto-run") {
      this.alwaysAllowed.clear()
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
  ): Promise<boolean> {
    // Auto-run mode: skip approval
    if (this.mode === "auto-run") return true

    // Tool already "always allowed" this session
    if (this.alwaysAllowed.has(toolName)) return true

    const id = randomUUID()

    return new Promise<boolean>((resolve) => {
      this.pending.set(id, { id, toolName, description, args, resolve })

      this.broadcast?.({
        type: "tool:pending",
        id,
        toolName,
        description,
        args,
      })

      // 2 minute timeout → auto-reject
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve(false)
        }
      }, 120_000)
    })
  }

  approve(id: string, allowAlways = false) {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)

    if (allowAlways) {
      this.alwaysAllowed.add(entry.toolName)
    }

    entry.resolve(true)
  }

  reject(id: string) {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    entry.resolve(false)
  }

  getPending() {
    return Array.from(this.pending.values()).map(({ resolve: _, ...rest }) => rest)
  }
}

export const toolApprovalQueue = new ToolApprovalQueue()
