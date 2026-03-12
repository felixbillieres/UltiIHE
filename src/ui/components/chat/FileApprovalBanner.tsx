import { useState, useEffect, memo } from "react"
import {
  FileText,
  FilePlus,
  Trash2,
  FolderPlus,
  ChevronDown,
  Check,
  X,
  CheckCheck,
  XCircle,
} from "lucide-react"
import { type PendingToolCall } from "../../stores/toolApproval"

// ── Shiki-powered diff view ──────────────────────────────────────

let highlighterPromise: Promise<any> | null = null
let highlighterInstance: any = null

function getHighlighter() {
  if (highlighterInstance) return Promise.resolve(highlighterInstance)
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(async (shiki) => {
      const hl = await shiki.createHighlighter({
        themes: ["github-dark-default"],
        langs: ["diff"],
      })
      highlighterInstance = hl
      return hl
    })
  }
  return highlighterPromise
}

getHighlighter().catch(() => {})

/** Count additions and deletions in a diff */
function diffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0, deletions = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++
  }
  return { additions, deletions }
}

/** Visual diff stats bar (inspired by OpenCode's DiffChanges) */
function DiffStatsBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions
  if (total === 0) return null

  const BLOCKS = 5
  const addBlocks = total > 0 ? Math.max(additions > 0 ? 1 : 0, Math.round((additions / total) * BLOCKS)) : 0
  const delBlocks = total > 0 ? Math.max(deletions > 0 ? 1 : 0, BLOCKS - addBlocks) : 0

  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono">
      {additions > 0 && <span className="text-emerald-400">+{additions}</span>}
      {deletions > 0 && <span className="text-red-400">-{deletions}</span>}
      <div className="flex gap-px ml-0.5">
        {Array.from({ length: addBlocks }).map((_, i) => (
          <div key={`a${i}`} className="w-1.5 h-2.5 rounded-[1px] bg-emerald-400" />
        ))}
        {Array.from({ length: delBlocks }).map((_, i) => (
          <div key={`d${i}`} className="w-1.5 h-2.5 rounded-[1px] bg-red-400" />
        ))}
        {Array.from({ length: BLOCKS - addBlocks - delBlocks }).map((_, i) => (
          <div key={`e${i}`} className="w-1.5 h-2.5 rounded-[1px] bg-surface-3" />
        ))}
      </div>
    </div>
  )
}

