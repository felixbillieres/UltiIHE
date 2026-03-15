import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import type { MessagePart, ToolCallPart } from "../../stores/session"

interface Props {
  streaming: boolean
  parts: MessagePart[]
}

/** Summarize tool args into a short human-readable string. */
function summarizeToolCall(part: ToolCallPart): string {
  const name = part.tool
  const args = part.args

  if (!args || typeof args !== "object") return `Running ${name}...`

  const a = args as Record<string, unknown>

  // Common patterns
  if (a.command && typeof a.command === "string") {
    const cmd = a.command.length > 40 ? a.command.slice(0, 40) + "..." : a.command
    return `Running \`${cmd}\``
  }
  if (a.path && typeof a.path === "string") {
    const p = String(a.path)
    return `Reading ${p.split("/").pop() || p}...`
  }
  if (a.query && typeof a.query === "string") {
    return `Searching for '${a.query}'...`
  }
  if (a.pattern && typeof a.pattern === "string") {
    return `Searching for '${a.pattern}'...`
  }

  return `Running ${name}...`
}

function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  if (elapsed < 1) return null
  return (
    <span className="text-text-weaker tabular-nums ml-1.5">{elapsed}s</span>
  )
}

export function ActivityIndicator({ streaming, parts }: Props) {
  if (!streaming) return null

  const lastPart = parts.length > 0 ? parts[parts.length - 1] : null

  // No parts yet — thinking
  if (!lastPart) {
    return (
      <div className="shrink-0 flex items-center gap-1.5 h-7 px-3 bg-surface-1/50 border-b border-border-weak">
        <span className="text-[11px] font-sans font-medium animate-shimmer bg-gradient-to-r from-text-base to-text-weaker bg-[length:200%_100%] bg-clip-text text-transparent select-none">
          Thinking...
        </span>
      </div>
    )
  }

  // Reasoning part
  if (lastPart.type === "reasoning") {
    return (
      <div className="shrink-0 flex items-center gap-1.5 h-7 px-3 bg-surface-1/50 border-b border-border-weak">
        <span className="text-[11px] font-sans font-medium animate-shimmer bg-gradient-to-r from-text-base to-text-weaker bg-[length:200%_100%] bg-clip-text text-transparent select-none">
          Reasoning...
        </span>
      </div>
    )
  }

  // Tool call running
  if (lastPart.type === "tool-call") {
    const tc = lastPart as ToolCallPart
    if (tc.status === "running") {
      return (
        <div className="shrink-0 flex items-center gap-1.5 h-7 px-3 bg-surface-1/50 border-b border-border-weak">
          <Loader2 className="w-3 h-3 text-text-weaker animate-spin shrink-0" />
          <span className="text-[11px] font-sans text-text-weak truncate">
            {summarizeToolCall(tc)}
          </span>
          {tc.startTime && <ElapsedTimer startTime={tc.startTime} />}
        </div>
      )
    }
  }

  // Text part — writing
  if (lastPart.type === "text") {
    return (
      <div className="shrink-0 flex items-center gap-1.5 h-7 px-3 bg-surface-1/50 border-b border-border-weak">
        <span className="text-[11px] font-sans text-text-weaker">
          Writing...
        </span>
      </div>
    )
  }

  return null
}
