import { useState, useCallback } from "react"
import { type Message, type MessagePart, type ReasoningPart } from "../../stores/session"
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
} from "lucide-react"
import { MarkdownContent } from "./MarkdownContent"
import { ToolCallCard } from "./ToolCallCard"

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
        <div className="w-4 h-4 rounded bg-cyan-400/15 flex items-center justify-center shrink-0">
          <Terminal className="w-2.5 h-2.5 text-cyan-400" />
        </div>
        <span className="text-[11px] text-text-weak font-sans flex-1 text-left truncate">
          <span className="text-cyan-400 font-medium">{block.name}</span>
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
          <pre className="px-3 py-2 text-[11px] font-mono text-text-weak leading-relaxed max-h-[200px] overflow-y-auto overflow-x-auto scrollbar-thin bg-[#101010]">
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
        <div className="w-4 h-4 rounded bg-blue-400/15 flex items-center justify-center shrink-0">
          <FileText className="w-2.5 h-2.5 text-blue-400" />
        </div>
        <span className="text-[11px] text-text-weak font-sans flex-1 text-left truncate">
          <span className="text-blue-400 font-medium">{fileName}</span>
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
          <pre className="px-3 py-2 text-[11px] font-mono text-text-weak leading-relaxed max-h-[200px] overflow-y-auto overflow-x-auto scrollbar-thin bg-[#101010]">
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

  // Extract first line as summary
  const firstLine = part.content.split("\n")[0]?.slice(0, 80) || "Thinking..."

  return (
    <div className="my-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-purple-500/10 transition-colors text-left"
      >
        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-purple-500/15">
          {isStreaming ? (
            <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
          ) : (
            <Brain className="w-3 h-3 text-purple-400" />
          )}
        </div>
        <span className="text-[12px] font-medium text-purple-400 shrink-0">
          {isStreaming ? "Thinking..." : "Thought"}
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
        <div className="border-t border-purple-500/20 px-3 py-2 max-h-[300px] overflow-y-auto scrollbar-thin bg-[#0a0a0a]">
          <div className="text-[11px] text-text-weak leading-relaxed whitespace-pre-wrap font-mono">
            {part.content}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Parts renderer ───────────────────────────────────────────────

function AssistantParts({ parts }: { parts: MessagePart[] }) {
  return (
    <div className="text-sm leading-relaxed font-sans text-text-base">
      {parts.map((part, i) => {
        if (part.type === "text") {
          return part.content ? (
            <div key={i} className="break-words">
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

export function CompactionMessage() {
  return (
    <div className="flex items-center gap-2 py-2 px-3">
      <div className="flex-1 h-px bg-border-weak" />
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border-weak">
        <Archive className="w-3 h-3 text-text-weaker" />
        <span className="text-[10px] text-text-weaker font-sans">Context compacted — older messages summarized</span>
      </div>
      <div className="flex-1 h-px bg-border-weak" />
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

// ── Message bubble ───────────────────────────────────────────────

export function MessageBubble({
  message,
  isStreaming,
  isLastAssistant,
  onFork,
  onRetry,
}: {
  message: Message
  isStreaming: boolean
  isLastAssistant?: boolean
  onFork?: (messageId: string) => void
  onRetry?: () => void
}) {
  const isUser = message.role === "user"
  const isError = !isUser && message.content.startsWith("⚠️")
  const hasParts = !isUser && message.parts && message.parts.length > 0

  const parsed = isUser ? parseContextBlocks(message.content) : null
  const hasBlocks = parsed && parsed.blocks.length > 0

  // ── User message ────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] flex flex-col items-end gap-1.5">
          {hasBlocks && (
            <>
              {parsed.blocks.map((b, i) =>
                b.type === "terminal" ? (
                  <TerminalContextBlock key={i} block={b} />
                ) : (
                  <FileContextBlock key={i} block={b} />
                ),
              )}
            </>
          )}
          {(hasBlocks ? parsed.text : message.content) && (
            <div className="bg-accent/10 text-text-strong px-3.5 py-2 rounded-2xl rounded-br-md text-sm leading-relaxed whitespace-pre-wrap break-words font-sans text-left">
              <MarkdownContent content={hasBlocks ? parsed.text : message.content} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Assistant message ───────────────────────────────────────
  return (
    <div className="group flex gap-2.5">
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-1 ${
          isError ? "bg-status-error/15" : "bg-surface-2"
        }`}
      >
        {isError ? (
          <AlertTriangle className="w-3 h-3 text-status-error" />
        ) : (
          <Bot className="w-3 h-3 text-text-weak" />
        )}
      </div>
      <div className="flex-1 min-w-0 max-w-[92%]">
        {hasParts ? (
          <div className="bg-surface-1/60 border border-border-weak/50 rounded-2xl rounded-tl-md px-3.5 py-2.5">
            <AssistantParts parts={message.parts} />
          </div>
        ) : (
          <div
            className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed break-words font-sans ${
              isError
                ? "bg-status-error/8 border border-status-error/20 text-status-error"
                : "bg-surface-1/60 border border-border-weak/50 text-text-base"
            }`}
          >
            {isStreaming ? (
              <span className="inline-flex items-center gap-1.5 text-text-weaker">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking...
              </span>
            ) : (
              <MarkdownContent content={message.content} />
            )}
          </div>
        )}
        {/* Actions — visible on hover, not during streaming */}
        {!isStreaming && (
          <div className="mt-1 ml-1">
            <MessageActions
              message={message}
              onFork={onFork}
              onRetry={isLastAssistant ? onRetry : undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
