import { useState, useEffect, useCallback } from "react"
import { useFileStore, type FileEntry } from "../../stores/files"
import { useProjectStore } from "../../stores/project"
import {
  ChevronRight,
  Home,
  FolderOpen,
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileJson,
  Shield,
  Terminal as TerminalIcon,
  Database,
  Settings,
  Key,
  LayoutGrid,
  List,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Search,
  ChevronDown,
  Star,
  Clock,
  Download,
  HardDrive,
  Loader2,
} from "lucide-react"

// ─── File type icon mapping ─────────────────────────────────────

function getFileIcon(name: string, type: "file" | "dir") {
  if (type === "dir") return <Folder className="w-4 h-4 text-amber-400" />

  const ext = name.split(".").pop()?.toLowerCase() || ""
  const lower = name.toLowerCase()

  // Images
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext))
    return <FileImage className="w-4 h-4 text-purple-400" />

  // Video
  if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext))
    return <FileVideo className="w-4 h-4 text-pink-400" />

  // Audio
  if (["mp3", "wav", "ogg", "flac", "aac"].includes(ext))
    return <FileAudio className="w-4 h-4 text-green-400" />

  // Archives
  if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "deb", "rpm"].includes(ext))
    return <FileArchive className="w-4 h-4 text-amber-500" />

  // Code
  if (["js", "jsx", "ts", "tsx", "py", "rb", "rs", "go", "java", "c", "cpp", "h", "cs", "php", "swift", "kt"].includes(ext))
    return <FileCode className="w-4 h-4 text-blue-400" />

  // Markdown / text
  if (["md", "mdx", "rst", "txt", "log"].includes(ext))
    return <FileText className="w-4 h-4 text-text-weak" />

  // JSON / YAML / TOML
  if (["json", "jsonl"].includes(ext))
    return <FileJson className="w-4 h-4 text-yellow-400" />
  if (["yaml", "yml", "toml", "ini", "cfg"].includes(ext))
    return <Settings className="w-4 h-4 text-text-weaker" />

  // Shell / scripts
  if (["sh", "bash", "zsh", "fish", "ps1"].includes(ext))
    return <TerminalIcon className="w-4 h-4 text-green-400" />

  // Database
  if (["sql", "sqlite", "db"].includes(ext))
    return <Database className="w-4 h-4 text-cyan-400" />

  // Spreadsheet / CSV
  if (["csv", "tsv", "xls", "xlsx"].includes(ext))
    return <FileSpreadsheet className="w-4 h-4 text-green-500" />

  // Security / pentest
  if (["pem", "crt", "key", "pub", "ovpn", "conf"].includes(ext))
    return <Key className="w-4 h-4 text-red-400" />
  if (["nse", "xml"].includes(ext) || lower.includes("nmap"))
    return <Shield className="w-4 h-4 text-cyan-400" />

  // Binaries / executables
  if (["bin", "exe", "elf", "so", "dll", "o"].includes(ext))
    return <HardDrive className="w-4 h-4 text-text-weaker" />

  return <File className="w-4 h-4 text-text-weaker" />
}

function getDirIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower === "workspace") return <FolderOpen className="w-4 h-4 text-accent" />
  if (lower === ".git") return <Folder className="w-4 h-4 text-orange-400" />
  if (["node_modules", "venv", "__pycache__", ".cache"].includes(lower))
    return <Folder className="w-4 h-4 text-text-weaker" />
  if (["tools", "bin", "sbin"].includes(lower))
    return <Folder className="w-4 h-4 text-green-400" />
  return <Folder className="w-4 h-4 text-amber-400" />
}

// ─── Sidebar shortcuts ──────────────────────────────────────────

const SIDEBAR_SHORTCUTS = [
  { label: "Workspace", path: "/workspace", icon: Star },
  { label: "Home", path: "/root", icon: Home },
  { label: "Tools", path: "/opt/tools", icon: TerminalIcon },
  { label: "Tmp", path: "/tmp", icon: Clock },
  { label: "Etc", path: "/etc", icon: Settings },
]

// ─── Format helpers ─────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "-"
  const d = new Date(timestamp * 1000)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  if (diffDays === 0) return `Today ${time}`
  if (diffDays === 1) return `Yesterday ${time}`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
}

// ─── Sort helpers ───────────────────────────────────────────────

type SortKey = "name" | "size" | "modified"
type SortDir = "asc" | "desc"