/** Syntax-highlighted diff view using Shiki */
const DiffView = memo(function DiffView({ diff }: { diff: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getHighlighter()
      .then((hl) => {
        if (cancelled) return
        const result = hl.codeToHtml(diff, {
          lang: "diff",
          theme: "github-dark-default",
        })
        if (!cancelled) setHtml(result)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [diff])

  if (html) {
    return (
      <div
        className="max-h-[300px] overflow-y-auto overflow-x-auto scrollbar-thin rounded-lg border border-border-weak [&_pre]:!bg-[#0d1117] [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-[11px] [&_pre]:leading-relaxed [&_code]:!text-[11px] [&_code]:!font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  // Fallback: plain colored diff
  return (
    <div className="max-h-[300px] overflow-y-auto overflow-x-auto scrollbar-thin bg-[#0d1117] rounded-lg border border-border-weak">
      <pre className="text-[11px] font-mono leading-relaxed">
        {diff.split("\n").map((line, i) => {
          let cls = "px-3 py-0 text-text-weak"
          if (line.startsWith("+++") || line.startsWith("---")) cls = "px-3 py-0 text-text-weaker"
          else if (line.startsWith("@@")) cls = "px-3 py-0.5 text-cyan-400/70 bg-cyan-400/5"
          else if (line.startsWith("+")) cls = "px-3 py-0 text-emerald-400 bg-emerald-400/8"
          else if (line.startsWith("-")) cls = "px-3 py-0 text-red-400 bg-red-400/8"
          return <div key={i} className={cls}>{line}</div>
        })}
      </pre>
    </div>
  )
})

// ── Single file approval item ────────────────────────────────────

function FileApprovalItem({
  tool,
  onApprove,
  onDeny,
}: {
  tool: PendingToolCall
  onApprove: () => void
  onDeny: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const isDelete = tool.toolName === "file_delete"
  const isCreateDir = tool.toolName === "file_create_dir"

  const filePath = (tool.args.filePath || tool.args.targetPath || tool.args.dirPath || "") as string
  const container = (tool.args.container || "") as string
  const filename = filePath.split("/").pop() || filePath

  const icon = isDelete ? (
    <Trash2 className="w-3.5 h-3.5 text-red-400" />
  ) : isCreateDir ? (
    <FolderPlus className="w-3.5 h-3.5 text-yellow-400" />
  ) : tool.isNewFile ? (
    <FilePlus className="w-3.5 h-3.5 text-emerald-400" />
  ) : (
    <FileText className="w-3.5 h-3.5 text-blue-400" />
  )

  const actionLabel = isDelete
    ? "DELETE"
    : isCreateDir
      ? "MKDIR"
      : tool.isNewFile
        ? "CREATE"
        : "MODIFY"

  const actionColor = isDelete
    ? "text-red-400"
    : isCreateDir
      ? "text-yellow-400"
      : tool.isNewFile
        ? "text-emerald-400"
        : "text-blue-400"

  const stats = tool.diff ? diffStats(tool.diff) : null

  return (
    <div className="border border-border-weak rounded-lg overflow-hidden bg-surface-0/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-1/50">
        {icon}
        <span className={`text-[10px] font-sans font-bold uppercase tracking-wider ${actionColor}`}>
          {actionLabel}
        </span>
        <span className="text-[11px] font-mono text-text-base truncate flex-1">{filename}</span>

        {stats && <DiffStatsBar additions={stats.additions} deletions={stats.deletions} />}

        {/* Expand/collapse */}
        {tool.diff && tool.diff !== "(no changes)" && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 rounded hover:bg-surface-2 transition-colors"
          >
            <ChevronDown
              className={`w-3 h-3 text-text-weaker transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}

        {/* Per-file actions */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <button
            onClick={onDeny}
            className="p-1 rounded hover:bg-red-400/15 text-text-weaker hover:text-red-400 transition-colors"
            title="Deny"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onApprove}
            className="p-1 rounded hover:bg-emerald-400/15 text-text-weaker hover:text-emerald-400 transition-colors"
            title="Accept"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Path */}
      <div className="px-3 py-1 border-t border-border-weak/50">
        <span className="text-[10px] font-mono text-text-weaker truncate block">
          {container}:{filePath}
        </span>
      </div>

      {/* Diff view */}
      {expanded && tool.diff && tool.diff !== "(no changes)" && (
        <div className="px-2 pb-2">
          <DiffView diff={tool.diff} />
        </div>
      )}
    </div>
  )
}

// ── Main banner ──────────────────────────────────────────────────

export function FileApprovalBanner({
  tools,
  onApprove,
  onApproveAlways,
  onDeny,
  onApproveAll,
  onDenyAll,
}: {
  tools: PendingToolCall[]
  onApprove: (id: string) => void
  onApproveAlways: (id: string) => void
  onDeny: (id: string) => void
  onApproveAll: () => void
  onDenyAll: () => void
}) {
  const [groupExpanded, setGroupExpanded] = useState(false)

  if (tools.length === 0) return null

  const totalStats = tools.reduce(
    (acc, t) => {
      if (t.diff) {
        const s = diffStats(t.diff)
        acc.additions += s.additions
        acc.deletions += s.deletions
      }
      return acc
    },
    { additions: 0, deletions: 0 },
  )

  return (
    <div className="shrink-0 border-t border-blue-400/20 bg-surface-1/80 backdrop-blur-sm">
      <div className="px-3 pt-2.5 pb-2">
        {/* Header — clickable to toggle group */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setGroupExpanded(!groupExpanded)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ChevronDown className={`w-3 h-3 text-blue-400 shrink-0 transition-transform ${groupExpanded ? "rotate-0" : "-rotate-90"}`} />
            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-text-strong font-sans">
              {tools.length} file change{tools.length > 1 ? "s" : ""}
            </span>
            <DiffStatsBar additions={totalStats.additions} deletions={totalStats.deletions} />
          </button>

          {/* Batch actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onDenyAll}
              className="flex items-center gap-1 text-[11px] font-sans px-2 py-1 rounded-md text-text-weaker hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <XCircle className="w-3 h-3" />
              Deny all
            </button>
            <button
              onClick={onApproveAll}
              className="flex items-center gap-1 text-[11px] font-sans font-medium px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Accept all
            </button>
          </div>
        </div>

        {/* File cards — only shown when group expanded */}
        {groupExpanded && (
          <div className="space-y-1.5 max-h-[450px] overflow-y-auto scrollbar-thin mt-2">
            {tools.map((tool) => (
              <FileApprovalItem
                key={tool.id}
                tool={tool}
                onApprove={() => onApprove(tool.id)}
                onDeny={() => onDeny(tool.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resolved files summary ────────────────────────────────────────

export function ResolvedFilesSummary({
  resolved,
}: {
  resolved: { id: string; resolution: "approved" | "denied"; toolName: string; args: Record<string, unknown>; diff?: string }[]
}) {
  if (resolved.length === 0) return null

  const approved = resolved.filter((r) => r.resolution === "approved").length
  const denied = resolved.filter((r) => r.resolution === "denied").length

  const totalStats = resolved.reduce(
    (acc, t) => {
      if (t.diff) {
        const s = diffStats(t.diff)
        acc.additions += s.additions
        acc.deletions += s.deletions
      }
      return acc
    },
    { additions: 0, deletions: 0 },
  )

  return (
    <div className="shrink-0 px-3 py-1.5 border-t border-border-weak/50 bg-surface-0/30">
      <div className="flex items-center gap-2 text-[11px] text-text-weaker font-sans">
        <Check className="w-3 h-3 text-emerald-400/60" />
        <span>{resolved.length} file operation{resolved.length > 1 ? "s" : ""}</span>
        <DiffStatsBar additions={totalStats.additions} deletions={totalStats.deletions} />
        {approved > 0 && <span className="text-emerald-400/70">{approved} accepted</span>}
        {denied > 0 && <span className="text-red-400/70">{denied} denied</span>}
      </div>
    </div>
  )
}
