import { create } from "zustand"

export interface ExegolContainer {
  id: string
  name: string
  image: string
  state: "running" | "exited" | "paused" | "created"
  status: string
  ports: string[]
}

interface ContainerStore {
  containers: ExegolContainer[]
  activeContainerId: string | null
  loading: boolean
  error: string | null

  fetchContainers: () => Promise<void>
  startContainer: (name: string) => Promise<void>
  stopContainer: (name: string) => Promise<void>
  setActiveContainer: (id: string | null) => void
  getActiveContainer: () => ExegolContainer | undefined
}

export const useContainerStore = create<ContainerStore>()((set, get) => ({
  containers: [],
  activeContainerId: null,
  loading: false,
  error: null,

  fetchContainers: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch("/api/containers")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      set({ containers: data.containers, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  startContainer: async (name) => {
    try {
      const res = await fetch(`/api/containers/${name}/start`, { method: "POST" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await get().fetchContainers()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  stopContainer: async (name) => {
    try {
      const res = await fetch(`/api/containers/${name}/stop`, { method: "POST" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await get().fetchContainers()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  setActiveContainer: (id) => set({ activeContainerId: id }),

  getActiveContainer: () => {
    const { containers, activeContainerId } = get()
    return containers.find((c) => c.id === activeContainerId)
  },
}))
