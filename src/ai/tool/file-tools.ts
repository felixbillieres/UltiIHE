import { z } from "zod"
import type { Tool } from "ai"
import { dockerExec, shellEscape } from "./exec"

/**
 * file_read — Read a file or directory listing from an Exegol container.
 */
export const fileReadTool: Tool<
  { container: string; filePath: string; offset?: number; limit?: number },
  | { filePath: string; content: string; lineCount: number; totalLines: number }
  | { error: string }
> = {
  description:
    "Read a file from an Exegol container. Returns line-numbered content. " +
    "For directories, returns a listing. Supports offset/limit for large files.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    filePath: z.string().describe("Absolute path to file or directory"),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Start from this line (1-indexed)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .default(2000)
      .describe("Max lines to return (default 2000)"),
  }),
  execute: async ({ container, filePath, offset, limit = 2000 }) => {
    const escaped = shellEscape(filePath)

    // Directory check
    const typeCheck = await dockerExec(container, `test -d ${escaped} && echo DIR || echo FILE`)
    if (typeCheck.stdout.trim() === "DIR") {
      const result = await dockerExec(container, `ls -la ${escaped} | head -200`)
      if (result.exitCode !== 0) return { error: result.stderr || "Failed to list directory" }
      const lines = result.stdout.trimEnd().split("\n")
      return { filePath, content: result.stdout, lineCount: lines.length, totalLines: lines.length }
    }

    // Binary detection
    const mimeCheck = await dockerExec(container, `file -b --mime-type ${escaped}`)
    const mime = mimeCheck.stdout.trim()
    if (
      mime.startsWith("application/") &&
      !mime.includes("json") &&
      !mime.includes("xml") &&
      !mime.includes("javascript") &&
      !mime.includes("text")
    ) {
      return { error: `Binary file (${mime}), cannot read` }
    }

    // Total lines
    const wcResult = await dockerExec(container, `wc -l < ${escaped}`)
    const totalLines = parseInt(wcResult.stdout.trim()) || 0

    // Read with offset/limit
    let cmd: string
    if (offset && offset > 1) {
      cmd = `tail -n +${offset} ${escaped} | head -n ${limit}`
    } else {
      cmd = `head -n ${limit} ${escaped}`
    }

    const result = await dockerExec(container, cmd)
    if (result.exitCode !== 0) return { error: result.stderr || `Failed to read: ${filePath}` }

    // Add line numbers
    const lines = result.stdout.split("\n")
    const startLine = offset || 1
    const numbered = lines
      .map((line, i) => `${String(startLine + i).padStart(6)}  ${line}`)
      .join("\n")

    return { filePath, content: numbered, lineCount: lines.length, totalLines }
  },
}

/**
 * file_write — Write/create a file in an Exegol container.
 */
export const fileWriteTool: Tool<
  { container: string; filePath: string; content: string },
  { filePath: string; bytesWritten: number } | { error: string }
> = {
  description:
    "Write content to a file in an Exegol container. Creates parent directories as needed. " +
    "Overwrites if the file already exists.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    filePath: z.string().describe("Absolute path to file"),
    content: z.string().describe("Content to write"),
  }),
  execute: async ({ container, filePath, content }) => {
    const escaped = shellEscape(filePath)
    const dir = filePath.substring(0, filePath.lastIndexOf("/"))
    if (dir) {
      await dockerExec(container, `mkdir -p ${shellEscape(dir)}`)
    }

    // Pipe via stdin to avoid command-line length limits
    const result = await dockerExec(container, `cat > ${escaped}`, { stdin: content })
    if (result.exitCode !== 0) return { error: result.stderr || `Failed to write: ${filePath}` }

    return { filePath, bytesWritten: Buffer.byteLength(content) }
  },
}

/**
 * file_edit — Find & replace in a file inside an Exegol container.
 */
export const fileEditTool: Tool<
  {
    container: string
    filePath: string
    oldString: string
    newString: string
    replaceAll?: boolean
  },
  { filePath: string; replacements: number } | { error: string }
> = {
  description:
    "Edit a file in an Exegol container by replacing exact string matches. " +
    "Set replaceAll to replace every occurrence; otherwise only the first match is replaced.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    filePath: z.string().describe("Absolute path to file"),
    oldString: z.string().describe("Exact text to find"),
    newString: z.string().describe("Replacement text"),
    replaceAll: z.boolean().default(false).describe("Replace all occurrences"),
  }),
  execute: async ({ container, filePath, oldString, newString, replaceAll = false }) => {
    const escaped = shellEscape(filePath)

    // Read current content
    const readResult = await dockerExec(container, `cat ${escaped}`)
    if (readResult.exitCode !== 0)
      return { error: readResult.stderr || `File not found: ${filePath}` }

    const original = readResult.stdout
    if (!original.includes(oldString)) {
      return { error: "oldString not found in file. Make sure it matches exactly (including whitespace and newlines)." }
    }

    let updated: string
    let count: number
    if (replaceAll) {
      count = original.split(oldString).length - 1
      updated = original.split(oldString).join(newString)
    } else {
      count = 1
      const idx = original.indexOf(oldString)
      updated = original.slice(0, idx) + newString + original.slice(idx + oldString.length)
    }

    // Write back via stdin
    const writeResult = await dockerExec(container, `cat > ${escaped}`, { stdin: updated })
    if (writeResult.exitCode !== 0) return { error: writeResult.stderr || "Failed to write changes" }

    return { filePath, replacements: count }
  },
}

export const fileTools = {
  file_read: fileReadTool,
  file_write: fileWriteTool,
  file_edit: fileEditTool,
}
