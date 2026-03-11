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

  // Convenience
  getActiveSession: () => Session | undefined
  startNewChat: (projectId: string) => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

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
