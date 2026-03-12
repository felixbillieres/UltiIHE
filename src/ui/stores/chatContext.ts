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

export interface ImageAttachment {
  id: string
  filename: string
  mime: string
  dataUrl: string
  size: number
}

interface ChatContextStore {
  quotes: Quote[]
  images: ImageAttachment[]
  addQuote: (quote: Omit<TerminalQuote, "id" | "createdAt"> | Omit<FileQuote, "id" | "createdAt">) => void
  removeQuote: (id: string) => void
  clearQuotes: () => void
  addImage: (image: Omit<ImageAttachment, "id">) => void
  removeImage: (id: string) => void
  clearImages: () => void
}

const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

export const useChatContextStore = create<ChatContextStore>()((set) => ({
  quotes: [],
  images: [],

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

  addImage: (image) => {
    if (!ALLOWED_MIMES.has(image.mime)) return
    set((state) => ({
      images: [...state.images, { ...image, id: crypto.randomUUID() }],
    }))
  },

  removeImage: (id) =>
    set((state) => ({
      images: state.images.filter((img) => img.id !== id),
    })),

  clearImages: () => set({ images: [] }),
}))
