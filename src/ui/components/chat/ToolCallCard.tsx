import { useState } from "react"
import type { ToolCallPart } from "../../stores/session"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import {
  Terminal,
  FileText,
  FileEdit,
  Search,
  Globe,
  Download,
  FolderPlus,
  Trash2,
  HelpCircle,
  Layers,
  ListChecks,
  Shield,
  Target,
  Play,
  List,
  Plus,
  FolderSearch,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  KeyRound,
  Server,
  type LucideIcon,
} from "lucide-react"

// ── Tool display metadata ──────────────────────────────────

const TOOL_META: Record<string, { name: string; Icon: LucideIcon; color: string }> = {
  terminal_read:    { name: "Read Terminal",    Icon: Terminal,    color: "text-text-weaker" },
  terminal_write:   { name: "Run Command",      Icon: Play,        color: "text-text-weaker" },
  terminal_create:  { name: "Create Terminal",   Icon: Plus,        color: "text-text-weaker" },
  terminal_list:    { name: "List Terminals",    Icon: List,        color: "text-text-weaker" },
  file_read:        { name: "Read File",         Icon: FileText,    color: "text-text-weaker" },
  file_write:       { name: "Write File",        Icon: FileEdit,    color: "text-text-weaker" },
  file_edit:        { name: "Edit File",         Icon: FileEdit,    color: "text-text-weaker" },
  file_delete:      { name: "Delete",            Icon: Trash2,      color: "text-status-error" },
  file_create_dir:  { name: "Create Directory",  Icon: FolderPlus,  color: "text-text-weaker" },
  search_grep:      { name: "Search",            Icon: Search,      color: "text-text-weaker" },
  search_find:      { name: "Find Files",        Icon: FolderSearch, color: "text-text-weaker" },
  web_search:       { name: "Web Search",        Icon: Globe,       color: "text-text-weaker" },
  web_fetch:        { name: "Fetch URL",         Icon: Download,    color: "text-text-weaker" },
  user_question:    { name: "Question",          Icon: HelpCircle,  color: "text-accent" },
  batch:            { name: "Batch Execute",     Icon: Layers,      color: "text-text-weak" },
  todo_read:        { name: "Read TODO",         Icon: ListChecks,  color: "text-text-weak" },
  todo_write:       { name: "Update TODO",       Icon: ListChecks,  color: "text-text-weak" },
  caido_read:       { name: "Caido Read",        Icon: Shield,      color: "text-text-weaker" },
  caido_scope:      { name: "Caido Scope",       Icon: Target,      color: "text-text-weaker" },
  exh_read_creds:   { name: "Read Creds",        Icon: KeyRound,    color: "text-text-weaker" },
  exh_read_hosts:   { name: "Read Hosts",        Icon: Server,      color: "text-text-weaker" },
  exh_read_env:     { name: "Read Env",          Icon: Terminal,    color: "text-text-weaker" },
  exh_add_cred:     { name: "Add Credential",    Icon: KeyRound,    color: "text-text-weaker" },
  exh_add_host:     { name: "Add Host",          Icon: Server,      color: "text-text-weaker" },
}

const DEFAULT_META = { name: "Tool", Icon: Layers, color: "text-text-weak" }

function getToolMeta(tool: string) {
  return TOOL_META[tool] || { ...DEFAULT_META, name: tool }
}

// ── Args summary ──────────────────────────────────────────

function getArgsSummary(tool: string, args: Record<string, any>): string {
  switch (tool) {
    case "terminal_write":
      return args.command || args.input || ""
    case "terminal_read":
      return args.terminalId ? `terminal ${args.terminalId}` : ""
    case "file_read":
    case "file_write":
    case "file_edit":
    case "file_delete":
      return args.filePath || args.path || ""
    case "file_create_dir":
      return args.dirPath || args.path || ""
    case "search_grep":
      return args.pattern ? `"${args.pattern}"` : ""
    case "search_find":
      return args.pattern || args.glob || ""
    case "web_search":
      return args.query || ""
    case "web_fetch":
      return args.url || ""
    default:
      return ""
  }
}

// ── Duration format ────────────────────────────────────────

function formatDuration(startTime: number, endTime?: number): string {
  if (!endTime) return ""
  const ms = endTime - startTime
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── Truncate output for inline display ─────────────────────

function truncateOutput(output: string, maxLines = 15): { text: string; truncated: boolean } {
  const lines = output.split("\n")
  if (lines.length <= maxLines) return { text: output, truncated: false }
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true }
}

// ── Terminal command card (inline output like Cursor) ───────

