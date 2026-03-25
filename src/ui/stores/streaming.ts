/**
 * Ephemeral streaming state — tracks AI response progress.
 * Not persisted (resets on page reload). Used by ControlBar for step counter + cancel.
 */

import { create } from "zustand"

interface StreamingStore {
  isStreaming: boolean
  stepCount: number
  startTime: number | null
  abortFn: (() => void) | null

  start: (abortFn: () => void) => void
  incrementStep: () => void
  stop: () => void
}

export const useStreamingStore = create<StreamingStore>((set) => ({
  isStreaming: false,
  stepCount: 0,
  startTime: null,
  abortFn: null,

  start: (abortFn) => set({ isStreaming: true, stepCount: 0, startTime: Date.now(), abortFn }),
  incrementStep: () => set((s) => ({ stepCount: s.stepCount + 1 })),
  stop: () => set({ isStreaming: false, stepCount: 0, startTime: null, abortFn: null }),
}))
