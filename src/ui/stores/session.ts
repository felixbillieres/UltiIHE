import { create } from "zustand"
import { persist } from "zustand/middleware"

// ─── Part types ──────────────────────────────────────────────

export interface TextPart {
  type: "text"
  content: string
}

export interface ToolCallPart {
  type: "tool-call"
  id: string
  tool: string
  args: Record<string, any>
  status: "running" | "completed" | "error"
  output?: string
  isError?: boolean
  startTime: number
  endTime?: number
}

export interface ReasoningPart {
  type: "reasoning"
  id: string
  content: string
  startTime: number
  endTime?: number
}

export type MessagePart = TextPart | ToolCallPart | ReasoningPart

// ─── Message & Session ───────────────────────────────────────

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  parts: MessagePart[]
  createdAt: number
}

export interface Session {
  id: string
  projectId: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
}

// ─── Store ────────────────────────────────────────────────────

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  /** Non-persisted undo buffer per session (last removed exchange) */
  _undoBuffer: Record<string, Message[]>

  // Session CRUD
  createSession: (projectId: string, title?: string) => Session
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  setActiveSession: (id: string | null) => void
  getProjectSessions: (projectId: string) => Session[]

  // Message management
  addMessage: (sessionId: string, message: Message) => void
  updateMessageContent: (sessionId: string, messageId: string, content: string) => void
  updateMessage: (sessionId: string, messageId: string, updates: { content?: string; parts?: MessagePart[] }) => void
  getActiveMessages: () => Message[]

  // Undo/Redo/Fork
  undoLastExchange: (sessionId: string) => boolean
  redoLastExchange: (sessionId: string) => boolean
  forkSession: (sessionId: string, upToMessageId: string) => Session | null
  removeLastMessages: (sessionId: string, count: number) => Message[]

  // Convenience
  getActiveSession: () => Session | undefined
  startNewChat: (projectId: string) => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      _undoBuffer: {},

      createSession: (projectId, title) => {
        const session: Session = {
          id: crypto.randomUUID(),
          projectId,
          title: title || `New chat`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        }
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: session.id,
        }))
        return session
      },

      deleteSession: (id) => {
        set((s) => ({
          sessions: s.sessions.filter((sess) => sess.id !== id),
          activeSessionId:
            s.activeSessionId === id ? null : s.activeSessionId,
        }))
      },

      renameSession: (id, title) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, title, updatedAt: Date.now() } : sess,
          ),
        }))
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      getProjectSessions: (projectId) =>
        get()
          .sessions.filter((s) => s.projectId === projectId)
          .sort((a, b) => b.updatedAt - a.updatedAt),

      addMessage: (sessionId, message) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: [...sess.messages, message],
                  updatedAt: Date.now(),
                  // Auto-title from first user message
                  title:
                    sess.messages.length === 0 && message.role === "user"
                      ? message.content.slice(0, 50) +
                        (message.content.length > 50 ? "..." : "")
                      : sess.title,
                }
              : sess,
          ),
        }))
      },

      updateMessageContent: (sessionId, messageId, content) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: sess.messages.map((m) =>
                    m.id === messageId ? { ...m, content } : m,
                  ),
                  updatedAt: Date.now(),
                }
              : sess,
          ),
        }))
      },

      updateMessage: (sessionId, messageId, updates) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: sess.messages.map((m) =>
                    m.id === messageId ? { ...m, ...updates } : m,
                  ),
                  updatedAt: Date.now(),
                }
              : sess,
          ),
        }))
      },

      undoLastExchange: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId)
        if (!session || session.messages.length < 2) return false
        // Remove last assistant + user pair
        const msgs = session.messages
        const lastAssistant = msgs.length >= 1 && msgs[msgs.length - 1].role === "assistant" ? 1 : 0
        const lastUser = msgs.length >= 2 && msgs[msgs.length - 1 - lastAssistant].role === "user" ? 1 : 0
        const removeCount = lastAssistant + lastUser
        if (removeCount === 0) return false
        const removed = msgs.slice(-removeCount)
        set((s) => ({
          _undoBuffer: { ...s._undoBuffer, [sessionId]: removed },
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, messages: sess.messages.slice(0, -removeCount), updatedAt: Date.now() }
              : sess,
          ),
        }))
        return true
      },

      redoLastExchange: (sessionId) => {
        const buffer = get()._undoBuffer[sessionId]
        if (!buffer || buffer.length === 0) return false
        set((s) => ({
          _undoBuffer: { ...s._undoBuffer, [sessionId]: [] },
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, messages: [...sess.messages, ...buffer], updatedAt: Date.now() }
              : sess,
          ),
        }))
        return true
      },

      forkSession: (sessionId, upToMessageId) => {
        const session = get().sessions.find((s) => s.id === sessionId)
        if (!session) return null
        const msgIdx = session.messages.findIndex((m) => m.id === upToMessageId)
        if (msgIdx === -1) return null
        const forkedMessages = session.messages.slice(0, msgIdx + 1).map((m) => ({
          ...m,
          id: crypto.randomUUID(),
        }))
        const forked: Session = {
          id: crypto.randomUUID(),
          projectId: session.projectId,
          title: `${session.title} (fork)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: forkedMessages,
        }
        set((s) => ({
          sessions: [forked, ...s.sessions],
          activeSessionId: forked.id,
        }))
        return forked
      },

      removeLastMessages: (sessionId, count) => {
        const session = get().sessions.find((s) => s.id === sessionId)
        if (!session) return []
        const removed = session.messages.slice(-count)
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, messages: sess.messages.slice(0, -count), updatedAt: Date.now() }
              : sess,
          ),
        }))
        return removed
      },

      getActiveMessages: () => {
        const state = get()
        if (!state.activeSessionId) return []
        const session = state.sessions.find(
          (s) => s.id === state.activeSessionId,
        )
        return session?.messages || []
      },

      getActiveSession: () => {
        const state = get()
        if (!state.activeSessionId) return undefined
        return state.sessions.find((s) => s.id === state.activeSessionId)
      },

      startNewChat: (projectId) => {
        const session = get().createSession(projectId)
        set({ activeSessionId: session.id })
      },
    }),
    {
      name: "ultiIHE-sessions",
      partialize: (state) => ({
        sessions: state.sessions.slice(0, 50),
        activeSessionId: state.activeSessionId,
        // _undoBuffer is intentionally excluded (ephemeral)
      }),
      // Migrate old sessions that lack `messages` or `parts`
      merge: (persisted, current) => {
        const p = persisted as any
        if (p?.sessions) {
          p.sessions = p.sessions.map((s: any) => ({
            ...s,
            messages: (s.messages ?? []).map((m: any) => ({
              ...m,
              parts: m.parts ?? [],
            })),
          }))
        }
        return { ...current, ...p }
      },
    },
  ),
)