function sortEntries(entries: FileEntry[], key: SortKey, dir: SortDir): FileEntry[] {
  const dirs = entries.filter((e) => e.type === "dir")
  const files = entries.filter((e) => e.type === "file")

  const compare = (a: FileEntry, b: FileEntry) => {
    let cmp = 0
    if (key === "name") cmp = a.name.localeCompare(b.name)
    else if (key === "size") cmp = a.size - b.size
    else cmp = a.modified - b.modified
    return dir === "asc" ? cmp : -cmp
  }

  return [...dirs.sort(compare), ...files.sort(compare)]
}

// ─── FileManager Component ──────────────────────────────────────

interface FileManagerProps {
  containerIds: string[]
}

export function FileManager({ containerIds }: FileManagerProps) {
  const { fetchDirectory, dirCache, loadingDirs, openFile } = useFileStore()

  const [container, setContainer] = useState(containerIds[0] || "")
  const [currentPath, setCurrentPath] = useState("/workspace")
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [history, setHistory] = useState<string[]>(["/workspace"])
  const [historyIdx, setHistoryIdx] = useState(0)

  // Update container when project containers change
  useEffect(() => {
    if (containerIds.length > 0 && !containerIds.includes(container)) {
      setContainer(containerIds[0])
    }
  }, [containerIds, container])

  // Fetch directory on path change
  useEffect(() => {
    if (container) {
      fetchDirectory(container, currentPath)
    }
  }, [container, currentPath, fetchDirectory])

  const cacheKey = `${container}:${currentPath}`
  const entries = dirCache[cacheKey] || []
  const isLoading = loadingDirs.has(cacheKey)

  // Filter
  const filtered = search.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries

  // Sort
  const sorted = sortEntries(filtered, sortKey, sortDir)

  const navigateTo = useCallback(
    (path: string) => {
      const newHistory = history.slice(0, historyIdx + 1)
      newHistory.push(path)
      setHistory(newHistory)
      setHistoryIdx(newHistory.length - 1)
      setCurrentPath(path)
      setSearch("")
    },
    [history, historyIdx],
  )

  const goBack = () => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1)
      setCurrentPath(history[historyIdx - 1])
      setSearch("")
    }
  }

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1)
      setCurrentPath(history[historyIdx + 1])
      setSearch("")
    }
  }

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.type === "dir") {
      navigateTo(entry.path)
    } else {
      openFile(container, entry.path)
    }
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const refresh = () => {
    if (container) fetchDirectory(container, currentPath)
  }

  // Breadcrumb segments
  const pathSegments = currentPath.split("/").filter(Boolean)

  if (containerIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-weaker font-sans">
        No containers in project
      </div>
    )
  }

  return (
    <div className="h-full flex bg-surface-0">
      {/* Sidebar shortcuts */}
      <div className="w-36 shrink-0 border-r border-border-weak flex flex-col py-1.5 overflow-y-auto">
        {/* Container selector */}
        {containerIds.length > 1 && (
          <div className="px-2 pb-1.5 mb-1 border-b border-border-weak">
            <select
              value={container}
              onChange={(e) => {
                setContainer(e.target.value)
                setCurrentPath("/workspace")
                setHistory(["/workspace"])
                setHistoryIdx(0)
              }}
              className="w-full bg-surface-2 border border-border-weak rounded px-1.5 py-0.5 text-[10px] text-text-strong font-sans focus:outline-none focus:border-accent/50"
            >
              {containerIds.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        {SIDEBAR_SHORTCUTS.map((s) => {
          const Icon = s.icon
          const isActive = currentPath === s.path
          return (
            <button
              key={s.path}
              onClick={() => navigateTo(s.path)}
              className={`flex items-center gap-2 px-3 py-1 text-[11px] font-sans transition-colors ${
                isActive
                  ? "text-text-strong bg-surface-2"
                  : "text-text-weak hover:text-text-base hover:bg-surface-1"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Toolbar: navigation + breadcrumbs + search + view toggle */}
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border-weak shrink-0 bg-surface-1">
          {/* Nav buttons */}
          <button
            onClick={goBack}
            disabled={historyIdx <= 0}
            className="p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-text-weaker" />
          </button>
          <button
            onClick={goForward}
            disabled={historyIdx >= history.length - 1}
            className="p-1 rounded hover:bg-surface-2 transition-colors disabled:opacity-30"
          >
            <ArrowRight className="w-3.5 h-3.5 text-text-weaker" />
          </button>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
            <button
              onClick={() => navigateTo("/")}
              className="shrink-0 px-1.5 py-0.5 text-[11px] font-sans text-text-weak hover:text-text-strong hover:bg-surface-2 rounded transition-colors"
            >
              /
            </button>
            {pathSegments.map((seg, i) => {
              const segPath = "/" + pathSegments.slice(0, i + 1).join("/")
              const isLast = i === pathSegments.length - 1
              return (
                <div key={segPath} className="flex items-center shrink-0">
                  <ChevronRight className="w-3 h-3 text-text-weaker" />
                  <button
                    onClick={() => !isLast && navigateTo(segPath)}
                    className={`px-1.5 py-0.5 text-[11px] font-sans rounded transition-colors ${
                      isLast
                        ? "text-text-strong font-medium"
                        : "text-text-weak hover:text-text-strong hover:bg-surface-2"
                    }`}
                  >
                    {seg}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border-weak shrink-0 w-40">
            <Search className="w-3 h-3 text-text-weaker shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter..."
              className="flex-1 bg-transparent text-[11px] text-text-strong font-sans outline-none placeholder-text-weaker min-w-0"
            />
          </div>

          {/* View toggle + refresh */}
          <button
            onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title={viewMode === "list" ? "Grid view" : "List view"}
          >
            {viewMode === "list" ? (
              <LayoutGrid className="w-3.5 h-3.5 text-text-weaker" />
            ) : (
              <List className="w-3.5 h-3.5 text-text-weaker" />
            )}
          </button>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-text-weaker ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {/* Content */}
        {isLoading && sorted.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-text-weaker animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-text-weaker font-sans">
            {search ? "No matches" : "Empty directory"}
          </div>
        ) : viewMode === "list" ? (
          <ListView
            entries={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onClick={handleEntryClick}
          />
        ) : (
          <GridView entries={sorted} onClick={handleEntryClick} />
        )}
      </div>
    </div>
  )
}

// ─── List View ──────────────────────────────────────────────────

function SortHeader({
  label,
  sortKey: currentKey,
  thisKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  thisKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const isActive = currentKey === thisKey
  return (
    <button
      onClick={() => onSort(thisKey)}
      className={`flex items-center gap-0.5 text-[10px] font-sans font-medium uppercase tracking-wide transition-colors ${
        isActive ? "text-text-base" : "text-text-weaker hover:text-text-weak"
      } ${className || ""}`}
    >
      {label}
      {isActive && (
        <ChevronDown
          className={`w-2.5 h-2.5 transition-transform ${sortDir === "asc" ? "" : "rotate-180"}`}
        />
      )}
    </button>
  )
}

function ListView({
  entries,
  sortKey,
  sortDir,
  onSort,
  onClick,
}: {
  entries: FileEntry[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  onClick: (entry: FileEntry) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Column headers */}
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_80px_120px] gap-2 px-3 py-1 bg-surface-1 border-b border-border-weak">
        <SortHeader label="Name" sortKey={sortKey} thisKey="name" sortDir={sortDir} onSort={onSort} />
        <SortHeader label="Size" sortKey={sortKey} thisKey="size" sortDir={sortDir} onSort={onSort} className="justify-end" />
        <SortHeader label="Modified" sortKey={sortKey} thisKey="modified" sortDir={sortDir} onSort={onSort} className="justify-end" />
      </div>

      {entries.map((entry) => (
        <button
          key={entry.path}
          onClick={() => onClick(entry)}
          onDoubleClick={() => onClick(entry)}
          className="w-full grid grid-cols-[1fr_80px_120px] gap-2 px-3 py-1 items-center hover:bg-surface-1 transition-colors group text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            {entry.type === "dir" ? getDirIcon(entry.name) : getFileIcon(entry.name, entry.type)}
            <span className="text-[12px] font-sans text-text-base truncate group-hover:text-text-strong">
              {entry.name}
            </span>
          </div>
          <span className="text-[11px] font-sans text-text-weaker text-right">
            {entry.type === "file" ? formatSize(entry.size) : "-"}
          </span>
          <span className="text-[11px] font-sans text-text-weaker text-right">
            {formatDate(entry.modified)}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Grid View ──────────────────────────────────────────────────

function GridView({
  entries,
  onClick,
}: {
  entries: FileEntry[]
  onClick: (entry: FileEntry) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-1">
        {entries.map((entry) => (
          <button
            key={entry.path}
            onClick={() => onClick(entry)}
            className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg hover:bg-surface-1 transition-colors group"
          >
            <div className="w-10 h-10 flex items-center justify-center">
              {entry.type === "dir" ? (
                <Folder className="w-8 h-8 text-amber-400" />
              ) : (
                <div className="scale-[2]">
                  {getFileIcon(entry.name, entry.type)}
                </div>
              )}
            </div>
            <span className="text-[10px] font-sans text-text-weak group-hover:text-text-base text-center leading-tight max-w-full truncate w-full">
              {entry.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
