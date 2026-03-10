import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface Project {
  id: string
  name: string
  description?: string
  /** Container names associated with this project */
  containerIds: string[]
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
  addContainerToProject: (projectId: string, containerName: string) => void
  removeContainerFromProject: (projectId: string, containerName: string) => void
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
          containerIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({ projects: [...s.projects, project] }))
        return project
      },

      deleteProject: (id) => {
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeProjectId:
            s.activeProjectId === id ? null : s.activeProjectId,
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

      addContainerToProject: (projectId, containerName) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId && !p.containerIds.includes(containerName)
              ? {
                  ...p,
                  containerIds: [...p.containerIds, containerName],
                  updatedAt: Date.now(),
                }
              : p,
          ),
        }))
      },

      removeContainerFromProject: (projectId, containerName) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  containerIds: p.containerIds.filter(
                    (c) => c !== containerName,
                  ),
                  updatedAt: Date.now(),
                }
              : p,
          ),
        }))
      },
    }),
    {
      name: "ultiIHE-projects",
      // Migrate old projects that have containerName instead of containerIds
      merge: (persisted, current) => {
        const p = persisted as any
        if (p?.projects) {
          p.projects = p.projects.map((proj: any) => ({
            ...proj,
            containerIds: proj.containerIds ?? (proj.containerName ? [proj.containerName] : []),
          }))
        }
        return { ...current, ...p }
      },
    },
  ),
)
