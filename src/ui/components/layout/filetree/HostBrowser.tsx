import { useState, useEffect, useCallback } from "react"
import { useFileStore, type FileEntry } from "../../../stores/files"
import { useWorkspaceStore } from "../../../stores/workspace"
import { FileIcon } from "../../files/fileIcons"
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
  Plus,
  HardDrive,
  FolderMinus,
  X,
} from "lucide-react"
import { EMPTY_STRINGS } from "./constants"
import { ActionBtn, InlineInput, DeleteConfirm } from "./TreeNodes"

// ── Host section ──────────────────────────────────────────────────

export function HostSection() {
  const [collapsed, setCollapsed] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const pid = useFileStore((s) => s._currentProjectId) || ""
  const hostDirMap = useFileStore((s) => s.hostDirectoriesByProject)
  const hostDirectories = hostDirMap[pid] ?? EMPTY_STRINGS
  const removeHostDirectory = useFileStore((s) => s.removeHostDirectory)

  return (
    <div className="border-b border-border-weak">
      <div
        className="group flex items-center gap-1.5 px-2 py-1.5 bg-surface-0 hover:bg-surface-1 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 shrink-0 text-text-weaker" />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0 text-text-weaker" />
        )}
        <HardDrive className="w-3 h-3 shrink-0 text-text-weak" />
        <span className="text-[11px] font-medium text-text-base font-sans">
          Host
        </span>
        {hostDirectories.length > 0 && (
          <span className="text-[9px] text-text-weaker font-sans ml-auto mr-1">
            {hostDirectories.length}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowBrowser(true) }}
          className="hidden group-hover:block p-0.5 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base ml-auto"
          title="Browse host filesystem"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {!collapsed && (
        <div>
          {hostDirectories.length === 0 && (
            <button
              onClick={() => setShowBrowser(true)}
              className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] text-text-weaker hover:text-text-weak font-sans transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add host directory
            </button>
          )}

          {hostDirectories.map((dir) => (
            <HostDir key={dir} path={dir} onRemove={() => removeHostDirectory(dir)} />
          ))}
        </div>
      )}

      {showBrowser && (
        <HostBrowserModal onClose={() => setShowBrowser(false)} />
      )}
    </div>
  )
}

// ── Host browser modal (navigate host FS to pick directories) ────

