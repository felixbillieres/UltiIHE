import { useProjectStore } from "../../stores/project"
import { useFileStore } from "../../stores/files"
import { Eye, EyeOff } from "lucide-react"
import { PinnedSection } from "./filetree/PinnedSection"
import { HostSection } from "./filetree/HostBrowser"
import { ContainerSection } from "./filetree/ContainerSection"

// ── Main FileTree: renders all project containers ───────────────

export function FileTree() {
  const containerIds = useProjectStore((s) => {
    const active = s.projects.find((p) => p.id === s.activeProjectId)
    return active?.containerIds ?? []
  })
  const pinnedPaths = useFileStore((s) => s.pinnedPaths)
  const showHidden = useFileStore((s) => s.showHidden)
  const toggleShowHidden = useFileStore((s) => s.toggleShowHidden)

  if (containerIds.length === 0) {
    return (
      <div className="p-4 text-xs text-text-weaker text-center font-sans">
        No containers attached
      </div>
    )
  }

  // Filter pinned to containers in this project
  const projectPins = pinnedPaths.filter((p) => containerIds.includes(p.container))

  return (
    <div className="text-xs select-none">
      {/* Header with hide toggle */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border-weak">
        <span className="text-[10px] text-text-weaker font-sans font-medium uppercase tracking-wide">
          Files
        </span>
        <button
          onClick={toggleShowHidden}
          className={`p-0.5 rounded transition-colors ${
            showHidden ? "text-accent" : "text-text-weaker hover:text-text-weak"
          }`}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
        >
          {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
      </div>

      {/* Pinned section */}
      {projectPins.length > 0 && (
        <PinnedSection pins={projectPins} />
      )}

      {/* Host directories */}
      <HostSection />

      {/* Container sections */}
      {containerIds.map((cid) => (
        <ContainerSection key={cid} container={cid} />
      ))}
    </div>
  )
}
