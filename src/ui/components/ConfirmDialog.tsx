import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle } from "lucide-react"

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      // Focus the cancel-safe confirm button after a tick
      setTimeout(() => confirmRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative bg-surface-1 border border-border-weak rounded-xl shadow-2xl max-w-sm w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10 shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-sans font-semibold text-text-strong">
              {title}
            </h3>
            <p className="text-xs text-text-weak font-sans mt-1 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-sans text-text-weak hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
