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
  wasTruncated?: boolean
  originalLength?: number
}

export interface ReasoningPart {
  type: "reasoning"
  id: string
  content: string
  startTime: number
  endTime?: number
}

export type MessagePart = TextPart | ToolCallPart | ReasoningPart

// ─── Usage tracking ─────────────────────────────────────────

export interface MessageUsage {
  /** Input tokens (prompt) */
  inputTokens: number
  /** Output tokens (completion) */
  outputTokens: number
  /** Reasoning/thinking tokens (Claude Thinking, O1) */
  reasoningTokens?: number
  /** Tokens read from prompt cache (90% cheaper) */
  cacheReadTokens?: number
  /** Tokens written to prompt cache (25% more expensive) */
  cacheWriteTokens?: number
  /** Number of tool-call steps in this response */
  totalSteps?: number
}

// ─── Message & Session ───────────────────────────────────────

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  parts: MessagePart[]
  createdAt: number
  /** Real token usage from the provider (assistant messages only) */
  usage?: MessageUsage
  /** System notices are rendered in the chat but never sent to the API */
  isSystemNotice?: boolean
  /** Pinned messages survive context pruning (contain creds, findings, flags) */
  isPinned?: boolean
}

export interface Session {
  id: string
  projectId: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  /** If this session was forked, references the parent */
  forkedFrom?: { sessionId: string; messageId: string }
}

// ─── Store ────────────────────────────────────────────────────

interface SessionStore {
  sessions: Session[]
  /** Per-project active session — like OpenCode's per-directory scoping */
  activeSessionIdByProject: Record<string, string | null>
  /** Non-persisted undo buffer per session (last removed exchange) */
  _undoBuffer: Record<string, Message[]>

  // Session CRUD
  createSession: (projectId: string, title?: string) => Session
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  setActiveSession: (id: string | null, projectId: string) => void
  getProjectSessions: (projectId: string) => Session[]

  // Message management
  addMessage: (sessionId: string, message: Message) => void
  updateMessageContent: (sessionId: string, messageId: string, content: string) => void
  updateMessage: (sessionId: string, messageId: string, updates: { content?: string; parts?: MessagePart[]; isPinned?: boolean }) => void
  updateMessageUsage: (sessionId: string, messageId: string, usage: MessageUsage) => void
  getActiveMessages: (projectId: string) => Message[]

  // Undo/Redo/Fork
  undoLastExchange: (sessionId: string) => boolean
  redoLastExchange: (sessionId: string) => boolean
  forkSession: (sessionId: string, upToMessageId: string) => Session | null
  removeLastMessages: (sessionId: string, count: number) => Message[]
  /** Remove all messages after the given messageId (inclusive of everything after) */
  truncateAfterMessage: (sessionId: string, messageId: string) => void

  // Convenience
  getActiveSession: (projectId: string) => Session | undefined
  getActiveSessionId: (projectId: string) => string | null
  startNewChat: (projectId: string) => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionIdByProject: {},
      _undoBuffer: {},

      createSession: (projectId, title) => {
        const session: Session = {
          id: crypto.randomUUID(),
          projectId,
          title: title || `New session`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        }
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionIdByProject: {
            ...s.activeSessionIdByProject,
            [projectId]: session.id,
          },
        }))
        return session
      },

      deleteSession: (id) => {
        set((s) => {
          const session = s.sessions.find((sess) => sess.id === id)
          const newMap = { ...s.activeSessionIdByProject }
          if (session && newMap[session.projectId] === id) {
            newMap[session.projectId] = null
          }
          return {
            sessions: s.sessions.filter((sess) => sess.id !== id),
            activeSessionIdByProject: newMap,
          }
        })
      },

      renameSession: (id, title) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, title, updatedAt: Date.now() } : sess,
          ),
        }))
      },

      setActiveSession: (id, projectId) =>
        set((s) => ({
          activeSessionIdByProject: {
            ...s.activeSessionIdByProject,
            [projectId]: id,
          },
        })),

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
                  // Auto-title from first user message (strip XML context blocks)
                  title:
                    sess.messages.length === 0 && message.role === "user"
                      ? (() => {
                          const text = message.content
                            .replace(/<terminal[^>]*>[\s\S]*?<\/terminal>\s*/g, "")
                            .replace(/<file[^>]*>[\s\S]*?<\/file>\s*/g, "")
                            .replace(/\[Image:[^\]]*\]\s*/g, "")
                            .trim() || "New session"
                          return text.slice(0, 50) + (text.length > 50 ? "..." : "")
                        })()
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

      updateMessageUsage: (sessionId, messageId, usage) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: sess.messages.map((m) =>
                    m.id === messageId ? { ...m, usage } : m,
                  ),
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
          forkedFrom: { sessionId, messageId: upToMessageId },
        }
        set((s) => ({
          sessions: [forked, ...s.sessions],
          activeSessionIdByProject: {
            ...s.activeSessionIdByProject,
            [forked.projectId]: forked.id,
          },
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

      truncateAfterMessage: (sessionId, messageId) => {
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess
            const idx = sess.messages.findIndex((m) => m.id === messageId)
            if (idx === -1) return sess
            return { ...sess, messages: sess.messages.slice(0, idx + 1), updatedAt: Date.now() }
          }),
        }))
      },

      getActiveMessages: (projectId) => {
        const state = get()
        const activeId = state.activeSessionIdByProject[projectId]
        if (!activeId) return []
        const session = state.sessions.find((s) => s.id === activeId)
        return session?.messages || []
      },

      getActiveSession: (projectId) => {
        const state = get()
        const activeId = state.activeSessionIdByProject[projectId]
        if (!activeId) return undefined
        return state.sessions.find((s) => s.id === activeId)
      },

      getActiveSessionId: (projectId) => {
        return get().activeSessionIdByProject[projectId] ?? null
      },

      startNewChat: (projectId) => {
        const session = get().createSession(projectId)
        set((s) => ({
          activeSessionIdByProject: {
            ...s.activeSessionIdByProject,
            [projectId]: session.id,
          },
        }))
      },
    }),
    {
      name: "exegol-ihe-sessions",
      partialize: (state) => ({
        sessions: state.sessions.slice(0, 50).map(s => ({
          ...s,
          messages: s.messages.slice(-100), // keep last 100 messages per session
        })),
        activeSessionIdByProject: state.activeSessionIdByProject,
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
        // Migrate legacy global activeSessionId → per-project
        if (p?.activeSessionId && !p?.activeSessionIdByProject) {
          const session = p.sessions?.find((s: any) => s.id === p.activeSessionId)
          if (session) {
            p.activeSessionIdByProject = { [session.projectId]: p.activeSessionId }
          } else {
            p.activeSessionIdByProject = {}
          }
          delete p.activeSessionId
        }
        return { ...current, ...p }
      },
    },
  ),
)
