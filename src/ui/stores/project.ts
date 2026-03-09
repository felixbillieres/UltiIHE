import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface Project {
  id: string
  name: string
  description?: string
  containerName?: string
  createdAt: number
  updatedAt: number
}

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  createProject: (name: string, description?: string) => Project
  deleteProject: (id: string) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  setActiveProject: (id: string | null) => void
  getProject: (id: string) => Project | undefined
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name, description) => {
        const project: Project = {
          id: crypto.randomUUID(),
          name,
          description,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({ projects: [...s.projects, project] }))
        return project
      },

      deleteProject: (id) => {
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
        }))
      },

      updateProject: (id, updates) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p,
          ),
        }))
      },

      setActiveProject: (id) => set({ activeProjectId: id }),

      getProject: (id) => get().projects.find((p) => p.id === id),
    }),
    { name: "ultiIHE-projects" },
  ),
)