function TerminalCommandCard({ part, autoRan }: { part: ToolCallPart; autoRan?: boolean }) {
  const [expanded, setExpanded] = useState(part.status === "running")
  const command = part.args?.command || part.args?.input || ""
  const duration = formatDuration(part.startTime, part.endTime)
  const isRunning = part.status === "running"
  const isError = part.status === "error"
  const isCompleted = part.status === "completed"

  // Parse terminal output from tool result
  const output = part.output || ""
  const { text: displayOutput, truncated } = truncateOutput(output)

  const label = autoRan ? "Auto-Ran command" : "Ran command"

  return (
    <div className="my-1.5 rounded-lg border border-border-weak bg-surface-0/50 overflow-hidden">
      {/* Header — Cline-style status dot from CommandOutputRow.tsx */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-1/50 transition-colors text-left"
      >
        {/* Cline-style status dot: green pulsing (running), red (error), green solid (done) */}
        <div className={`rounded-full w-2 h-2 shrink-0 ${
          isRunning ? "bg-status-success animate-pulse"
            : isError ? "bg-status-error"
            : "bg-status-success"
        }`} />
        <span className={`text-[11px] font-sans font-medium shrink-0 ${
          isRunning ? "text-status-success" : "text-text-weaker"
        }`}>
          {isRunning ? "Running" : isError ? "Failed" : label}
        </span>
        <code className="text-[11px] text-text-base font-mono truncate flex-1">{command}</code>
        {duration && <span className="text-[10px] text-text-weaker tabular-nums shrink-0">{duration}</span>}
        {output && (
          <ChevronDown className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* Inline terminal output */}
      {expanded && output && (
        <div className="border-t border-border-weak bg-[#0a0a0a] px-3 py-2 max-h-[300px] overflow-y-auto overflow-x-auto scrollbar-thin">
          <pre className="text-[11px] font-mono text-text-weak leading-relaxed whitespace-pre-wrap">
            <span className="text-text-weaker">$ </span>
            <span className="text-text-base">{command}</span>
            {"\n"}
            {displayOutput}
            {truncated && (
              <span className="text-text-weaker italic">{"\n"}... output truncated</span>
            )}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Generic tool card (non-terminal) ───────────────────────

function GenericToolCard({ part }: { part: ToolCallPart }) {
  const [expanded, setExpanded] = useState(false)
  const meta = getToolMeta(part.tool)
  const summary = getArgsSummary(part.tool, part.args)
  const duration = formatDuration(part.startTime, part.endTime)
  const { Icon } = meta
  const isCompleted = part.status === "completed" || part.status === "error"
  const hasOutput = !!part.output

  // Collapsed pill (completed, not expanded)
  if (isCompleted && !expanded) {
    return (
      <button
        onClick={() => { if (hasOutput) setExpanded(true) }}
        className={`my-0.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-0/50 border border-border-weak transition-colors text-left ${hasOutput ? "hover:bg-surface-1/50 cursor-pointer" : "cursor-default"}`}
      >
        <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${
          part.status === "error" ? "bg-status-error/15" : "bg-status-success/15"
        }`}>
          {part.status === "error"
            ? <X className="w-2.5 h-2.5 text-status-error" />
            : <Check className="w-2.5 h-2.5 text-status-success" />
          }
        </div>
        <Icon className={`w-3 h-3 ${meta.color}`} />
        <span className="text-[11px] text-text-weaker">{meta.name}</span>
        {summary && <span className="text-[10px] text-text-weaker/60 truncate max-w-[200px] font-mono">{summary}</span>}
        {duration && <span className="text-[10px] text-text-weaker/60 tabular-nums">{duration}</span>}
        {hasOutput && <ChevronDown className="w-2.5 h-2.5 text-text-weaker/60 shrink-0" />}
      </button>
    )
  }

  return (
    <div className="my-1.5 rounded-lg border border-border-weak bg-surface-0/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-1/50 transition-colors text-left"
      >
        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
          part.status === "running" ? "bg-accent/15"
            : part.status === "error" ? "bg-status-error/15"
            : "bg-status-success/15"
        }`}>
          {part.status === "running" ? (
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
          ) : part.status === "error" ? (
            <X className="w-3 h-3 text-status-error" />
          ) : (
            <Check className="w-3 h-3 text-status-success" />
          )}
        </div>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
        <span className={`text-[12px] font-medium shrink-0 ${meta.color}`}>{meta.name}</span>
        {summary && <span className="text-[11px] text-text-weaker truncate flex-1 font-mono">{summary}</span>}
        {duration && <span className="text-[10px] text-text-weaker shrink-0 tabular-nums">{duration}</span>}
        {hasOutput && (
          <ChevronDown className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && part.output && (
        <div className="border-t border-border-weak px-3 py-2 max-h-[300px] overflow-y-auto scrollbar-thin bg-surface-0">
          <pre className="text-[11px] text-text-weak leading-relaxed whitespace-pre-wrap font-mono">
            {part.output}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────

export function ToolCallCard({ part }: { part: ToolCallPart }) {
  const approvalMode = useCommandApprovalStore((s) => s.mode)
  // Terminal commands get the special inline-output Cursor-style card
  if (part.tool === "terminal_write") {
    return <TerminalCommandCard part={part} autoRan={approvalMode !== "ask"} />
  }
  return <GenericToolCard part={part} />
}

// ── Grouped tool calls (P2) ────────────────────────────────
// Used by MessageBubble to group consecutive same-type tool calls

/**
 * Cline-style tool group summary.
 * Adapted from getToolGroupSummary() in Cline's ToolGroupRenderer.tsx.
 * Produces labels like "Read 3 files, searched 2 patterns" instead of "Read File x 5".
 */
function getToolGroupSummary(parts: ToolCallPart[]): string {
  const counts: Record<string, number> = {}
  for (const p of parts) {
    counts[p.tool] = (counts[p.tool] || 0) + 1
  }

  const segments: string[] = []

  // Map our tool names to Cline-style human labels
  if (counts.file_read) segments.push(`${counts.file_read} file${counts.file_read > 1 ? "s" : ""}`)
  if (counts.search_grep) segments.push(`${counts.search_grep} search${counts.search_grep > 1 ? "es" : ""}`)
  if (counts.search_find) segments.push(`${counts.search_find} lookup${counts.search_find > 1 ? "s" : ""}`)
  if (counts.terminal_read) segments.push(`${counts.terminal_read} terminal${counts.terminal_read > 1 ? "s" : ""}`)
  if (counts.terminal_list) segments.push(`listed terminals`)
  if (counts.terminal_write) segments.push(`${counts.terminal_write} command${counts.terminal_write > 1 ? "s" : ""}`)

  // Fallback for any tool type not explicitly handled
  for (const [tool, count] of Object.entries(counts)) {
    if (!["file_read", "search_grep", "search_find", "terminal_read", "terminal_list", "terminal_write"].includes(tool)) {
      const meta = getToolMeta(tool)
      segments.push(`${meta.name} x ${count}`)
    }
  }

  if (segments.length === 0) return `${parts.length} operations`

  // Determine action verb based on tool mix
  const hasReads = counts.file_read || counts.terminal_read
  const hasSearches = counts.search_grep || counts.search_find
  const hasCommands = counts.terminal_write

  if (hasCommands) return `Ran ${segments.join(", ")}`
  if (hasReads && !hasSearches) return `Read ${segments.join(", ")}`
  if (hasSearches && !hasReads) return `Searched ${segments.join(", ")}`
  return `Read ${segments.join(", ")}`
}

export function ToolCallGroup({ parts }: { parts: ToolCallPart[] }) {
  const [expanded, setExpanded] = useState(false)

  const completedCount = parts.filter((p) => p.status === "completed").length
  const errorCount = parts.filter((p) => p.status === "error").length
  const runningCount = parts.filter((p) => p.status === "running").length
  const totalDuration = parts.reduce((sum, p) => {
    if (p.endTime && p.startTime) return sum + (p.endTime - p.startTime)
    return sum
  }, 0)

  const allDone = runningCount === 0
  const hasErrors = errorCount > 0

  // Cline-style summary label
  const label = getToolGroupSummary(parts)

  const statusLabel = runningCount > 0
    ? `${runningCount} running...`
    : hasErrors
      ? `${completedCount} succeeded, ${errorCount} failed`
      : "Success"

  // Pick an icon: use the most common tool's icon, or a generic one
  const toolCounts = parts.reduce<Record<string, number>>((acc, p) => {
    acc[p.tool] = (acc[p.tool] || 0) + 1
    return acc
  }, {})
  const dominantTool = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || parts[0].tool
  const meta = getToolMeta(dominantTool)
  const { Icon } = meta

  return (
    <div className="my-1.5 rounded-lg border border-border-weak bg-surface-0/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-1/50 transition-colors text-left"
      >
        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
          runningCount > 0 ? "bg-accent/15" : hasErrors ? "bg-status-error/15" : "bg-status-success/15"
        }`}>
          {runningCount > 0 ? (
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
          ) : hasErrors ? (
            <X className="w-3 h-3 text-status-error" />
          ) : (
            <Check className="w-3 h-3 text-status-success" />
          )}
        </div>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
        <span className="text-[12px] font-medium text-text-weak">{label}</span>
        <span className={`text-[10px] shrink-0 ${
          runningCount > 0 ? "text-accent" : hasErrors ? "text-status-error" : "text-status-success"
        }`}>
          {statusLabel}
        </span>
        {allDone && totalDuration > 0 && (
          <span className="text-[10px] text-text-weaker tabular-nums shrink-0">
            {totalDuration < 1000 ? `${totalDuration}ms` : `${(totalDuration / 1000).toFixed(1)}s`}
          </span>
        )}
        <ChevronRight className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border-weak">
          {parts.map((p) => (
            <div key={p.id} className="border-b border-border-weak/50 last:border-b-0">
              <ToolCallCard part={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
