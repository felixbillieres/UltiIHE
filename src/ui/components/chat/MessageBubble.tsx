import React, { useState, useCallback, useRef, useEffect } from "react"
import { type Message, type MessagePart, type ReasoningPart, type MessageUsage } from "../../stores/session"
import {
  Bot,
  User,
  Loader2,
  AlertTriangle,
  Terminal,
  FileText,
  ChevronDown,
  Brain,
  Copy,
  Check,
  GitFork,
  RefreshCw,
  Archive,
  Pencil,
} from "lucide-react"
import { MarkdownContent } from "./MarkdownContent"
import { ToolCallCard, ToolCallGroup } from "./ToolCallCard"

// ── Context block types ──────────────────────────────────────────

interface TerminalBlock {
  type: "terminal"
  name: string
  lines: string
  comment?: string
  content: string
}

interface FileBlock {
  type: "file"
  path: string
  container: string
  language: string
  lines: string
  startLine?: string
  comment?: string
  content: string
}

type ContextBlock = TerminalBlock | FileBlock

function parseContextBlocks(raw: string): { blocks: ContextBlock[]; text: string } {
  const blocks: ContextBlock[] = []
  let remaining = raw

  // Parse <terminal> blocks
  remaining = remaining.replace(
    /<terminal name="([^"]*)" lines="([^"]*)">\n?(?:User comment: ([^\n]*)\n)?([\s\S]*?)\n?<\/terminal>/g,
    (_, name, lines, comment, content) => {
      blocks.push({ type: "terminal", name, lines, comment: comment?.trim(), content: content.trim() })
      return ""
    },
  )

  // Parse <file> blocks
  remaining = remaining.replace(
    /<file path="([^"]*)" container="([^"]*)" language="([^"]*)" lines="([^"]*)"(?:\s+startLine="([^"]*)")?\s*>\n?(?:User comment: ([^\n]*)\n)?([\s\S]*?)\n?<\/file>/g,
    (_, path, container, language, lines, startLine, comment, content) => {
      blocks.push({ type: "file", path, container, language, lines, startLine, comment: comment?.trim(), content: content.trim() })
      return ""
    },
  )

  return { blocks, text: remaining.trim() }
}

// ── Terminal context block ───────────────────────────────────────

