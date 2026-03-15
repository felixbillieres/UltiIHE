import { useState, useEffect } from "react"
import { useFileStore, type FileEntry, type PinnedPath } from "../../../stores/files"
import { useWorkspaceStore } from "../../../stores/workspace"
import { FileIcon } from "../../files/fileIcons"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Loader2,
  Pin,
  PinOff,
} from "lucide-react"
import { TreeDir, TreeFile } from "./TreeNodes"

// ── Pinned section ──────────────────────────────────────────────

export function PinnedSection({ pins }: { pins: PinnedPath[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const unpinPath = useFileStore((s) => s.unpinPath)
  const openFile = useFileStore((s) => s.openFile)
  const openFileTab = useWorkspaceStore((s) => s.openFileTab)

  return (
    <div className="border-b border-border-weak">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 bg-surface-0 hover:bg-surface-1 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 shrink-0 text-text-weaker" />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0 text-text-weaker" />
        )}
        <Pin className="w-3 h-3 shrink-0 text-accent" />
        <span className="text-[11px] font-medium text-text-base font-sans">
          Pinned
        </span>
        <span className="text-[9px] text-text-weaker font-sans ml-auto">
          {pins.length}
        </span>
      </div>
      {!collapsed && (
        <div>
          {pins.map((pin) => {
            const name = pin.path.split("/").pop() || pin.path
            if (pin.type === "dir") {
              return (
                <PinnedDir key={`${pin.container}:${pin.path}`} pin={pin} />
              )
            }
            return (
              <div
                key={`${pin.container}:${pin.path}`}
                className="group flex items-center gap-1 py-[3px] pr-1 cursor-pointer hover:bg-surface-1"
                style={{ paddingLeft: "16px" }}
                onClick={() => {
                  openFile(pin.container, pin.path)
                  openFileTab(`${pin.container}:${pin.path}`, name, pin.container)
                }}
              >
                <FileIcon filename={name} size="sm" />
                <span className="truncate font-sans text-text-weak flex-1">{name}</span>
                <span className="text-[9px] text-text-weaker font-sans mr-1">{pin.container}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); unpinPath(pin.container, pin.path) }}
                  className="hidden group-hover:block p-0.5 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base"
                  title="Unpin"
                >
                  <PinOff className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Pinned directory (expandable) ─────────────────────────────────

export function PinnedDir({ pin }: { pin: PinnedPath }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const fetchDirectory = useFileStore((s) => s.fetchDirectory)
  const dirCache = useFileStore((s) => s.dirCache)
  const unpinPath = useFileStore((s) => s.unpinPath)

  const name = pin.path.split("/").pop() || pin.path
  const cacheKey = `${pin.container}:${pin.path}`

  useEffect(() => {
    const cached = dirCache[cacheKey]
    if (cached) setChildren(cached)
  }, [dirCache, cacheKey])

  const toggle = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    setLoading(true)
    const entries = await fetchDirectory(pin.container, pin.path)
    setChildren(entries)
    setLoading(false)
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1 py-[3px] pr-1 cursor-pointer hover:bg-surface-1"
        style={{ paddingLeft: "16px" }}
        onClick={toggle}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0 text-text-weaker" />
        ) : expanded ? (
          <ChevronDown className="w-3 h-3 shrink-0 text-text-weaker" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0 text-text-weaker" />
        )}
        {expanded ? (
          <FolderOpen className="w-3.5 h-3.5 shrink-0 text-text-weak" />
        ) : (
          <Folder className="w-3.5 h-3.5 shrink-0 text-text-weak" />
        )}
        <span className="truncate font-sans text-text-weak flex-1">{name}</span>
        <span className="text-[9px] text-text-weaker font-sans mr-1">{pin.container}</span>
        <button
          onClick={(e) => { e.stopPropagation(); unpinPath(pin.container, pin.path) }}
          className="hidden group-hover:block p-0.5 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base"
          title="Unpin"
        >
          <PinOff className="w-3 h-3" />
        </button>
      </div>

      {expanded && (
        <div>
          {children.map((entry) =>
            entry.type === "dir" ? (
              <TreeDir
                key={entry.path}
                container={pin.container}
                path={entry.path}
                name={entry.name}
                depth={1}
              />
            ) : (
              <TreeFile
                key={entry.path}
                container={pin.container}
                entry={entry}
                depth={1}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}
