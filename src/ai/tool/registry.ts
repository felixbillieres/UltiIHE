/**
 * Tool registry — metadata for all available tools.
 *
 * Provides a single discoverable source of truth for tool names, categories,
 * approval requirements, and descriptions. Used by the system prompt builder,
 * budget calculator, and admin/debug UIs.
 */

export type ToolCategory = "terminal" | "file" | "search" | "web" | "workflow" | "integration"

export interface ToolMeta {
  name: string
  category: ToolCategory
  description: string
  requiresApproval: boolean
  readOnly: boolean
  /** Per-mode overrides for approval requirement */
  modeOverrides?: {
    ctf?: { requiresApproval: boolean }
    audit?: { requiresApproval: boolean }
  }
}

export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  // ── Terminal ─────────────────────────────────────────
  terminal_create: {
    name: "terminal_create",
    category: "terminal",
    description: "Create a new terminal on a container",
    requiresApproval: true,
    readOnly: false,
    modeOverrides: { ctf: { requiresApproval: false } },
  },
  terminal_write: {
    name: "terminal_write",
    category: "terminal",
    description: "Send a command to a terminal",
    requiresApproval: true, // via command queue
    readOnly: false,
    modeOverrides: { ctf: { requiresApproval: false } },
  },
  terminal_read: {
    name: "terminal_read",
    category: "terminal",
    description: "Read recent output from a terminal",
    requiresApproval: false,
    readOnly: true,
  },
  terminal_list: {
    name: "terminal_list",
    category: "terminal",
    description: "List all active terminals",
    requiresApproval: false,
    readOnly: true,
  },
  terminal_close: {
    name: "terminal_close",
    category: "terminal",
    description: "Close an unused terminal",
    requiresApproval: true,
    readOnly: false,
  },
  terminal_search: {
    name: "terminal_search",
    category: "terminal",
    description: "Search terminal output for regex pattern matches",
    requiresApproval: false,
    readOnly: true,
  },

  // ── File ─────────────────────────────────────────────
  file_read: {
    name: "file_read",
    category: "file",
    description: "Read a file or directory from a container",
    requiresApproval: false,
    readOnly: true,
  },
  file_write: {
    name: "file_write",
    category: "file",
    description: "Write/create a file (diff-based approval)",
    requiresApproval: true,
    readOnly: false,
    modeOverrides: { ctf: { requiresApproval: false } },
  },
  file_edit: {
    name: "file_edit",
    category: "file",
    description: "Find & replace in a file (diff-based approval)",
    requiresApproval: true,
    readOnly: false,
    modeOverrides: { ctf: { requiresApproval: false } },
  },
  file_create_dir: {
    name: "file_create_dir",
    category: "file",
    description: "Create a directory with parents",
    requiresApproval: true,
    readOnly: false,
  },
  file_delete: {
    name: "file_delete",
    category: "file",
    description: "Delete a file or directory",
    requiresApproval: true,
    readOnly: false,
  },

  // ── Search ───────────────────────────────────────────
  search_find: {
    name: "search_find",
    category: "search",
    description: "Find files by glob pattern or list directory tree",
    requiresApproval: false,
    readOnly: true,
  },
  search_grep: {
    name: "search_grep",
    category: "search",
    description: "Search file contents by regex",
    requiresApproval: false,
    readOnly: true,
  },

  // ── Web ──────────────────────────────────────────────
  web_search: {
    name: "web_search",
    category: "web",
    description: "Search the web (CVEs, exploits, docs)",
    requiresApproval: true,
    readOnly: true,
  },
  web_fetch: {
    name: "web_fetch",
    category: "web",
    description: "Fetch content from a URL",
    requiresApproval: true,
    readOnly: true,
  },

  // ── Workflow ─────────────────────────────────────────
  todo_read: {
    name: "todo_read",
    category: "workflow",
    description: "Read task list",
    requiresApproval: false,
    readOnly: true,
  },
  todo_write: {
    name: "todo_write",
    category: "workflow",
    description: "Update task list",
    requiresApproval: true,
    readOnly: false,
  },
  user_question: {
    name: "user_question",
    category: "workflow",
    description: "Ask the user a question",
    requiresApproval: false,
    readOnly: true,
  },
  batch: {
    name: "batch",
    category: "workflow",
    description: "Execute multiple tools in parallel",
    requiresApproval: false,
    readOnly: false,
  },

  // ── Integration ──────────────────────────────────────
  caido_read: {
    name: "caido_read",
    category: "integration",
    description: "List/inspect Caido proxy requests",
    requiresApproval: false,
    readOnly: true,
  },
  caido_scope: {
    name: "caido_scope",
    category: "integration",
    description: "List Caido proxy scopes",
    requiresApproval: false,
    readOnly: true,
  },
  exh_read_creds: {
    name: "exh_read_creds",
    category: "integration",
    description: "Read stored credentials",
    requiresApproval: false,
    readOnly: true,
  },
  exh_read_hosts: {
    name: "exh_read_hosts",
    category: "integration",
    description: "Read stored hosts",
    requiresApproval: false,
    readOnly: true,
  },
  exh_read_env: {
    name: "exh_read_env",
    category: "integration",
    description: "Read engagement environment",
    requiresApproval: false,
    readOnly: true,
  },
  exh_add_cred: {
    name: "exh_add_cred",
    category: "integration",
    description: "Add a credential",
    requiresApproval: true,
    readOnly: false,
    modeOverrides: { ctf: { requiresApproval: false } },
  },
  exh_add_host: {
    name: "exh_add_host",
    category: "integration",
    description: "Add a host",
    requiresApproval: true,
    readOnly: false,
    modeOverrides: { ctf: { requiresApproval: false } },
  },
}

/** Get read-only tool names (for report agent / plan mode) */
export function getReadOnlyToolNames(): string[] {
  return Object.values(TOOL_REGISTRY)
    .filter((t) => t.readOnly)
    .map((t) => t.name)
}

/** Get tool names by category */
export function getToolsByCategory(category: ToolCategory): string[] {
  return Object.values(TOOL_REGISTRY)
    .filter((t) => t.category === category)
    .map((t) => t.name)
}

/** Get all tool names requiring approval */
export function getApprovalRequiredTools(): string[] {
  return Object.values(TOOL_REGISTRY)
    .filter((t) => t.requiresApproval)
    .map((t) => t.name)
}

/** Check if a tool requires approval given the current agent mode */
export function shouldRequireApproval(toolName: string, agentMode: string): boolean {
  const meta = TOOL_REGISTRY[toolName]
  if (!meta) return true
  const override = meta.modeOverrides?.[agentMode as "ctf" | "audit"]
  if (override !== undefined) return override.requiresApproval
  return meta.requiresApproval
}
