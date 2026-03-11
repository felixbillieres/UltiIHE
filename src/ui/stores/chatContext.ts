import { create } from "zustand"

export interface TerminalQuote {
  id: string
  source: "terminal"
  terminalId: string
  terminalName: string
  text: string
  lineCount: number
  comment?: string
  createdAt: number
}

export interface FileQuote {
  id: string
  source: "file"
  container: string
  filePath: string
  fileName: string
  language: string
  text: string
  lineCount: number
  startLine?: number
  comment?: string
  createdAt: number
}

export type Quote = TerminalQuote | FileQuote

interface ChatContextStore {
  quotes: Quote[]
  addQuote: (quote: Omit<TerminalQuote, "id" | "createdAt"> | Omit<FileQuote, "id" | "createdAt">) => void
  removeQuote: (id: string) => void
  clearQuotes: () => void
}

export const useChatContextStore = create<ChatContextStore>()((set) => ({
  quotes: [],

  addQuote: (quote) =>
    set((state) => ({
      quotes: [
        ...state.quotes,
        { ...quote, id: crypto.randomUUID(), createdAt: Date.now() } as Quote,
      ],
    })),

  removeQuote: (id) =>
    set((state) => ({
      quotes: state.quotes.filter((q) => q.id !== id),
    })),

  clearQuotes: () => set({ quotes: [] }),
}))
