import { create } from "zustand"

// ── Types ────────────────────────────────────────────────────────

export interface TerminalMatch {
  line: string
  lineIndex: number
  column: number
}

export interface TerminalSearchResult {
  terminalId: string
  terminalName: string
  container: string
  matches: TerminalMatch[]
  matchCount: number
}

export interface FileMatch {
  line: string
  lineNumber: number
  column: number
}

export interface FileSearchResult {
  container: string
  filePath: string
  matches: FileMatch[]
  matchCount: number
}

export type SearchScope = "terminals" | "files"

// ── Mini panel for terminal search results ───────────────────────

export interface SearchMiniPanel {
  type: "terminal"
  query: string
  terminalId: string
  container: string
  currentMatch: number
  totalMatches: number
  /** Incremented on each prev/next to trigger effects in subscribers */
  _navSeq: number
  /** Direction of the last navigation */
  _navDir: "next" | "prev"
}

// ── Pending file search (deferred until editor mounts) ───────────

export interface PendingFileSearch {
  fileId: string
  query: string
}

// ── Store ────────────────────────────────────────────────────────

interface SearchStore {
  // Full search dialog
  isOpen: boolean
  query: string
  scopes: SearchScope[]
  terminalResults: TerminalSearchResult[]
  fileResults: FileSearchResult[]
  loading: boolean
  selectedIndex: number

  // Mini panel (terminal only)
  miniPanel: SearchMiniPanel | null

  // Pending file search (consumed by FileEditorPane on editor mount)
  pendingFileSearch: PendingFileSearch | null

  // Full dialog actions
  open: () => void
  close: () => void
  setQuery: (q: string) => void
  toggleScope: (scope: SearchScope) => void
  search: (query: string, containers: string[]) => Promise<void>
  setSelectedIndex: (index: number) => void

  // Mini panel actions (terminal only)
  openMiniPanel: (config: Pick<SearchMiniPanel, "type" | "query" | "terminalId" | "container">) => void
  closeMiniPanel: () => void
  nextMatch: () => void
  prevMatch: () => void
  setMatchInfo: (current: number, total: number) => void

  // File search actions
  setPendingFileSearch: (fileId: string, query: string) => void
  clearPendingFileSearch: () => void
}

let searchAbort: AbortController | null = null

export const useSearchStore = create<SearchStore>()((set, get) => ({
  isOpen: false,
  query: "",
  scopes: ["terminals", "files"],
  terminalResults: [],
  fileResults: [],
  loading: false,
  selectedIndex: 0,
  miniPanel: null,
  pendingFileSearch: null,

  open: () => set({
    isOpen: true,
    query: "",
    terminalResults: [],
    fileResults: [],
    selectedIndex: 0,
    miniPanel: null,
    pendingFileSearch: null,
  }),

  close: () => {
    if (searchAbort) { searchAbort.abort(); searchAbort = null }
    set({ isOpen: false, query: "", terminalResults: [], fileResults: [], selectedIndex: 0 })
  },

  setQuery: (q) => set({ query: q, selectedIndex: 0 }),

  toggleScope: (scope) =>
    set((s) => {
      const has = s.scopes.includes(scope)
      if (has && s.scopes.length === 1) return s
      return { scopes: has ? s.scopes.filter((sc) => sc !== scope) : [...s.scopes, scope] }
    }),

  search: async (query, containers) => {
    if (searchAbort) searchAbort.abort()
    if (!query.trim()) {
      set({ terminalResults: [], fileResults: [], loading: false })
      return
    }

    const abort = new AbortController()
    searchAbort = abort
    set({ loading: true })

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, scopes: get().scopes, containers }),
        signal: abort.signal,
      })
      if (abort.signal.aborted) return
      const data = await res.json()
      set({ terminalResults: data.terminals || [], fileResults: data.files || [], loading: false })
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        set({ loading: false })
      }
    }
  },

  setSelectedIndex: (index) => set({ selectedIndex: index }),

  // ── Mini panel (terminal) ──────────────────────────────────────

  openMiniPanel: (config) =>
    set({
      miniPanel: {
        ...config,
        currentMatch: 0,
        totalMatches: 0,
        _navSeq: 0,
        _navDir: "next",
      } as SearchMiniPanel,
    }),

  closeMiniPanel: () => set({ miniPanel: null }),

  nextMatch: () =>
    set((s) => {
      if (!s.miniPanel) return s
      return {
        miniPanel: {
          ...s.miniPanel,
          _navSeq: s.miniPanel._navSeq + 1,
          _navDir: "next" as const,
        },
      }
    }),

  prevMatch: () =>
    set((s) => {
      if (!s.miniPanel) return s
      return {
        miniPanel: {
          ...s.miniPanel,
          _navSeq: s.miniPanel._navSeq + 1,
          _navDir: "prev" as const,
        },
      }
    }),

  setMatchInfo: (current, total) =>
    set((s) => {
      if (!s.miniPanel) return s
      return {
        miniPanel: { ...s.miniPanel, currentMatch: current, totalMatches: total },
      }
    }),

  // ── Pending file search ────────────────────────────────────────

  setPendingFileSearch: (fileId, query) =>
    set({ pendingFileSearch: { fileId, query } }),

  clearPendingFileSearch: () =>
    set({ pendingFileSearch: null }),
}))