function TerminalContextBlock({ block }: { block: TerminalBlock }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="w-full rounded-lg border border-border-weak bg-surface-1 overflow-hidden text-left">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2/50 transition-colors"
      >
        <div className="w-4 h-4 rounded bg-accent/15 flex items-center justify-center shrink-0">
          <Terminal className="w-2.5 h-2.5 text-accent" />
        </div>
        <span className="text-[11px] text-text-weak font-sans flex-1 text-left truncate">
          <span className="text-accent font-medium">{block.name}</span>
          <span className="text-text-weaker ml-1.5">{block.lines} lines</span>
        </span>
        {block.comment && (
          <span className="text-[11px] text-text-base font-sans truncate max-w-[180px]">
            {block.comment}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border-weak">
          {block.comment && (
            <div className="px-3 py-1.5 bg-accent/5 border-b border-border-weak">
              <span className="text-[11px] text-accent font-sans">{block.comment}</span>
            </div>
          )}
          <pre className="px-3 py-2 text-[11px] font-mono text-text-weak leading-relaxed max-h-[200px] overflow-y-auto overflow-x-auto scrollbar-thin bg-surface-0">
            {block.content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── File context block ───────────────────────────────────────────

function FileContextBlock({ block }: { block: FileBlock }) {
  const [expanded, setExpanded] = useState(false)
  const fileName = block.path.split("/").pop() || block.path

  return (
    <div className="w-full rounded-lg border border-border-weak bg-surface-1 overflow-hidden text-left">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2/50 transition-colors"
      >
        <div className="w-4 h-4 rounded bg-accent/15 flex items-center justify-center shrink-0">
          <FileText className="w-2.5 h-2.5 text-accent" />
        </div>
        <span className="text-[11px] text-text-weak font-sans flex-1 text-left truncate">
          <span className="text-accent font-medium">{fileName}</span>
          {block.startLine && (
            <span className="text-text-weaker ml-1">L{block.startLine}</span>
          )}
          <span className="text-text-weaker ml-1.5">{block.lines} lines</span>
        </span>
        {block.comment && (
          <span className="text-[11px] text-text-base font-sans truncate max-w-[180px]">
            {block.comment}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border-weak">
          <div className="px-3 py-1 text-[10px] font-mono text-text-weaker bg-surface-0/50 border-b border-border-weak truncate">
            {block.container}:{block.path}
          </div>
          {block.comment && (
            <div className="px-3 py-1.5 bg-accent/5 border-b border-border-weak">
              <span className="text-[11px] text-accent font-sans">{block.comment}</span>
            </div>
          )}
          <pre className="px-3 py-2 text-[11px] font-mono text-text-weak leading-relaxed max-h-[200px] overflow-y-auto overflow-x-auto scrollbar-thin bg-surface-0">
            {block.content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Reasoning block ──────────────────────────────────────────────

function ReasoningBlock({ part }: { part: ReasoningPart }) {
  const [expanded, setExpanded] = useState(false)
  const isStreaming = !part.endTime
  const duration = part.endTime ? `${((part.endTime - part.startTime) / 1000).toFixed(1)}s` : ""
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  // Extract first line as summary
  const firstLine = part.content.split("\n")[0]?.slice(0, 80) || "Thinking..."

  // Cline-style: check scroll position for gradient overlays
  const checkScrollable = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      setCanScrollUp(scrollTop > 1)
      setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1)
    }
  }, [])

  // Auto-scroll to bottom during streaming (Cline ThinkingRow pattern)
  useEffect(() => {
    if (scrollRef.current && (isStreaming || expanded)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    checkScrollable()
  }, [part.content, isStreaming, expanded, checkScrollable])

  return (
    <div className="my-1.5 rounded-lg border border-border-weak bg-surface-0/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-1/50 transition-colors text-left"
      >
        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-surface-2">
          {isStreaming ? (
            <Loader2 className="w-3 h-3 text-text-weaker animate-spin" />
          ) : (
            <Brain className="w-3 h-3 text-text-weaker" />
          )}
        </div>
        {/* Cline-style shimmer: gradient text animation while streaming */}
        <span className={`text-[12px] font-medium shrink-0 ${
          isStreaming
            ? "animate-shimmer bg-gradient-to-r from-text-base to-text-weaker bg-[length:200%_100%] bg-clip-text text-transparent select-none"
            : "text-text-weak"
        }`}>
          {isStreaming ? "Thinking" : "Thought"}
        </span>
        <span className="text-[11px] text-text-weaker truncate flex-1">
          {!isStreaming && firstLine}
        </span>
        {duration && (
          <span className="text-[10px] text-text-weaker shrink-0 tabular-nums">{duration}</span>
        )}
        <ChevronDown className={`w-3 h-3 text-text-weaker shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-border-weak relative">
          <div
            ref={scrollRef}
            onScroll={checkScrollable}
            className="px-3 py-2 max-h-[200px] overflow-y-auto scrollbar-thin bg-surface-0"
          >
            <div className="text-[11px] text-text-weak leading-relaxed whitespace-pre-wrap font-mono">
              {part.content}
            </div>
          </div>
          {/* Cline-style gradient overlays to indicate scrollable content */}
          {canScrollUp && (
            <div className="absolute top-0 left-0 right-0 h-6 pointer-events-none bg-gradient-to-b from-surface-0 to-transparent" />
          )}
          {canScrollDown && (
            <div className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none bg-gradient-to-t from-surface-0 to-transparent" />
          )}
        </div>
      )}
    </div>
  )
}

// ── Parts renderer ───────────────────────────────────────────────

/**
 * Low-stakes tools that get grouped into a single collapsible row.
 * Adapted from Cline's isLowStakesTool() — read/search/list operations
 * that don't modify state and can be safely collapsed.
 */
const LOW_STAKES_TOOLS = new Set([
  "file_read",
  "search_grep",
  "search_find",
  "terminal_read",
  "terminal_list",
])

function isLowStakesTool(part: MessagePart): boolean {
  return part.type === "tool-call" && LOW_STAKES_TOOLS.has(part.tool)
}

/**
 * Group consecutive low-stakes tool calls into collapsible groups.
 * Adapted from Cline's groupLowStakesTools() in messageUtils.ts.
 *
 * Key differences from our old groupParts():
 * - Groups DIFFERENT low-stakes tool types together (not just same-type)
 * - Only needs 2+ consecutive low-stakes tools to group (was 3+ same-type)
 * - Non-low-stakes tool calls (terminal_write, file_write, etc.) stay individual
 * - Same-type non-low-stakes tools still group at 3+ consecutive
 */
function groupParts(parts: MessagePart[]): Array<MessagePart | { type: "tool-group"; parts: MessagePart[] }> {
  const result: Array<MessagePart | { type: "tool-group"; parts: MessagePart[] }> = []
  let i = 0

  while (i < parts.length) {
    const part = parts[i]

    // Try to group consecutive low-stakes tools (Cline pattern: mix different read/search tools)
    if (isLowStakesTool(part)) {
      let j = i + 1
      while (j < parts.length && isLowStakesTool(parts[j])) j++
      if (j - i >= 2) {
        result.push({ type: "tool-group", parts: parts.slice(i, j) })
        i = j
        continue
      }
    }

    // Fallback: group 3+ consecutive same-type non-low-stakes tool calls
    if (part.type === "tool-call" && !isLowStakesTool(part)) {
      const tool = part.tool
      let j = i + 1
      while (j < parts.length && parts[j].type === "tool-call" && (parts[j] as any).tool === tool) j++
      if (j - i >= 3) {
        result.push({ type: "tool-group", parts: parts.slice(i, j) })
        i = j
        continue
      }
    }

    result.push(part)
    i++
  }
  return result
}

function AssistantParts({ parts }: { parts: MessagePart[] }) {
  const grouped = groupParts(parts)
  return (
    <div className="text-sm leading-relaxed font-sans text-text-base">
      {grouped.map((item, i) => {
        if ("type" in item && item.type === "tool-group") {
          return <ToolCallGroup key={`group-${i}`} parts={item.parts as any} />
        }
        const part = item as MessagePart
        if (part.type === "text") {
          return part.content ? (
            <div key={`text-${i}`} className="break-words">
              <MarkdownContent content={part.content} />
            </div>
          ) : null
        }
        if (part.type === "tool-call") {
          return <ToolCallCard key={part.id || i} part={part} />
        }
        if (part.type === "reasoning") {
          return <ReasoningBlock key={part.id || i} part={part} />
        }
        return null
      })}
    </div>
  )
}

// ── Compaction system message ─────────────────────────────────────

export function CompactionMessage({ content }: { content?: string }) {
  // Strip the [Context Summary ...] and [End of summary ...] markers
  const summary = content
    ? content
        .replace(/^\[Context Summary[^\]]*\]\s*/i, "")
        .replace(/\[End of summary[^\]]*\]\s*$/i, "")
        .trim()
    : ""

  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-0">
      {/* Divider with badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 py-2 px-3 w-full group"
      >
        <div className="flex-1 h-px bg-border-weak" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border-weak group-hover:border-accent/30 transition-colors">
          <Archive className="w-3 h-3 text-text-weaker" />
          <span className="text-[10px] text-text-weaker font-sans">Context compacted — older messages summarized</span>
          <ChevronDown className={`w-3 h-3 text-text-weaker transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
        <div className="flex-1 h-px bg-border-weak" />
      </button>

      {/* Expandable summary */}
      {expanded && summary && (
        <div className="mx-3 mb-2 rounded-xl bg-surface-1/60 border border-border-weak/50 px-3.5 py-2.5 text-sm leading-relaxed font-sans text-text-weak max-h-[400px] overflow-y-auto scrollbar-thin">
          <MarkdownContent content={summary} />
        </div>
      )}
    </div>
  )
}

// ── Message actions ──────────────────────────────────────────────

function MessageActions({
  message,
  onFork,
  onRetry,
}: {
  message: Message
  onFork?: (messageId: string) => void
  onRetry?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    let text = message.content
    if (message.parts?.length) {
      text = message.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { content: string }).content)
        .join("\n")
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [message])

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base transition-colors"
        title="Copy message"
      >
        {copied ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
      </button>
      {onFork && (
        <button
          onClick={() => onFork(message.id)}
          className="p-1 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base transition-colors"
          title="Fork session from here"
        >
          <GitFork className="w-3 h-3" />
        </button>
      )}
      {onRetry && message.role === "assistant" && (
        <button
          onClick={onRetry}
          className="p-1 rounded hover:bg-surface-2 text-text-weaker hover:text-text-base transition-colors"
          title="Regenerate response"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ── Usage badge (hover-only, non-intrusive) ─────────────────────

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function UsageBadge({ usage }: { usage: MessageUsage }) {
  const total = usage.inputTokens + usage.outputTokens
  if (total === 0) return null

  const cacheRead = usage.cacheReadTokens ?? 0
  const cachePercent = usage.inputTokens > 0 && cacheRead > 0
    ? Math.round((cacheRead / usage.inputTokens) * 100)
    : 0

  return (
    <span
      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-text-weaker/60 font-sans tabular-nums"
      title={[
        `Input: ${usage.inputTokens}`,
        `Output: ${usage.outputTokens}`,
        cacheRead > 0 ? `Cache read: ${cacheRead} (${cachePercent}%)` : null,
        (usage.cacheWriteTokens ?? 0) > 0 ? `Cache write: ${usage.cacheWriteTokens}` : null,
        (usage.reasoningTokens ?? 0) > 0 ? `Reasoning: ${usage.reasoningTokens}` : null,
        (usage.totalSteps ?? 0) > 1 ? `Steps: ${usage.totalSteps}` : null,
      ].filter(Boolean).join(" | ")}
    >
      {formatTokens(usage.inputTokens)} in · {formatTokens(usage.outputTokens)} out
      {cachePercent > 0 && <span className="text-text-weaker"> · {cachePercent}% cached</span>}
    </span>
  )
}

// ── Per-message token footer ─────────────────────────────────────

function MessageTokenFooter({ usage, parts }: { usage: MessageUsage; parts?: MessagePart[] }) {
  const toolCount = parts?.filter((p) => p.type === "tool-call").length ?? 0

  // Compute duration from first part startTime to last part endTime
  let durationStr = ""
  if (parts && parts.length > 0) {
    const starts = parts
      .map((p) => (p as any).startTime as number | undefined)
      .filter((t): t is number => typeof t === "number")
    const ends = parts
      .map((p) => (p as any).endTime as number | undefined)
      .filter((t): t is number => typeof t === "number")
    if (starts.length > 0 && ends.length > 0) {
      const earliest = Math.min(...starts)
      const latest = Math.max(...ends)
      const secs = (latest - earliest) / 1000
      durationStr = secs >= 10 ? `${Math.round(secs)}s` : `${secs.toFixed(1)}s`
    }
  }

  const segments: string[] = []
  segments.push(`${formatTokens(usage.inputTokens)} in`)
  segments.push(`${formatTokens(usage.outputTokens)} out`)
  if (toolCount > 0) segments.push(`${toolCount} tool${toolCount !== 1 ? "s" : ""}`)
  if (durationStr) segments.push(durationStr)

  return <span>{"\u21B3 " + segments.join(" \u00B7 ")}</span>
}

// ── User message with inline edit ───────────────────────────────

function UserMessageBlock({
  message,
  textContent,
  hasBlocks,
  blocks,
  onEdit,
}: {
  message: Message
  textContent: string
  hasBlocks: boolean | null
  blocks?: ContextBlock[]
  onEdit?: (messageId: string, newContent: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(textContent)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus()
      // Place cursor at end
      const el = textareaRef.current
      if (el) el.selectionStart = el.selectionEnd = el.value.length
    }
  }, [editing])

  const handleSubmitEdit = () => {
    if (!editText.trim()) return
    onEdit?.(message.id, editText.trim())
    setEditing(false)
  }

  return (
    <div data-user-message>
      <div className="flex flex-col gap-1.5">
        {hasBlocks && blocks && (
          <>
            {blocks.map((b, i) =>
              b.type === "terminal" ? (
                <TerminalContextBlock key={`ctx-${i}-${b.type}`} block={b} />
              ) : (
                <FileContextBlock key={`ctx-${i}-${b.type}`} block={b} />
              ),
            )}
          </>
        )}
        {editing ? (
          <div className="bg-surface-1 border border-accent/40 rounded-xl px-3.5 py-2 space-y-2">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-transparent text-sm font-sans text-text-strong leading-relaxed resize-none outline-none min-h-[40px] scrollbar-thin"
              rows={Math.min(editText.split("\n").length + 1, 10)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setEditing(false); setEditText(textContent) }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmitEdit() }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setEditing(false); setEditText(textContent) }}
                className="text-xs font-sans text-text-weak hover:text-text-base transition-colors px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitEdit}
                className="text-xs font-sans font-medium px-3 py-1 rounded-lg bg-text-strong text-surface-0 hover:opacity-90 transition-opacity"
              >
                Send
              </button>
            </div>
          </div>
        ) : textContent ? (
          <div className="group/msg relative">
            <div className="bg-surface-1 border border-border-weak rounded-xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words font-sans text-text-strong text-left">
              <MarkdownContent content={textContent} />
            </div>
            {onEdit && (
              <button
                onClick={() => { setEditing(true); setEditText(textContent) }}
                className="absolute -top-2 -right-2 p-1 rounded-md bg-surface-2 border border-border-weak text-text-weaker hover:text-accent hover:border-accent/30 transition-colors opacity-0 group-hover/msg:opacity-100"
                title="Edit message"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Message bubble ───────────────────────────────────────────────

export function MessageBubble({
  message,
  isStreaming,
  isLastAssistant,
  onFork,
  onRetry,
  onEdit,
}: {
  message: Message
  isStreaming: boolean
  isLastAssistant?: boolean
  onFork?: (messageId: string) => void
  onRetry?: () => void
  onEdit?: (messageId: string, newContent: string) => void
}) {
  // ── System notice — rendered as a colored divider ──────────
  if (message.isSystemNotice) {
    // Extract mode color from AGENT_MODES
    const modeMatch = message.content.match(/Switched to (\w+) mode/)
    const modeName = modeMatch?.[1]?.toLowerCase() ?? ""
    const MODE_COLORS: Record<string, string> = { ctf: "#22d3ee", audit: "#f59e0b", neutral: "#9ca3af" }
    const color = MODE_COLORS[modeName] ?? "#9ca3af"
    return (
      <div className="flex items-center gap-3 py-2 px-4">
        <div className="flex-1 h-px" style={{ backgroundColor: color + "30" }} />
        <span className="text-[10px] font-sans font-medium whitespace-nowrap" style={{ color }}>
          {message.content}
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: color + "30" }} />
      </div>
    )
  }

  const isUser = message.role === "user"
  const isError = !isUser && message.content.startsWith("⚠️")
  const hasParts = !isUser && message.parts && message.parts.length > 0

  const parsed = isUser ? parseContextBlocks(message.content) : null
  const hasBlocks = parsed && parsed.blocks.length > 0

  // ── User message — with inline edit support ─────────────
  if (isUser) {
    const textContent = hasBlocks ? parsed!.text : message.content
    return (
      <UserMessageBlock
        message={message}
        textContent={textContent}
        hasBlocks={hasBlocks}
        blocks={parsed?.blocks}
        onEdit={onEdit}
      />
    )
  }

  // ── Assistant message — no avatar, no bubble (Cursor-style) ─
  return (
    <div className="group">
      <div className="px-1">
        {hasParts ? (
          <div className="text-sm leading-relaxed font-sans text-text-base">
            <AssistantParts parts={message.parts} />
          </div>
        ) : (
          <div
            className={`text-sm leading-relaxed break-words font-sans ${
              isError
                ? "bg-status-error/8 border border-status-error/20 text-status-error rounded-xl px-3.5 py-2.5"
                : "text-text-base"
            }`}
          >
            {isStreaming ? (
              <span className="inline-flex items-center gap-1.5 text-text-weaker">
                <Loader2 className="w-3 h-3 animate-spin" />
                Planning next moves
              </span>
            ) : (
              <MarkdownContent content={message.content} />
            )}
          </div>
        )}
        {/* Actions + usage — visible on hover, not during streaming */}
        {!isStreaming && (
          <div className="mt-1 flex items-center gap-2">
            <MessageActions
              message={message}
              onFork={onFork}
              onRetry={isLastAssistant ? onRetry : undefined}
            />
            {message.usage && (
              <UsageBadge usage={message.usage} />
            )}
          </div>
        )}
        {/* Per-message token footer — always visible, very subtle */}
        {!isStreaming && message.usage && (message.usage.inputTokens > 0 || message.usage.outputTokens > 0) && (
          <div className="mt-0.5 text-[9px] text-text-weaker/50 font-sans tabular-nums">
            <MessageTokenFooter usage={message.usage} parts={message.parts} />
          </div>
        )}
      </div>
    </div>
  )
}

export const MemoizedMessageBubble = React.memo(MessageBubble, (prev, next) => {
  if (prev.message.id !== next.message.id) return false
  if (prev.isStreaming !== next.isStreaming) return false
  if (prev.isLastAssistant !== next.isLastAssistant) return false
  // For streaming messages, check content length and parts length
  if (prev.message.content.length !== next.message.content.length) return false
  if ((prev.message.parts?.length || 0) !== (next.message.parts?.length || 0)) return false
  // Check last part status for tool calls
  const prevLast = prev.message.parts?.[prev.message.parts.length - 1]
  const nextLast = next.message.parts?.[next.message.parts.length - 1]
  if (prevLast?.type === "tool-call" || nextLast?.type === "tool-call") {
    if ((prevLast as any)?.status !== (nextLast as any)?.status) return false
    if ((prevLast as any)?.output !== (nextLast as any)?.output) return false
  }
  return true
})
