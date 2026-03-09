import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface Session {
  id: string
  projectId: string
  title: string
  agentId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null

  createSession: (projectId: string, title?: string) => Session
  deleteSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  getProjectSessions: (projectId: string) => Session[]
  updateSession: (id: string, updates: Partial<Session>) => void
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
          title: title || `Session - ${new Date().toLocaleString()}`,
          agentId: "build",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0,
        }
        set((s) => ({ sessions: [...s.sessions, session] }))
        return session
      },

      deleteSession: (id) => {
        set((s) => ({
          sessions: s.sessions.filter((s) => s.id !== id),
          activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        }))
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      getProjectSessions: (projectId) =>
        get()
          .sessions.filter((s) => s.projectId === projectId)
          .sort((a, b) => b.updatedAt - a.updatedAt),

      updateSession: (id, updates) => {
        set((s) => ({
          sessions: s.sessions.map((session) =>
            session.id === id
              ? { ...session, ...updates, updatedAt: Date.now() }
              : session,
          ),
        }))
      },
    }),
    { name: "ultiIHE-sessions" },
  ),
)
