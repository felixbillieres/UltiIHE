import { ExternalLink } from "lucide-react"
import { usePopOutStore } from "../../stores/popout"

/**
 * Shown in the main workspace content area when a tab is popped out
 * to a separate window. Allows re-attaching with a single click.
 */
export function PopOutGhost({ tabId, title }: { tabId: string; title: string }) {
  const reattach = usePopOutStore((s) => s.reattach)

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-0">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <ExternalLink className="w-6 h-6 text-accent/60" />
        </div>
        <p className="text-sm text-text-weak font-sans mb-1">
          {title}
        </p>
        <p className="text-xs text-text-weaker font-sans mb-4">
          Opened in a separate window
        </p>
        <button
          onClick={() => reattach(tabId)}
          className="px-4 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 text-xs font-sans font-medium transition-colors"
        >
          Re-attach here
        </button>
      </div>
    </div>
  )
}
