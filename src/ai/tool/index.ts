/**
 * Tool registry — combines all tool modules into a single map for streamText().
 *
 * Tools that modify state or access the network are wrapped with approval.
 * Read-only tools (terminal_read, file_read, search_*, todo_read) run freely.
 *
 * File write/edit tools use diff-based approval (Cursor-style):
 * - The tool reads the file, computes the diff, sends it for approval
 * - Only after approval does it write the changes
 *
 * Exports:
 *  - allTools:      full set for build/recon/exploit agents
 *  - readOnlyTools: restricted set for report agent / plan mode
 */

import { terminalTools } from "./terminal-tools"
import { fileTools } from "./file-tools"
import { searchTools } from "./search-tools"
import { webTools } from "./web-tools"
import { todoTools } from "./todo-tools"
import { userQuestionTool, createBatchTool } from "./workflow-tools"
import { caidoTools } from "./caido-tools"
import {
  exhReadCredsTool, exhReadHostsTool, exhReadEnvTool,
  exhAddCredTool, exhAddHostTool,
} from "./exh-tools"
import { toolApprovalQueue } from "./tool-approval"
import { generateDiff } from "./file-tools"
import { dockerExec, shellEscape } from "./exec"
import { TOOL_REGISTRY } from "./registry"

// ── Approval wrappers ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Record<string, any>

/**
 * Generic approval wrapper factory.
 * Wraps a tool so it asks for user approval before executing.
 * If rejected, returns { error: "... rejected by user" }.
 */
function withApproval(
  toolName: string,
  tool: AnyTool,
  descFn: (args: any) => string,
  metaFn?: (args: any) => Promise<Record<string, unknown>> | Record<string, unknown>,
  rejectMsg = "Tool call rejected by user",
): AnyTool {
  const origExecute = tool.execute
  return {
    ...tool,
    execute: async (args: any, options: any) => {
      const meta = metaFn ? await metaFn(args) : undefined
      const approved = await toolApprovalQueue.request(toolName, descFn(args), args, meta)
      if (!approved) return { error: rejectMsg }
      return origExecute?.(args, options)
    },
  }
}

/** file_write approval with diff computation */
function withFileWriteApproval(tool: AnyTool): AnyTool {
  return withApproval(
    "file_write",
    tool,
    (a) => `Write ${a.filePath} on ${a.container}`,
    async (a) => {
      const escaped = shellEscape(a.filePath)
      let original = ""
      let isNew = true
      const readResult = await dockerExec(a.container, `cat ${escaped} 2>/dev/null`)
      if (readResult.exitCode === 0) { original = readResult.stdout; isNew = false }
      return { diff: generateDiff(a.filePath, original, a.content), fileKey: `${a.container}:${a.filePath}`, isNewFile: isNew }
    },
    "File write rejected by user",
  )
}

/** file_edit approval */
function withFileEditApproval(tool: AnyTool): AnyTool {
  return withApproval(
    "file_edit",
    tool,
    (a) => `Edit ${a.filePath} on ${a.container}`,
    (a) => ({ fileKey: `${a.container}:${a.filePath}` }),
    "File edit rejected by user",
  )
}

/** file_delete approval */
function withFileDeleteApproval(tool: AnyTool): AnyTool {
  return withApproval(
    "file_delete",
    tool,
    (a) => a.recursive ? `Delete directory ${a.targetPath} (recursive) on ${a.container}` : `Delete ${a.targetPath} on ${a.container}`,
    undefined,
    "File delete rejected by user",
  )
}

// ── Read-only tools (no approval needed) ────────────────────────
const passthrough = {
  terminal_read: terminalTools.terminal_read,
  terminal_list: terminalTools.terminal_list,
  file_read: fileTools.file_read,
  search_find: searchTools.search_find,
  search_grep: searchTools.search_grep,
  todo_read: todoTools.todo_read,
  caido_read: caidoTools.caido_read,
  caido_scope: caidoTools.caido_scope,
  user_question: userQuestionTool,
  exh_read_creds: exhReadCredsTool,
  exh_read_hosts: exhReadHostsTool,
  exh_read_env: exhReadEnvTool,
}

// ── Tools that need approval ────────────────────────────────────
// terminal_write already has its own command queue approval — don't double-wrap
const approved = {
  terminal_create: withApproval("terminal_create", terminalTools.terminal_create,
    (a) => `Create terminal "${a.name || "unnamed"}" on ${a.container}`,
  ),
  terminal_write: terminalTools.terminal_write,

  // File tools with diff-based approval (Cursor-style)
  file_write: withFileWriteApproval(fileTools.file_write),
  file_edit: withFileEditApproval(fileTools.file_edit),
  file_create_dir: withApproval("file_create_dir", fileTools.file_create_dir,
    (a) => `Create directory ${a.dirPath} on ${a.container}`,
  ),
  file_delete: withFileDeleteApproval(fileTools.file_delete),

  web_fetch: withApproval("web_fetch", webTools.web_fetch,
    (a) => `Fetch ${a.url}`,
  ),
  web_search: withApproval("web_search", webTools.web_search,
    (a) => `Search: ${a.query}`,
  ),
  todo_write: withApproval("todo_write", todoTools.todo_write,
    () => "Update todo list",
  ),
  exh_add_cred: withApproval("exh_add_cred", exhAddCredTool,
    (a) => `Add credential: ${a.username || ""}${a.domain ? `@${a.domain}` : ""}`,
  ),
  exh_add_host: withApproval("exh_add_host", exhAddHostTool,
    (a) => `Add host: ${a.ip || ""}${a.hostname ? ` (${a.hostname})` : ""}`,
  ),
}

// ── Base tools ──────────────────────────────────────────────────
const baseTools: Record<string, any> = {
  ...passthrough,
  ...approved,
}

// ── Batch tool (needs the base map for dispatch) ────────────────
const batchTool = createBatchTool(baseTools)

// ── Full registry ───────────────────────────────────────────────
export const allTools: Record<string, any> = {
  ...baseTools,
  batch: batchTool,
}

// ── Read-only subset (report agent / plan mode) ─────────────────
// Generated from registry — stays in sync automatically when new tools are added
export const readOnlyTools: Record<string, any> = Object.fromEntries(
  Object.entries(allTools).filter(([name]) => {
    const meta = TOOL_REGISTRY[name]
    // Include if: registered as readOnly, OR is a web tool (needs approval but allowed in read mode)
    return meta?.readOnly || name === "web_fetch" || name === "web_search"
  }),
)
