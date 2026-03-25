import { useState, useEffect, useRef } from "react"
import { AlertTriangle, Pencil, ShieldAlert } from "lucide-react"
import { type PendingCommand } from "../../stores/commandApproval"
import { type PendingToolCall } from "../../stores/toolApproval"

// ── Audit mode: dangerous command detection ──────────────────
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; warning: string }> = [
  { pattern: /\b(nmap|masscan)\b.*(-s[STUF]|--script)/i, warning: "Active scan — may trigger IDS/WAF" },
  { pattern: /\b(nmap|masscan)\b/i, warning: "Port scan — may be detected by IDS" },
  { pattern: /\b(sqlmap|nosqlmap)\b/i, warning: "SQL injection testing — noisy, may trigger WAF" },
  { pattern: /\b(hydra|medusa|patator|crackmapexec|ncrack)\b/i, warning: "Brute-force attack — generates many auth failures" },
  { pattern: /\b(nikto|wpscan|nuclei|feroxbuster|gobuster|ffuf|dirsearch)\b/i, warning: "Web scanner — generates high request volume" },
  { pattern: /\b(metasploit|msfconsole|msfvenom)\b/i, warning: "Exploit framework — active exploitation" },
  { pattern: /\b(responder|mitm6|bettercap)\b/i, warning: "Network poisoning — affects other hosts on segment" },
  { pattern: /\brm\s+-rf?\s+\//i, warning: "Recursive deletion from root — destructive" },
]

function getCommandWarning(command: string): string | null {
  for (const { pattern, warning } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return warning
  }
  return null
}

/** Keyboard shortcut hint label */
function KeyHint({ char }: { char: string }) {
  return (
    <kbd className="ml-1 text-[9px] px-1 py-px rounded bg-surface-3 text-text-weaker font-mono">
      {char}
    </kbd>
  )
}

/** Hook: Y=allow, N=deny, A=always, E=edit when banner is visible (not in input) */
function useApprovalKeybinds(
  onAllow: () => void,
  onAlways: () => void,
  onDeny: () => void,
  onEdit?: () => void,
) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key === "y" || e.key === "Y") { e.preventDefault(); onAllow() }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); onDeny() }
      if (e.key === "a" || e.key === "A") { e.preventDefault(); onAlways() }
      if (onEdit && (e.key === "e" || e.key === "E")) { e.preventDefault(); onEdit() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onAllow, onAlways, onDeny, onEdit])
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
  onEdit,
  agentMode,
}: {
  command: PendingCommand
  queueSize: number
  onAllowOnce: () => void
  onAllowAlways: () => void
  onDeny: () => void
  onEdit?: (editedCommand: string) => void
  agentMode?: string
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(command.command)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const auditWarning = agentMode === "audit" ? getCommandWarning(command.command) : null

  // Reset edit state when command changes
  useEffect(() => {
    setEditing(false)
    setEditText(command.command)
  }, [command.id, command.command])

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  useApprovalKeybinds(
    onAllowOnce,
    onAllowAlways,
    onDeny,
    onEdit ? () => { if (!editing) { setEditing(true); setEditText(command.command) } } : undefined,
  )

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
          {editing ? (
            <div className="px-3 py-2.5">
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-transparent text-xs font-mono text-text-base leading-relaxed resize-none outline-none min-h-[40px] scrollbar-thin"
                rows={Math.min(editText.split("\n").length + 1, 6)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); setEditing(false) }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    onEdit?.(editText)
                  }
                }}
              />
            </div>
          ) : (
            <pre className="px-3 py-2.5 text-xs font-mono text-text-base leading-relaxed overflow-x-auto max-h-[120px] overflow-y-auto scrollbar-thin">
              <span className="text-text-weaker select-none">$ </span>
              {displayCmd}
            </pre>
          )}
        </div>

        {auditWarning && (
          <div className="ml-6 mt-1.5 flex items-center gap-1.5 text-[11px] text-status-warning font-sans">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>{auditWarning}</span>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-weak bg-surface-0/50">
          <button
            onClick={() => setEditing(false)}
            className="text-xs font-sans text-text-weak hover:text-text-base transition-colors px-3 py-1.5"
          >
            Cancel<KeyHint char="Esc" />
          </button>
          <button
            onClick={() => onEdit?.(editText)}
            className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg bg-text-strong text-surface-0 hover:opacity-90 transition-opacity"
          >
            Run edited<KeyHint char="^Enter" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-weak bg-surface-0/50">
          <button
            onClick={onDeny}
            className="text-xs font-sans text-text-weak hover:text-text-base transition-colors px-3 py-1.5"
          >
            Deny<KeyHint char="N" />
          </button>
          {onEdit && (
            <button
              onClick={() => { setEditing(true); setEditText(command.command) }}
              className="text-xs font-sans font-medium px-4 py-1.5 rounded-lg border border-border-base text-text-base hover:bg-surface-2 transition-colors flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              Edit<KeyHint char="E" />
            </button>
          )}
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
      )}
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
