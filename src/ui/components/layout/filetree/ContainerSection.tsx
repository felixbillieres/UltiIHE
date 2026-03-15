import { useState } from "react"
import { useFileStore } from "../../../stores/files"
import {
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Server,
  Settings2,
  X,
  Plus,
} from "lucide-react"
import { ALL_ROOTS } from "./constants"
import { TreeDir } from "./TreeNodes"

// ── Container section (collapsible root) ────────────────────────

export function ContainerSection({ container }: { container: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [showRootsModal, setShowRootsModal] = useState(false)
  const invalidateDir = useFileStore((s) => s.invalidateDir)
  const fetchDirectory = useFileStore((s) => s.fetchDirectory)
  const getVisibleRoots = useFileStore((s) => s.getVisibleRoots)
  const visibleRoots = getVisibleRoots(container)

  const refresh = async () => {
    // Invalidate + re-fetch all cached dirs for this container
    // This updates dirCache in-place, so expanded TreeDirs re-render
    // with new data WITHOUT losing their expansion state
    const cache = useFileStore.getState().dirCache
    for (const key of Object.keys(cache)) {
      if (key.startsWith(container + ":")) {
        const path = key.substring(container.length + 1)
        invalidateDir(container, path)
        fetchDirectory(container, path)
      }
    }
  }

  return (
    <div className="border-b border-border-weak last:border-b-0">
      {/* Container header */}
      <div
        className="group flex items-center gap-1.5 px-2 py-1.5 bg-surface-0 hover:bg-surface-1 cursor-pointer sticky top-0 z-10"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 shrink-0 text-text-weaker" />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0 text-text-weaker" />
        )}
        <Server className="w-3 h-3 shrink-0 text-accent" />
        <span className="text-[11px] font-medium text-text-base font-sans truncate flex-1">
          {container}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowRootsModal(true) }}
          className="hidden group-hover:block p-0.5 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base"
          title="Manage visible directories"
        >
          <Settings2 className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); refresh() }}
          className="hidden group-hover:block p-0.5 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {!collapsed && (
        <div>
          {visibleRoots.map((root) => (
            <TreeDir
              key={root}
              container={container}
              path={root}
              name={root}
              depth={0}
            />
          ))}
        </div>
      )}

      {showRootsModal && (
        <VisibleRootsModal
          container={container}
          onClose={() => setShowRootsModal(false)}
        />
      )}
    </div>
  )
}

// ── Visible Roots Modal ─────────────────────────────────────────

export function VisibleRootsModal({ container, onClose }: { container: string; onClose: () => void }) {
  const getVisibleRoots = useFileStore((s) => s.getVisibleRoots)
  const setVisibleRoots = useFileStore((s) => s.setVisibleRoots)
  const addVisibleRoot = useFileStore((s) => s.addVisibleRoot)
  const removeVisibleRoot = useFileStore((s) => s.removeVisibleRoot)
  const visibleRoots = getVisibleRoots(container)
  const [customPath, setCustomPath] = useState("")

  const handleToggle = (root: string) => {
    if (visibleRoots.includes(root)) {
      removeVisibleRoot(container, root)
    } else {
      addVisibleRoot(container, root)
    }
  }

  const handleAddCustom = () => {
    const path = customPath.trim()
    if (path && path.startsWith("/") && !visibleRoots.includes(path)) {
      addVisibleRoot(container, path)
      setCustomPath("")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-1 border border-border-base rounded-lg shadow-xl w-80 max-h-[400px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-weak">
          <span className="text-sm font-sans font-medium text-text-strong">
            Visible directories
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-2">
            <X className="w-4 h-4 text-text-weaker" />
          </button>
        </div>

        <div className="px-4 py-2 text-[11px] text-text-weak font-sans">
          Container: <span className="text-text-base font-medium">{container}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {ALL_ROOTS.map((root) => (
            <label
              key={root}
              className="flex items-center gap-2 py-1 cursor-pointer hover:bg-surface-2 -mx-2 px-2 rounded"
            >
              <input
                type="checkbox"
                checked={visibleRoots.includes(root)}
                onChange={() => handleToggle(root)}
                className="accent-[#8957e5] w-3.5 h-3.5"
              />
              <span className="text-xs font-mono text-text-base">{root}</span>
            </label>
          ))}

          {/* Custom roots added by user */}
          {visibleRoots
            .filter((r) => !ALL_ROOTS.includes(r))
            .map((root) => (
              <label
                key={root}
                className="flex items-center gap-2 py-1 cursor-pointer hover:bg-surface-2 -mx-2 px-2 rounded"
              >
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => handleToggle(root)}
                  className="accent-[#8957e5] w-3.5 h-3.5"
                />
                <span className="text-xs font-mono text-text-base">{root}</span>
              </label>
            ))}
        </div>

        {/* Add custom path */}
        <div className="px-4 py-3 border-t border-border-weak">
          <div className="flex items-center gap-1.5">
            <input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
              placeholder="/custom/path"
              className="flex-1 bg-surface-2 border border-border-weak rounded px-2 py-1 text-xs font-mono text-text-base outline-none focus:border-accent/50"
            />
            <button
              onClick={handleAddCustom}
              className="px-2 py-1 rounded bg-accent/10 text-accent text-xs font-sans hover:bg-accent/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
