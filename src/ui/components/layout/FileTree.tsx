import { useState } from "react"
import { useContainerStore } from "../../stores/container"
import { useFileStore } from "../../stores/files"
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  Loader2,
} from "lucide-react"

interface FileEntry {
  name: string
  path: string
  type: "file" | "dir"
  size: number
  modified: number
}

export function FileTree() {
  const container = useContainerStore((s) => s.getActiveContainer())
  const [entries, setEntries] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())

  const roots = ["/workspace", "/opt/tools", "/root", "/etc", "/tmp"]

  async function loadDir(path: string) {
    if (!container) return
    setLoading((s) => new Set(s).add(path))
    try {
      const res = await fetch(
        `/api/files/${container.name}/list?path=${encodeURIComponent(path)}`,
      )
      const data = await res.json()
      setEntries((prev) => ({ ...prev, [path]: data.entries || [] }))
    } catch {
      // ignore
    }
    setLoading((s) => {
      const next = new Set(s)
      next.delete(path)
      return next
    })
  }

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        if (!entries[path]) loadDir(path)
      }
      return next
    })
  }

  if (!container) {
    return (
      <div className="p-4 text-xs text-text-weaker text-center">
        No container selected
      </div>
    )
  }

  return (
    <div className="p-2 text-xs">
      <div className="px-2 py-1.5 text-text-weaker uppercase tracking-wider text-[10px] mb-1">
        {container.name}
      </div>
      {roots.map((root) => (
        <DirNode
          key={root}
          path={root}
          name={root}
          entries={entries}
          expanded={expanded}
          loading={loading}
          toggleDir={toggleDir}
          loadDir={loadDir}
          depth={0}
          containerName={container.name}
        />
      ))}
    </div>
  )
}

function DirNode({
  path,
  name,
  entries,
  expanded,
  loading,
  toggleDir,
  loadDir,
  depth,
  containerName,
}: {
  path: string
  name: string
  entries: Record<string, FileEntry[]>
  expanded: Set<string>
  loading: Set<string>
  toggleDir: (path: string) => void
  loadDir: (path: string) => void
  depth: number
  containerName: string
}) {
  const isExpanded = expanded.has(path)
  const isLoading = loading.has(path)
  const children = entries[path] || []
  const openFile = useFileStore((s) => s.openFile)

  return (
    <div>
      <div
        onClick={() => toggleDir(path)}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-2 cursor-pointer text-text-weak hover:text-text-base transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        ) : isExpanded ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        <Folder className="w-3.5 h-3.5 text-text-weak shrink-0" />
        <span className="truncate font-sans">{name}</span>
      </div>
      {isExpanded && (
        <div>
          {children.map((entry) =>
            entry.type === "dir" ? (
              <DirNode
                key={entry.path}
                path={entry.path}
                name={entry.name}
                entries={entries}
                expanded={expanded}
                loading={loading}
                toggleDir={toggleDir}
                loadDir={loadDir}
                depth={depth + 1}
                containerName={containerName}
              />
            ) : (
              <div
                key={entry.path}
                onClick={() => openFile(containerName, entry.path)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-2 cursor-pointer text-text-weak hover:text-text-base transition-colors"
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              >
                <File className="w-3.5 h-3.5 text-text-weaker shrink-0" />
                <span className="truncate font-sans">{entry.name}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
