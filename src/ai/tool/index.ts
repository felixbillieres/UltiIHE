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
import { toolApprovalQueue } from "./tool-approval"
import { generateDiff } from "./file-tools"
import { dockerExec, shellEscape } from "./exec"

// ── Approval wrapper ────────────────────────────────────────────

/**
 * Wrap a tool so it asks for user approval before executing.
 * If rejected, returns { error: "Tool call rejected by user" }.
 */
function withApproval(toolName: string, tool: any, descriptionFn: (args: any) => string) {
  return {
    ...tool,
    execute: async (args: any, options: any) => {
      const approved = await toolApprovalQueue.request(
        toolName,
        descriptionFn(args),
        args,
      )
      if (!approved) {
        return { error: "Tool call rejected by user" }
      }
      return tool.execute(args, options)
    },
  }
}

/**
 * Wrap file_write with diff-based approval:
 * 1. Read existing file (if any)
 * 2. Compute diff
 * 3. Send diff for approval
 * 4. Only write if approved
 */
function withFileWriteApproval(tool: any) {
  return {
    ...tool,
    execute: async (args: any, options: any) => {
      const { container, filePath, content } = args
      const escaped = shellEscape(filePath)

      // Read existing content for diff
      let original = ""
      let isNew = true
      const readResult = await dockerExec(container, `cat ${escaped} 2>/dev/null`)
      if (readResult.exitCode === 0) {
        original = readResult.stdout
        isNew = false
      }

      const diff = generateDiff(filePath, original, content)
      const fileKey = `${container}:${filePath}`

      const approved = await toolApprovalQueue.request(
        "file_write",
        `Write ${filePath} on ${container}`,
        args,
        { diff, fileKey, isNewFile: isNew },
      )

      if (!approved) {
        return { error: "File write rejected by user" }
      }

      return tool.execute(args, options)
    },
  }
}

/**
 * Wrap file_edit with diff-based approval:
 * 1. Read file
 * 2. Compute what the edit would look like
 * 3. Send diff for approval
 * 4. Only apply if approved
 */
function withFileEditApproval(tool: any) {
  return {
    ...tool,
    execute: async (args: any, options: any) => {
      const { container, filePath } = args
      const fileKey = `${container}:${filePath}`

      // Let the tool handle the actual diffing - it already generates diffs
      // We just need to show the approval before writing
      const approved = await toolApprovalQueue.request(
        "file_edit",
        `Edit ${filePath} on ${container}`,
        args,
        { fileKey },
      )

      if (!approved) {
        return { error: "File edit rejected by user" }
      }

      return tool.execute(args, options)
    },
  }
}

/**
 * Wrap file_delete with approval.
 */
function withFileDeleteApproval(tool: any) {
  return {
    ...tool,
    execute: async (args: any, options: any) => {
      const { container, targetPath, recursive } = args
      const desc = recursive
        ? `Delete directory ${targetPath} (recursive) on ${container}`
        : `Delete ${targetPath} on ${container}`

      const approved = await toolApprovalQueue.request(
        "file_delete",
        desc,
        args,
      )

      if (!approved) {
        return { error: "File delete rejected by user" }
      }

      return tool.execute(args, options)
    },
  }
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
export const readOnlyTools: Record<string, any> = {
  terminal_read: terminalTools.terminal_read,
  terminal_list: terminalTools.terminal_list,
  file_read: fileTools.file_read,
  search_find: searchTools.search_find,
  search_grep: searchTools.search_grep,
  todo_read: todoTools.todo_read,
  caido_read: caidoTools.caido_read,
  caido_scope: caidoTools.caido_scope,
  // web tools still need approval even in read-only mode
  web_fetch: approved.web_fetch,
  web_search: approved.web_search,
}
