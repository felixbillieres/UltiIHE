import { useState } from "react"
import { type Message } from "../../stores/session"
import {
  Bot,
  User,
  Loader2,
  AlertTriangle,
  Terminal,
  FileText,
  ChevronDown,
} from "lucide-react"
import { MarkdownContent } from "./MarkdownContent"

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

// ── Message bubble ───────────────────────────────────────────────

export function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message
  isStreaming: boolean
}) {
  const isUser = message.role === "user"
  const isError = !isUser && message.content.startsWith("⚠️")

  const parsed = isUser ? parseContextBlocks(message.content) : null
  const hasBlocks = parsed && parsed.blocks.length > 0

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-accent/20"
            : isError
              ? "bg-status-error/15"
              : "bg-surface-2"
        }`}
      >
        {isUser ? (
          <User className="w-3 h-3 text-accent" />
        ) : isError ? (
          <AlertTriangle className="w-3 h-3 text-status-error" />
        ) : (
          <Bot className="w-3 h-3 text-text-weak" />
        )}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {isUser && hasBlocks ? (
          <div className="inline-flex flex-col gap-2 max-w-[85%] items-end">
            {parsed.blocks.map((b, i) =>
              b.type === "terminal" ? (
                <TerminalContextBlock key={i} block={b} />
              ) : (
                <FileContextBlock key={i} block={b} />
              ),
            )}
            {parsed.text && (
              <div className="bg-accent/8 text-text-strong px-3 py-2 rounded-lg rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words font-sans text-left w-full">
                <MarkdownContent content={parsed.text} />
              </div>
            )}
          </div>
        ) : (
          <div
            className={`inline-block text-sm leading-relaxed whitespace-pre-wrap break-words font-sans ${
              isUser
                ? "bg-accent/8 text-text-strong px-3 py-2 rounded-lg rounded-tr-sm max-w-[85%]"
                : isError
                  ? "bg-status-error/8 border border-status-error/20 text-status-error px-3 py-2 rounded-lg max-w-[95%]"
                  : "text-text-base"
            }`}
          >
            {isStreaming ? (
              <span className="inline-flex items-center gap-1 text-text-weaker">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking...
              </span>
            ) : (
              <MarkdownContent content={message.content} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
