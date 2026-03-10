/**
 * Promise-based question queue.
 * Similar to command-queue.ts — holds pending questions until the user answers via WebSocket.
 */

import { randomUUID } from "crypto"

type BroadcastFn = (message: object) => void

interface PendingQuestion {
  id: string
  question: string
  options?: string[]
  resolve: (answer: string) => void
}

class QuestionQueue {
  private pending = new Map<string, PendingQuestion>()
  private broadcast: BroadcastFn | null = null

  setBroadcast(fn: BroadcastFn) {
    this.broadcast = fn
  }

  /**
   * Ask the user a question. Returns a promise that resolves with their answer.
   */
  async ask(question: string, options?: string[]): Promise<string> {
    const id = randomUUID()

    return new Promise<string>((resolve) => {
      this.pending.set(id, { id, question, options, resolve })

      this.broadcast?.({
        type: "question:pending",
        id,
        question,
        options,
      })

      // 5-minute timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve("(no response — timed out after 5 minutes)")
        }
      }, 300_000)
    })
  }

  /**
   * Called when the user answers (from WS handler).
   */
  answer(id: string, response: string) {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    entry.resolve(response)
  }

  hasPending(): boolean {
    return this.pending.size > 0
  }
}

export const questionQueue = new QuestionQueue()
