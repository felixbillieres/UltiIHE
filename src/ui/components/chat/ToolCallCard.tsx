import { useState } from "react"
import type { ToolCallPart } from "../../stores/session"
import { MarkdownContent } from "./MarkdownContent"
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
  Loader2,
  Check,
  X,
  type LucideIcon,
} from "lucide-react"

// ── Tool display metadata ──────────────────────────────────

const TOOL_META: Record<string, { name: string; Icon: LucideIcon; color: string }> = {
  terminal_read:    { name: "Read Terminal",    Icon: Terminal,    color: "text-cyan-400" },
  terminal_write:   { name: "Run Command",      Icon: Play,        color: "text-green-400" },
  terminal_create:  { name: "Create Terminal",   Icon: Plus,        color: "text-cyan-400" },
  terminal_list:    { name: "List Terminals",    Icon: List,        color: "text-cyan-400" },
  file_read:        { name: "Read File",         Icon: FileText,    color: "text-blue-400" },
  file_write:       { name: "Write File",        Icon: FileEdit,    color: "text-yellow-400" },
  file_edit:        { name: "Edit File",         Icon: FileEdit,    color: "text-yellow-400" },
  file_delete:      { name: "Delete",            Icon: Trash2,      color: "text-red-400" },
  file_create_dir:  { name: "Create Directory",  Icon: FolderPlus,  color: "text-blue-400" },
  search_grep:      { name: "Search",            Icon: Search,      color: "text-purple-400" },
  search_find:      { name: "Find Files",        Icon: FolderSearch, color: "text-purple-400" },
  web_search:       { name: "Web Search",        Icon: Globe,       color: "text-orange-400" },
  web_fetch:        { name: "Fetch URL",         Icon: Download,    color: "text-orange-400" },
  user_question:    { name: "Question",          Icon: HelpCircle,  color: "text-accent" },
  batch:            { name: "Batch Execute",     Icon: Layers,      color: "text-text-weak" },
  todo_read:        { name: "Read TODO",         Icon: ListChecks,  color: "text-text-weak" },
  todo_write:       { name: "Update TODO",       Icon: ListChecks,  color: "text-text-weak" },
  caido_read:       { name: "Caido Read",        Icon: Shield,      color: "text-emerald-400" },
  caido_scope:      { name: "Caido Scope",       Icon: Target,      color: "text-emerald-400" },
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

// ── Component ──────────────────────────────────────────────

export function ToolCallCard({ part }: { part: ToolCallPart }) {
  const [expanded, setExpanded] = useState(false)
  const meta = getToolMeta(part.tool)
  const summary = getArgsSummary(part.tool, part.args)
  const duration = formatDuration(part.startTime, part.endTime)
  const { Icon } = meta

  return (
    <div className="my-1.5 rounded-lg border border-border-weak bg-surface-0/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-1/50 transition-colors text-left"
      >
        {/* Status indicator */}
        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
          part.status === "running"
            ? "bg-accent/15"
            : part.status === "error"
              ? "bg-red-400/15"
              : "bg-emerald-400/15"
        }`}>
          {part.status === "running" ? (
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
          ) : part.status === "error" ? (
            <X className="w-3 h-3 text-red-400" />
          ) : (
            <Check className="w-3 h-3 text-emerald-400" />
          )}
        </div>

        {/* Tool icon + name */}
        <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
        <span className={`text-[12px] font-medium shrink-0 ${meta.color}`}>
          {meta.name}
        </span>

        {/* Args summary */}
        {summary && (
          <span className="text-[11px] text-text-weaker truncate flex-1 font-mono">
            {summary}
          </span>
        )}

        {/* Duration */}
        {duration && (
          <span className="text-[10px] text-text-weaker shrink-0 tabular-nums">
            {duration}
          </span>
        )}

        {/* Expand indicator */}
        {part.output && (
          <ChevronDown className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* Expandable output */}
      {expanded && part.output && (
        <div className="border-t border-border-weak px-3 py-2 max-h-[300px] overflow-y-auto scrollbar-thin bg-[#0a0a0a]">
          <div className="text-[11px] text-text-weak leading-relaxed">
            <MarkdownContent content={`\`\`\`\n${part.output}\n\`\`\``} />
          </div>
        </div>
      )}
    </div>
  )
}
