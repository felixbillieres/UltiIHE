import { z } from "zod"
import type { Tool } from "ai"
import { dockerExec, shellEscape } from "./exec"

/**
 * search_find — Find files by glob pattern OR list a directory tree.
 * Replaces both search_glob and search_list (they were redundant).
 */
export const searchFindTool: Tool<
  { container: string; pattern?: string; path?: string; maxDepth?: number },
  | { path: string; matches: string[]; count: number; truncated: boolean }
  | { error: string }
> = {
  description:
    "Find files in an Exegol container. Two modes:\n" +
    "- With pattern: find files matching a glob (e.g. '*.conf', '**/*.py'). Max 100 results.\n" +
    "- Without pattern: list the directory tree up to maxDepth. Max 200 entries.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    pattern: z
      .string()
      .optional()
      .describe("Glob pattern to match (omit to list directory tree)"),
    path: z.string().default("/root").describe("Directory to search in (default: /root)"),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3)
      .describe("Max directory depth (default: 3, only used in tree mode)"),
  }),
  execute: async ({ container, pattern, path = "/root", maxDepth = 3 }) => {
    const escaped = shellEscape(path)

    let cmd: string
    let limit: number

    if (pattern) {
      // Glob mode — find files matching pattern
      const nameFlag = pattern.includes("/") ? "-path" : "-name"
      cmd = `find ${escaped} ${nameFlag} '${pattern}' -type f 2>/dev/null | head -101`
      limit = 100
    } else {
      // Tree mode — list directory structure
      cmd =
        `command -v tree >/dev/null 2>&1 ` +
        `&& tree -L ${maxDepth} --noreport ${escaped} 2>/dev/null | head -201 ` +
        `|| find ${escaped} -maxdepth ${maxDepth} \\( -type f -o -type d \\) 2>/dev/null | sort | head -201`
      limit = 200
    }

    const result = await dockerExec(container, cmd, { timeout: 15_000 })
    if (result.exitCode !== 0 && !result.stdout) {
      return { error: result.stderr || `Search failed in: ${path}` }
    }

    const matches = result.stdout.trim().split("\n").filter(Boolean)
    const truncated = matches.length > limit
    if (truncated) matches.pop()

    return { path, matches, count: matches.length, truncated }
  },
}

/**
 * search_grep — Search file contents by regex in an Exegol container.
 */
export const searchGrepTool: Tool<
  { container: string; pattern: string; path?: string; include?: string },
  { pattern: string; matches: string[]; count: number; truncated: boolean } | { error: string }
> = {
  description:
    "Search file contents using regex in an Exegol container. " +
    "Returns matching lines with file paths and line numbers. Max 100 results.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().default("/root").describe("Directory to search in (default: /root)"),
    include: z.string().optional().describe("File pattern filter (e.g. '*.py', '*.conf')"),
  }),
  execute: async ({ container, pattern, path = "/root", include }) => {
    const escaped = shellEscape(path)
    const escapedPattern = pattern.replace(/'/g, "'\\''")
    const includeFlag = include ? `--include='${include}'` : ""
    const cmd = `grep -rn ${includeFlag} -E '${escapedPattern}' ${escaped} 2>/dev/null | head -101`

    const result = await dockerExec(container, cmd, { timeout: 15_000 })
    // grep exit 1 = no matches (not an error)
    if (result.exitCode > 1) {
      return { error: result.stderr || "Search failed" }
    }

    const matches = result.stdout.trim().split("\n").filter(Boolean)
    const truncated = matches.length > 100
    if (truncated) matches.pop()

    return { pattern, matches, count: matches.length, truncated }
  },
}

export const searchTools = {
  search_find: searchFindTool,
  search_grep: searchGrepTool,
}
