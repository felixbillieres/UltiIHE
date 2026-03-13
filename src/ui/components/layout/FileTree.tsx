import { useState, useRef, useEffect, useCallback } from "react"
import { useProjectStore } from "../../stores/project"
import { useFileStore, type FileEntry, type PinnedPath } from "../../stores/files"
import { useWorkspaceStore } from "../../stores/workspace"
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
  Pin,
  PinOff,
  Eye,
  EyeOff,
  Settings2,
  X,
  Plus,
  HardDrive,
  FolderMinus,
} from "lucide-react"

// ── Constants ───────────────────────────────────────────────────

const ALL_ROOTS = ["/workspace", "/opt/tools", "/root", "/etc", "/tmp"]
const EMPTY_STRINGS: string[] = []

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

// ── Pinned section ──────────────────────────────────────────────

function PinnedSection({ pins }: { pins: PinnedPath[] }) {
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
                <File className="w-3.5 h-3.5 shrink-0 text-text-weaker" />
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

function PinnedDir({ pin }: { pin: PinnedPath }) {
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

// ── Host section ──────────────────────────────────────────────────

function HostSection() {
  const [collapsed, setCollapsed] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const hostDirectories = useFileStore((s) => {
    const pid = s._currentProjectId || ""
    return s.hostDirectoriesByProject[pid] ?? EMPTY_STRINGS
  })
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

function HostBrowserModal({ onClose }: { onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState("/home")
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [manualPath, setManualPath] = useState("")
  const addHostDirectory = useFileStore((s) => s.addHostDirectory)
  const hostDirectories = useFileStore((s) => {
    const pid = s._currentProjectId || ""
    return s.hostDirectoriesByProject[pid] ?? EMPTY_STRINGS
  })

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

function HostDir({ path, onRemove }: { path: string; onRemove: () => void }) {
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
          {children.map((entry) =>
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

function HostTreeDir({ path, name, depth }: { path: string; name: string; depth: number }) {
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
          {children.map((entry) =>
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

function HostTreeFile({ entry, depth }: { entry: FileEntry; depth: number }) {
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
        <File className="w-3.5 h-3.5 shrink-0 text-text-weaker" />
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

// ── Container section (collapsible root) ────────────────────────

function ContainerSection({ container }: { container: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showRootsModal, setShowRootsModal] = useState(false)
  const invalidateDir = useFileStore((s) => s.invalidateDir)
  const getVisibleRoots = useFileStore((s) => s.getVisibleRoots)
  const visibleRoots = getVisibleRoots(container)

  const refresh = () => {
    visibleRoots.forEach((r) => invalidateDir(container, r))
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
        <div key={refreshKey}>
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

function VisibleRootsModal({ container, onClose }: { container: string; onClose: () => void }) {
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
