import { useState, useRef, useEffect } from "react"
import { useFileStore, type FileEntry } from "../../../stores/files"
import { useWorkspaceStore } from "../../../stores/workspace"
import { FileIcon, DirIcon } from "../../files/fileIcons"
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
  Pin,
  PinOff,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react"
import { toast } from "sonner"
import type { DragData } from "./types"

// ── Recursive directory node ────────────────────────────────────

export function TreeDir({
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
  const pinPath = useFileStore((s) => s.pinPath)
  const unpinPath = useFileStore((s) => s.unpinPath)
  const hidePath = useFileStore((s) => s.hidePath)
  const unhidePath = useFileStore((s) => s.unhidePath)
  const showHidden = useFileStore((s) => s.showHidden)
  const pinned = useFileStore((s) => s.pinnedPaths.some((p) => p.container === container && p.path === path))
  const isDotfile = (name.split("/").pop() || name).startsWith(".")
  const cacheKey = `${container}:${path}`

  // Don't render dotfiles unless showHidden is on
  if (isDotfile && !showHidden) return null

  // Sync from cache — update children whenever cache changes (including re-fetches after hide/unhide)
  useEffect(() => {
    const cached = dirCache[cacheKey]
    if (cached) setChildren(cached)
  }, [dirCache[cacheKey]])

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
              await useFileStore.getState().renamePath(container, path, `${parent}/${newName}`)
            }
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div
          className={`group flex items-center gap-1 py-[3px] pr-1 cursor-pointer hover:bg-surface-1 transition-colors ${
            dropOver ? "bg-accent/10 ring-1 ring-accent/30" : ""
          } ${isDotfile ? "opacity-40" : ""}`}
          style={{ paddingLeft: `${pl}px` }}
          onClick={toggle}
          onContextMenu={(e) => {
            e.preventDefault()
            navigator.clipboard.writeText(path)
            toast.success("Path copied")
          }}
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
          <DirIcon name={name} expanded={expanded} size="sm" />
          <span className="truncate font-sans text-text-weak flex-1">{name}</span>

          {/* Hover actions */}
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <ActionBtn
              icon={pinned ? PinOff : Pin}
              title={pinned ? "Unpin" : "Pin"}
              onClick={(e) => { e.stopPropagation(); pinned ? unpinPath(container, path) : pinPath(container, path, "dir") }}
            />
            <ActionBtn
              icon={isDotfile ? Eye : EyeOff}
              title={isDotfile ? "Unhide" : "Hide"}
              onClick={(e) => { e.stopPropagation(); isDotfile ? unhidePath(container, path) : hidePath(container, path) }}
            />
            <ActionBtn icon={Copy} title="Copy path" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(path); toast.success("Path copied") }} />
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
        <div className="ml-[7px] border-l border-border-weak/30">
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

          {[...children]
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === "dir" ? -1 : 1
              return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            })
            .map((entry) =>
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

export function TreeFile({
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
  const activeFileId = useFileStore((s) => {
    const pid = s._currentProjectId
    return pid ? s.activeFileIdByProject[pid] ?? null : null
  })
  const openFileTab = useWorkspaceStore((s) => s.openFileTab)
  const pinPath = useFileStore((s) => s.pinPath)
  const unpinPath = useFileStore((s) => s.unpinPath)
  const hidePath = useFileStore((s) => s.hidePath)
  const unhidePath = useFileStore((s) => s.unhidePath)
  const showHidden = useFileStore((s) => s.showHidden)
  const pinned = useFileStore((s) => s.pinnedPaths.some((p) => p.container === container && p.path === entry.path))
  const isDotfile = entry.name.startsWith(".")
  const isActive = activeFileId === `${container}:${entry.path}`
  const pl = depth * 12 + 4

  // Don't render dotfiles unless showHidden is on
  if (isDotfile && !showHidden) return null

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
      } ${isDotfile ? "opacity-40" : ""}`}
      style={{ paddingLeft: `${pl}px` }}
      onClick={() => {
        openFile(container, entry.path)
        openFileTab(`${container}:${entry.path}`, entry.name, container)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        navigator.clipboard.writeText(entry.path)
        toast.success("Path copied")
      }}
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
      <FileIcon filename={entry.name} size="sm" />
      <span className="truncate font-sans flex-1">{entry.name}</span>

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <ActionBtn
          icon={pinned ? PinOff : Pin}
          title={pinned ? "Unpin" : "Pin"}
          onClick={(e) => { e.stopPropagation(); pinned ? unpinPath(container, entry.path) : pinPath(container, entry.path, "file") }}
        />
        <ActionBtn
          icon={isDotfile ? Eye : EyeOff}
          title={isDotfile ? "Unhide" : "Hide"}
          onClick={(e) => { e.stopPropagation(); isDotfile ? unhidePath(container, entry.path) : hidePath(container, entry.path) }}
        />
        <ActionBtn icon={Copy} title="Copy path" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(entry.path); toast.success("Path copied") }} />
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

export function InlineInput({
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

export function ActionBtn({
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

export function DeleteConfirm({
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
