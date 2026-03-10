import { create } from "zustand"

export interface TerminalQuote {
  id: string
  terminalId: string
  terminalName: string
  text: string
  lineCount: number
  comment?: string
  createdAt: number
}

interface ChatContextStore {
  quotes: TerminalQuote[]
  addQuote: (quote: Omit<TerminalQuote, "id" | "createdAt">) => void
  removeQuote: (id: string) => void
  clearQuotes: () => void
}

export const useChatContextStore = create<ChatContextStore>()((set) => ({
  quotes: [],

  addQuote: (quote) =>
    set((state) => ({
      quotes: [
        ...state.quotes,
        { ...quote, id: crypto.randomUUID(), createdAt: Date.now() },
      ],
    })),

  removeQuote: (id) =>
    set((state) => ({
      quotes: state.quotes.filter((q) => q.id !== id),
    })),

  clearQuotes: () => set({ quotes: [] }),
}))
