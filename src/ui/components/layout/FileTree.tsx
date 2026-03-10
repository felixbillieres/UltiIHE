import { useState, useRef, useEffect, useCallback } from "react"
import { useProjectStore } from "../../stores/project"
import { useFileStore, type FileEntry } from "../../stores/files"
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react"

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_ROOTS = ["/workspace", "/opt/tools", "/root", "/etc", "/tmp"]

interface DragData {
  sourceContainer: string
  sourcePath: string
  sourceType: "file" | "dir"
  sourceName: string
}

// ── Main FileTree: renders all project containers ───────────────

export function FileTree() {
  const containerIds = useProjectStore((s) => {
    const active = s.projects.find((p) => p.id === s.activeProjectId)
    return active?.containerIds ?? []
  })

  if (containerIds.length === 0) {
    return (
      <div className="p-4 text-xs text-text-weaker text-center font-sans">
        No containers attached
      </div>
    )
  }

  return (
    <div className="text-xs select-none">
      {containerIds.map((cid) => (
        <ContainerSection key={cid} container={cid} />
      ))}
    </div>
  )
}

// ── Container section (collapsible root) ────────────────────────

function ContainerSection({ container }: { container: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const invalidateDir = useFileStore((s) => s.invalidateDir)

  const refresh = () => {
    DEFAULT_ROOTS.forEach((r) => invalidateDir(container, r))
    setRefreshKey((k) => k + 1)
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
        <Server className="w-3 h-3 shrink-0 text-cyan-400" />
        <span className="text-[11px] font-medium text-text-base font-sans truncate flex-1">
          {container}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); refresh() }}
          className="hidden group-hover:block p-0.5 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {!collapsed && (
        <div key={refreshKey}>
          {DEFAULT_ROOTS.map((root) => (
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
    </div>
  )
}

// ── Recursive directory node ────────────────────────────────────

function TreeDir({
  container,
  path,
  name,
  depth,
}: {
  container: string
  path: string
  name: string
  depth: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [dropOver, setDropOver] = useState(false)
  const [creating, setCreating] = useState<"file" | "dir" | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const fetchDirectory = useFileStore((s) => s.fetchDirectory)
  const dirCache = useFileStore((s) => s.dirCache)
  const cacheKey = `${container}:${path}`

  // Sync from cache
  useEffect(() => {
    if (dirCache[cacheKey]) {
      setChildren(dirCache[cacheKey])
    }
  }, [dirCache, cacheKey])

  const toggle = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    setLoading(true)
    const entries = await fetchDirectory(container, path)
    setChildren(entries)
    setLoading(false)
  }

  const reload = async () => {
    useFileStore.getState().invalidateDir(container, path)
    setLoading(true)
    const entries = await fetchDirectory(container, path)
    setChildren(entries)
    setLoading(false)
  }

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? "copy" : "move"
    setDropOver(true)
  }

  const handleDragLeave = () => setDropOver(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropOver(false)

    try {
      const data: DragData = JSON.parse(e.dataTransfer.getData("application/json"))
      if (data.sourcePath === path) return // drop on self

      const dstPath = `${path}/${data.sourceName}`
      const operation = e.ctrlKey || e.metaKey ? "copy" : "move"

      const ok = await useFileStore.getState().transfer(
        data.sourceContainer, data.sourcePath,
        container, dstPath,
        operation as "copy" | "move",
      )
      if (ok) reload()
    } catch {
      // invalid drag data
    }
  }

  const pl = depth * 12 + 4

  return (
    <div>
      {renaming ? (
        <InlineInput
          defaultValue={name}
          depth={depth}
          onConfirm={async (newName) => {
            setRenaming(false)
            if (newName && newName !== name) {
              const parent = path.substring(0, path.lastIndexOf("/")) || "/"
              const ok = await useFileStore.getState().renamePath(container, path, `${parent}/${newName}`)
              if (ok) {
                // Parent will re-fetch — this node may no longer exist
              }
            }
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div
          className={`group flex items-center gap-1 py-[3px] pr-1 cursor-pointer hover:bg-surface-1 transition-colors ${
            dropOver ? "bg-accent/10 ring-1 ring-accent/30" : ""
          }`}
          style={{ paddingLeft: `${pl}px` }}
          onClick={toggle}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          draggable
          onDragStart={(e) => {
            const data: DragData = {
              sourceContainer: container,
              sourcePath: path,
              sourceType: "dir",
              sourceName: name,
            }
            e.dataTransfer.setData("application/json", JSON.stringify(data))
            e.dataTransfer.effectAllowed = "copyMove"
          }}
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

          {/* Hover actions */}
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <ActionBtn icon={FilePlus} title="New file" onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreating("file") }} />
            <ActionBtn icon={FolderPlus} title="New folder" onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreating("dir") }} />
            <ActionBtn icon={Pencil} title="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(true) }} />
            <ActionBtn icon={Trash2} title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }} />
          </div>
        </div>
      )}

      {confirmingDelete && (
        <DeleteConfirm
          name={name}
          depth={depth}
          onConfirm={async () => {
            setConfirmingDelete(false)
            const ok = await useFileStore.getState().deletePath(container, path)
            if (ok) reload()
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {expanded && (
        <div>
          {/* Inline create input */}
          {creating && (
            <InlineInput
              defaultValue=""
              placeholder={creating === "file" ? "filename" : "folder name"}
              depth={depth + 1}
              icon={creating === "file" ? File : Folder}
              onConfirm={async (value) => {
                setCreating(null)
                if (!value) return
                const fullPath = `${path}/${value}`
                const ok = creating === "file"
                  ? await useFileStore.getState().createFile(container, fullPath)
                  : await useFileStore.getState().createDir(container, fullPath)
                if (ok) reload()
              }}
              onCancel={() => setCreating(null)}
            />
          )}

          {children.map((entry) =>
            entry.type === "dir" ? (
              <TreeDir
                key={entry.path}
                container={container}
                path={entry.path}
                name={entry.name}
                depth={depth + 1}
              />
            ) : (
              <TreeFile
                key={entry.path}
                container={container}
                entry={entry}
                depth={depth + 1}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ── File node ───────────────────────────────────────────────────

function TreeFile({
  container,
  entry,
  depth,
}: {
  container: string
  entry: FileEntry
  depth: number
}) {
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const openFile = useFileStore((s) => s.openFile)
  const activeFileId = useFileStore((s) => s.activeFileId)
  const isActive = activeFileId === `${container}:${entry.path}`
  const pl = depth * 12 + 4

  if (renaming) {
    return (
      <InlineInput
        defaultValue={entry.name}
        depth={depth}
        icon={File}
        onConfirm={async (newName) => {
          setRenaming(false)
          if (newName && newName !== entry.name) {
            const parent = entry.path.substring(0, entry.path.lastIndexOf("/")) || "/"
            await useFileStore.getState().renamePath(container, entry.path, `${parent}/${newName}`)
          }
        }}
        onCancel={() => setRenaming(false)}
      />
    )
  }

  return (
    <>
    <div
      className={`group flex items-center gap-1 py-[3px] pr-1 cursor-pointer transition-colors ${
        isActive ? "bg-accent/10 text-text-strong" : "hover:bg-surface-1 text-text-weak"
      }`}
      style={{ paddingLeft: `${pl}px` }}
      onClick={() => openFile(container, entry.path)}
      draggable
      onDragStart={(e) => {
        const data: DragData = {
          sourceContainer: container,
          sourcePath: entry.path,
          sourceType: "file",
          sourceName: entry.name,
        }
        e.dataTransfer.setData("application/json", JSON.stringify(data))
        e.dataTransfer.effectAllowed = "copyMove"
      }}
    >
      <File className="w-3.5 h-3.5 shrink-0 text-text-weaker" />
      <span className="truncate font-sans flex-1">{entry.name}</span>

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <ActionBtn icon={Pencil} title="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(true) }} />
        <ActionBtn icon={Trash2} title="Delete" onClick={(e) => {
          e.stopPropagation()
          setConfirmingDelete(true)
        }} />
      </div>
    </div>
    {confirmingDelete && (
      <DeleteConfirm
        name={entry.name}
        depth={depth}
        onConfirm={async () => {
          setConfirmingDelete(false)
          const ok = await useFileStore.getState().deletePath(container, entry.path)
          if (ok) {
            useFileStore.getState().invalidateDir(
              container,
              entry.path.substring(0, entry.path.lastIndexOf("/")) || "/",
            )
          }
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    )}
    </>
  )
}

// ── Inline text input (create / rename) ─────────────────────────

function InlineInput({
  defaultValue,
  placeholder,
  depth,
  icon: Icon,
  onConfirm,
  onCancel,
}: {
  defaultValue: string
  placeholder?: string
  depth: number
  icon?: React.ComponentType<{ className?: string }>
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => onConfirm(value.trim())

  return (
    <div
      className="flex items-center gap-1 py-[2px] pr-1"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-text-weaker" />}
      <input
        ref={ref}
        className="flex-1 bg-surface-2 border border-accent/50 rounded px-1.5 py-0.5 text-xs font-sans text-text-base outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") onCancel()
        }}
        onBlur={commit}
      />
    </div>
  )
}

// ── Small action button ─────────────────────────────────────────

function ActionBtn({
  icon: Icon,
  title,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      className="p-0.5 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base"
      title={title}
      onClick={onClick}
    >
      <Icon className="w-3 h-3" />
    </button>
  )
}

// ── Inline delete confirmation ───────────────────────────────────

function DeleteConfirm({
  name,
  depth,
  onConfirm,
  onCancel,
}: {
  name: string
  depth: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onCancel])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      if (e.key === "Enter") onConfirm()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onConfirm, onCancel])

  return (
    <div
      ref={ref}
      className="flex items-center gap-1.5 py-[3px] pr-1 bg-red-500/8 border-y border-red-500/20"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <Trash2 className="w-3 h-3 shrink-0 text-red-400" />
      <span className="text-xs font-sans text-text-weak truncate flex-1">
        Delete <span className="text-text-base font-medium">{name}</span>?
      </span>
      <button
        onClick={onConfirm}
        className="px-2 py-0.5 text-[10px] font-sans font-medium rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
      >
        Delete
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-0.5 text-[10px] font-sans font-medium rounded bg-surface-2 text-text-weaker hover:bg-surface-3 hover:text-text-weak transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}
