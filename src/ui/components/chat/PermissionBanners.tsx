import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { type PendingCommand } from "../../stores/commandApproval"
import { type PendingToolCall } from "../../stores/toolApproval"

/** Keyboard shortcut hint label */
function KeyHint({ char }: { char: string }) {
  return (
    <kbd className="ml-1 text-[9px] px-1 py-px rounded bg-surface-3 text-text-weaker font-mono">
      {char}
    </kbd>
  )
}

/** Hook: Y=allow, N=deny, A=always when banner is visible (not in input) */
function useApprovalKeybinds(onAllow: () => void, onAlways: () => void, onDeny: () => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key === "y" || e.key === "Y") { e.preventDefault(); onAllow() }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); onDeny() }
      if (e.key === "a" || e.key === "A") { e.preventDefault(); onAlways() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onAllow, onAlways, onDeny])
}

/** Build a single-line human-readable summary for a tool call. */
function toolSummary(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "web_search":
      return `web_search("${args.query || ""}")`
    case "web_fetch":
      return `web_fetch(${args.url || ""})`
    case "file_write":
      return `file_write(${args.container}:${args.filePath})`
    case "file_edit":
      return `file_edit(${args.container}:${args.filePath})`
    case "todo_write":
      return `todo_write(${Array.isArray(args.todos) ? args.todos.length : 0} items)`
    case "terminal_create":
      return `terminal_create("${args.name || "unnamed"}", container: ${args.container || "?"})`
    case "caido_read":
      return args.requestId
        ? `caido_read(request: ${args.requestId})`
        : `caido_read(${args.filter ? `filter: "${args.filter}"` : `last ${args.count || 20}`})`
    case "caido_scope":
      return `caido_scope()`
    default:
      return `${name}()`
  }
}

export function PermissionBanner({
  command,
  queueSize,
  onAllowOnce,
  onAllowAlways,
  onDeny,
}: {
  command: PendingCommand
  queueSize: number
  onAllowOnce: () => void
  onAllowAlways: () => void
  onDeny: () => void
}) {
  useApprovalKeybinds(onAllowOnce, onAllowAlways, onDeny)
  const displayCmd = command.command.replace(/\\n/g, "\n").replace(/\n+$/, "")

  return (
    <div className="shrink-0 border-t border-status-warning/30 bg-surface-1">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
          <span className="text-sm font-medium text-text-strong font-sans">
            Permission required
          </span>
          {queueSize > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-weaker font-sans">
              +{queueSize - 1} more
            </span>
          )}
        </div>

        <div className="ml-6 mb-2">
          <span className="text-xs text-text-weak font-sans">
            Execute command in{" "}
            <span className="text-text-base font-medium">{command.terminalName}</span>
          </span>
        </div>

        <div className="ml-6 rounded-lg bg-surface-0 border border-border-weak overflow-hidden">
          <pre className="px-3 py-2.5 text-xs font-mono text-text-base leading-relaxed overflow-x-auto max-h-[120px] overflow-y-auto scrollbar-thin">
            <span className="text-text-weaker select-none">$ </span>
            {displayCmd}
          </pre>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-weak bg-surface-0/50">
        <button
          onClick={onDeny}
          className="text-xs font-sans text-text-weak hover:text-text-base transition-colors px-3 py-1.5"
        >
          Deny<KeyHint char="N" />
        </button>
        <button
          onClick={onAllowAlways}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg border border-border-base text-text-base hover:bg-surface-2 transition-colors"
        >
          Allow always<KeyHint char="A" />
        </button>
        <button
          onClick={onAllowOnce}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg bg-text-strong text-surface-0 hover:opacity-90 transition-opacity"
        >
          Allow once<KeyHint char="Y" />
        </button>
      </div>
    </div>
  )
}

export function ToolPermissionBanner({
  tool,
  queueSize,
  onAllowOnce,
  onAllowAlways,
  onDeny,
}: {
  tool: PendingToolCall
  queueSize: number
  onAllowOnce: () => void
  onAllowAlways: () => void
  onDeny: () => void
}) {
  useApprovalKeybinds(onAllowOnce, onAllowAlways, onDeny)

  return (
    <div className="shrink-0 border-t border-status-warning/30 bg-surface-1">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
          <span className="text-sm font-medium text-text-strong font-sans">
            Permission required
          </span>
          {queueSize > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-weaker font-sans">
              +{queueSize - 1} more
            </span>
          )}
        </div>

        <div className="ml-6 mb-2">
          <span className="text-xs text-text-weak font-sans">
            {tool.description}
          </span>
        </div>

        <div className="ml-6 rounded-lg bg-surface-0 border border-border-weak overflow-hidden">
          <pre className="px-3 py-2.5 text-xs font-mono text-text-base leading-relaxed overflow-x-auto">
            <span className="text-text-weaker select-none">{">"} </span>
            {toolSummary(tool.toolName, tool.args)}
          </pre>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-weak bg-surface-0/50">
        <button
          onClick={onDeny}
          className="text-xs font-sans text-text-weak hover:text-text-base transition-colors px-3 py-1.5"
        >
          Deny<KeyHint char="N" />
        </button>
        <button
          onClick={onAllowAlways}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg border border-border-base text-text-base hover:bg-surface-2 transition-colors"
        >
          Allow always<KeyHint char="A" />
        </button>
        <button
          onClick={onAllowOnce}
          className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg bg-text-strong text-surface-0 hover:opacity-90 transition-opacity"
        >
          Allow once<KeyHint char="Y" />
        </button>
      </div>
    </div>
  )
}
