import { X } from "lucide-react"

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-1 border border-border-weak rounded-xl shadow-2xl w-[360px] p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded hover:bg-surface-2 transition-colors"
        >
          <X className="w-4 h-4 text-text-weaker" />
        </button>

        <div className="text-2xl font-bold text-text-strong font-sans mb-1">
          Exegol IHE
        </div>
        <div className="text-xs text-accent font-sans font-medium mb-3">
          Interactive Hacking Environment
        </div>
        <div className="text-xs text-text-weaker font-sans mb-4">
          v0.1.0
        </div>

        <div className="text-[11px] text-text-weak font-sans mb-4 leading-relaxed">
          AI-native pentest IDE centered on Exegol containers.
          Terminal-first, local-only, built for offensive security.
        </div>

        <div className="text-[10px] text-text-weaker font-sans mb-4">
          Built with React, Hono, AI SDK, xterm.js
        </div>

        <div className="flex items-center justify-center gap-4 text-[11px] font-sans mb-4">
          <a
            href="https://github.com/ThePorgs/Exegol"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Exegol Project
          </a>
        </div>

        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border-weak text-text-base text-xs font-sans font-medium transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
