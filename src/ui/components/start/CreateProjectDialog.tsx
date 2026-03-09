import { useState, useRef, useEffect } from "react"
import { X } from "lucide-react"

interface Props {
  onCreate: (name: string, description?: string) => void
  onClose: () => void
}

export function CreateProjectDialog({ onCreate, onClose }: Props) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), description.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-surface-1 border border-border-base rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-weak">
          <h2 className="text-sm font-medium text-text-strong font-sans">
            New Project
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-3 transition-colors"
          >
            <X className="w-4 h-4 text-text-weak" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-text-weak mb-1.5 font-sans font-medium">
              Project name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HackTheBox - Machine XYZ"
              className="w-full px-3 py-2 text-sm bg-surface-0 border border-border-base rounded-lg text-text-strong placeholder-text-weaker focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors font-sans"
            />
          </div>

          <div>
            <label className="block text-xs text-text-weak mb-1.5 font-sans font-medium">
              Description
              <span className="text-text-weaker ml-1 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Internal pentest for client ACME"
              className="w-full px-3 py-2 text-sm bg-surface-0 border border-border-base rounded-lg text-text-strong placeholder-text-weaker focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors font-sans"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-weak hover:text-text-base rounded-lg hover:bg-surface-2 transition-colors font-sans"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-sans font-medium"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
