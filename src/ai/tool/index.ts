/**
 * Tool registry — combines all tool modules into a single map for streamText().
 *
 * Tools that modify state or access the network are wrapped with approval.
 * Read-only tools (terminal_read, file_read, search_*, todo_read) run freely.
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
import { toolApprovalQueue } from "./tool-approval"

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

// ── Read-only tools (no approval needed) ────────────────────────
const passthrough = {
  terminal_read: terminalTools.terminal_read,
  terminal_list: terminalTools.terminal_list,
  file_read: fileTools.file_read,
  search_find: searchTools.search_find,
  search_grep: searchTools.search_grep,
  todo_read: todoTools.todo_read,
  user_question: userQuestionTool,
}

// ── Tools that need approval ────────────────────────────────────
// terminal_write already has its own command queue approval — don't double-wrap
const approved = {
  terminal_write: terminalTools.terminal_write,

  file_write: withApproval("file_write", fileTools.file_write,
    (a) => `Write ${a.filePath} on ${a.container}`,
  ),
  file_edit: withApproval("file_edit", fileTools.file_edit,
    (a) => `Edit ${a.filePath} on ${a.container}`,
  ),
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
  // web tools still need approval even in read-only mode
  web_fetch: approved.web_fetch,
  web_search: approved.web_search,
}