export function HostBrowserModal({ onClose }: { onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState("/home")
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [manualPath, setManualPath] = useState("")
  const addHostDirectory = useFileStore((s) => s.addHostDirectory)
  const browserPid = useFileStore((s) => s._currentProjectId) || ""
  const browserHostDirMap = useFileStore((s) => s.hostDirectoriesByProject)
  const hostDirectories = browserHostDirMap[browserPid] ?? EMPTY_STRINGS

  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    setCurrentPath(path)
    try {
      const res = await fetch(`/api/files/host/list?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      const dirs = (data.entries || [])
        .filter((e: FileEntry) => e.type === "dir")
        .sort((a: FileEntry, b: FileEntry) => a.name.localeCompare(b.name))
      setEntries(dirs)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDir(currentPath)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const navigateUp = () => {
    const parent = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/"
    loadDir(parent)
  }

  const selectCurrent = () => {
    addHostDirectory(currentPath)
    onClose()
  }

  const handleManualGo = () => {
    const p = manualPath.trim()
    if (p && p.startsWith("/")) {
      loadDir(p)
      setManualPath("")
    }
  }

  const alreadyAdded = hostDirectories.includes(currentPath)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-1 border border-border-base rounded-lg shadow-xl w-96 max-h-[500px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-weak">
          <span className="text-sm font-sans font-medium text-text-strong">
            Browse host filesystem
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-2">
            <X className="w-4 h-4 text-text-weaker" />
          </button>
        </div>

        {/* Path bar */}
        <div className="px-3 py-2 border-b border-border-weak flex items-center gap-1.5">
          <input
            value={manualPath || currentPath}
            onChange={(e) => setManualPath(e.target.value)}
            onFocus={() => { if (!manualPath) setManualPath(currentPath) }}
            onBlur={() => setManualPath("")}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualGo()
              if (e.key === "Escape") setManualPath("")
            }}
            className="flex-1 bg-surface-2 border border-border-weak rounded px-2 py-1 text-xs font-mono text-text-base outline-none focus:border-accent/50"
            placeholder="Type path..."
          />
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto">
          {/* Up button */}
          {currentPath !== "/" && (
            <button
              onClick={navigateUp}
              className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-surface-2 text-text-weak transition-colors"
            >
              <ChevronRight className="w-3 h-3 rotate-180" />
              <span className="text-xs font-sans">..</span>
            </button>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-text-weaker" />
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-4 text-[11px] text-text-weaker font-sans text-center">
              No subdirectories
            </div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => loadDir(entry.path)}
                className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-surface-2 text-text-weak transition-colors"
              >
                <Folder className="w-3.5 h-3.5 shrink-0 text-text-weak" />
                <span className="text-xs font-sans truncate text-left flex-1">{entry.name}</span>
                <ChevronRight className="w-3 h-3 shrink-0 text-text-weaker" />
              </button>
            ))
          )}
        </div>

        {/* Footer — add current directory */}
        <div className="px-4 py-3 border-t border-border-weak flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-text-weaker font-sans">Selected:</div>
            <div className="text-xs font-mono text-text-base truncate">{currentPath}</div>
          </div>
          <button
            onClick={selectCurrent}
            disabled={alreadyAdded}
            className={`px-3 py-1.5 rounded text-xs font-sans font-medium transition-colors shrink-0 ${
              alreadyAdded
                ? "bg-surface-2 text-text-weaker cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-hover"
            }`}
          >
            {alreadyAdded ? "Added" : "Add"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Host directory (expandable, top-level mounted dir) ────────────

export function HostDir({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<"file" | "dir" | null>(null)
  const fetchHostDirectory = useFileStore((s) => s.fetchHostDirectory)
  const dirCache = useFileStore((s) => s.dirCache)

  useEffect(() => {
    const cached = dirCache[`host:${path}`]
    if (cached) setChildren(cached)
  }, [dirCache, path])

  const toggle = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    setLoading(true)
    const entries = await fetchHostDirectory(path)
    setChildren(entries)
    setLoading(false)
  }

  const reload = async () => {
    useFileStore.getState().invalidateHostDir(path)
    setLoading(true)
    const entries = await fetchHostDirectory(path)
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
        <span className="truncate font-mono text-[10px] text-text-weak flex-1">{path}</span>

        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <ActionBtn icon={FilePlus} title="New file" onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreating("file") }} />
          <ActionBtn icon={FolderPlus} title="New folder" onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreating("dir") }} />
          <ActionBtn icon={RefreshCw} title="Refresh" onClick={(e) => { e.stopPropagation(); reload() }} />
          <ActionBtn icon={FolderMinus} title="Remove" onClick={(e) => { e.stopPropagation(); onRemove() }} />
        </div>
      </div>

      {expanded && (
        <div>
          {creating && (
            <InlineInput
              defaultValue=""
              placeholder={creating === "file" ? "filename" : "folder name"}
              depth={0}
              icon={creating === "file" ? File : Folder}
              onConfirm={async (value) => {
                setCreating(null)
                if (!value) return
                const fullPath = `${path}/${value}`
                const ok = creating === "file"
                  ? await useFileStore.getState().createHostFile(fullPath)
                  : await useFileStore.getState().createHostDir(fullPath)
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
                <HostTreeDir key={entry.path} path={entry.path} name={entry.name} depth={1} />
              ) : (
                <HostTreeFile key={entry.path} entry={entry} depth={1} />
              ),
            )}
        </div>
      )}
    </div>
  )
}

// ── Host recursive directory ──────────────────────────────────────

export function HostTreeDir({ path, name, depth }: { path: string; name: string; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<"file" | "dir" | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const fetchHostDirectory = useFileStore((s) => s.fetchHostDirectory)
  const dirCache = useFileStore((s) => s.dirCache)

  useEffect(() => {
    const cached = dirCache[`host:${path}`]
    if (cached) setChildren(cached)
  }, [dirCache, path])

  const toggle = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    setLoading(true)
    const entries = await fetchHostDirectory(path)
    setChildren(entries)
    setLoading(false)
  }

  const reload = async () => {
    useFileStore.getState().invalidateHostDir(path)
    setLoading(true)
    const entries = await fetchHostDirectory(path)
    setChildren(entries)
    setLoading(false)
  }

  const pl = depth * 12 + 16

  if (renaming) {
    return (
      <InlineInput
        defaultValue={name}
        depth={depth}
        onConfirm={async (newName) => {
          setRenaming(false)
          if (newName && newName !== name) {
            const parent = path.substring(0, path.lastIndexOf("/")) || "/"
            await useFileStore.getState().renameHostPath(path, `${parent}/${newName}`)
          }
        }}
        onCancel={() => setRenaming(false)}
      />
    )
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1 py-[3px] pr-1 cursor-pointer hover:bg-surface-1"
        style={{ paddingLeft: `${pl}px` }}
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

        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <ActionBtn icon={FilePlus} title="New file" onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreating("file") }} />
          <ActionBtn icon={FolderPlus} title="New folder" onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreating("dir") }} />
          <ActionBtn icon={Pencil} title="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(true) }} />
          <ActionBtn icon={Trash2} title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }} />
        </div>
      </div>

      {confirmingDelete && (
        <DeleteConfirm
          name={name}
          depth={depth}
          onConfirm={async () => {
            setConfirmingDelete(false)
            await useFileStore.getState().deleteHostPath(path)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {expanded && (
        <div>
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
                  ? await useFileStore.getState().createHostFile(fullPath)
                  : await useFileStore.getState().createHostDir(fullPath)
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
                <HostTreeDir key={entry.path} path={entry.path} name={entry.name} depth={depth + 1} />
              ) : (
                <HostTreeFile key={entry.path} entry={entry} depth={depth + 1} />
              ),
            )}
        </div>
      )}
    </div>
  )
}

// ── Host file node ────────────────────────────────────────────────

export function HostTreeFile({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const openHostFile = useFileStore((s) => s.openHostFile)
  const activeFileId = useFileStore((s) => {
    const pid = s._currentProjectId
    return pid ? s.activeFileIdByProject[pid] ?? null : null
  })
  const openFileTab = useWorkspaceStore((s) => s.openFileTab)
  const isActive = activeFileId === `host:${entry.path}`
  const pl = depth * 12 + 16

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
            await useFileStore.getState().renameHostPath(entry.path, `${parent}/${newName}`)
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
        onClick={() => {
          openHostFile(entry.path)
          openFileTab(`host:${entry.path}`, entry.name, "__host__")
        }}
      >
        <FileIcon filename={entry.name} size="sm" />
        <span className="truncate font-sans flex-1">{entry.name}</span>

        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <ActionBtn icon={Pencil} title="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(true) }} />
          <ActionBtn icon={Trash2} title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }} />
        </div>
      </div>
      {confirmingDelete && (
        <DeleteConfirm
          name={entry.name}
          depth={depth}
          onConfirm={async () => {
            setConfirmingDelete(false)
            await useFileStore.getState().deleteHostPath(entry.path)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  )
}
