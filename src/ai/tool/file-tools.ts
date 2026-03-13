import { z } from "zod"
import type { Tool } from "ai"
import { dockerExec, shellEscape } from "./exec"
import { smartReplace } from "./fuzzyReplace"
import { generateDiff } from "./diff"

// Re-export for consumers that imported generateDiff from here
export { generateDiff } from "./diff"

// ── Tool definitions ──────────────────────────────────────────────

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
    offset: z.number().int().min(1).optional().describe("Start from this line (1-indexed)"),
    limit: z.number().int().min(1).max(2000).default(2000).describe("Max lines to return (default 2000)"),
  }),
  execute: async ({ container, filePath, offset, limit = 2000 }) => {
    const escaped = shellEscape(filePath)
    const typeCheck = await dockerExec(container, `test -d ${escaped} && echo DIR || echo FILE`)
    if (typeCheck.stdout.trim() === "DIR") {
      const result = await dockerExec(container, `ls -la ${escaped} | head -200`)
      if (result.exitCode !== 0) return { error: result.stderr || "Failed to list directory" }
      const lines = result.stdout.trimEnd().split("\n")
      return { filePath, content: result.stdout, lineCount: lines.length, totalLines: lines.length }
    }
    const mimeCheck = await dockerExec(container, `file -b --mime-type ${escaped}`)
    const mime = mimeCheck.stdout.trim()
    if (mime.startsWith("application/") && !mime.includes("json") && !mime.includes("xml") && !mime.includes("javascript") && !mime.includes("text")) {
      return { error: `Binary file (${mime}), cannot read` }
    }
    const wcResult = await dockerExec(container, `wc -l < ${escaped}`)
    const totalLines = parseInt(wcResult.stdout.trim()) || 0
    let cmd: string
    if (offset && offset > 1) { cmd = `tail -n +${offset} ${escaped} | head -n ${limit}` }
    else { cmd = `head -n ${limit} ${escaped}` }
    const result = await dockerExec(container, cmd)
    if (result.exitCode !== 0) return { error: result.stderr || `Failed to read: ${filePath}` }
    const lines = result.stdout.split("\n")
    const startLine = offset || 1
    const numbered = lines.map((line, i) => `${String(startLine + i).padStart(6)}  ${line}`).join("\n")
    return { filePath, content: numbered, lineCount: lines.length, totalLines }
  },
}

export const fileWriteTool: Tool<
  { container: string; filePath: string; content: string },
  { filePath: string; bytesWritten: number; diff: string; isNew: boolean } | { error: string }
> = {
  description:
    "Write content to a file in an Exegol container. Creates parent directories as needed. " +
    "Overwrites if the file already exists. Returns a diff of the changes.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    filePath: z.string().describe("Absolute path to file"),
    content: z.string().describe("Content to write"),
  }),
  execute: async ({ container, filePath, content }) => {
    const escaped = shellEscape(filePath)
    const dir = filePath.substring(0, filePath.lastIndexOf("/"))
    if (dir) await dockerExec(container, `mkdir -p ${shellEscape(dir)}`)

    let original = ""
    let isNew = true
    const readResult = await dockerExec(container, `cat ${escaped} 2>/dev/null`)
    if (readResult.exitCode === 0) { original = readResult.stdout; isNew = false }

    const diff = generateDiff(filePath, original, content)
    const result = await dockerExec(container, `cat > ${escaped}`, { stdin: content })
    if (result.exitCode !== 0) return { error: result.stderr || `Failed to write: ${filePath}` }
    return { filePath, bytesWritten: Buffer.byteLength(content), diff, isNew }
  },
}

export const fileEditTool: Tool<
  { container: string; filePath: string; oldString: string; newString: string; replaceAll?: boolean },
  { filePath: string; replacements: number; diff: string; matcher: string } | { error: string }
> = {
  description:
    "Edit a file in an Exegol container by replacing string matches. " +
    "Uses 9 fuzzy matchers (exact → trimmed → block-anchor → whitespace → indentation → escape → boundary → context → multi). " +
    "Set replaceAll to replace every occurrence; otherwise only the first unique match is replaced.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    filePath: z.string().describe("Absolute path to file"),
    oldString: z.string().describe("Text to find (fuzzy matching supported)"),
    newString: z.string().describe("Replacement text"),
    replaceAll: z.boolean().default(false).describe("Replace all occurrences"),
  }),
  execute: async ({ container, filePath, oldString, newString, replaceAll = false }) => {
    const escaped = shellEscape(filePath)
    const readResult = await dockerExec(container, `cat ${escaped}`)
    if (readResult.exitCode !== 0) return { error: readResult.stderr || `File not found: ${filePath}` }

    const original = readResult.stdout

    try {
      const { result: updated, matcherName } = smartReplace(original, oldString, newString, replaceAll)
      const diff = generateDiff(filePath, original, updated)
      const writeResult = await dockerExec(container, `cat > ${escaped}`, { stdin: updated })
      if (writeResult.exitCode !== 0) return { error: writeResult.stderr || "Failed to write changes" }

      const count = replaceAll ? (original.length - updated.replace(new RegExp(newString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").length) > 0 ? original.split(oldString).length - 1 : 1 : 1
      return { filePath, replacements: count, diff, matcher: matcherName }
    } catch (err) {
      if ((err as Error).message === "NOT_FOUND") {
        const lines = original.split("\n")
        const preview = lines.length > 20
          ? `File has ${lines.length} lines. First 10:\n${lines.slice(0, 10).join("\n")}`
          : `Full file (${lines.length} lines):\n${original.slice(0, 1000)}`
        return {
          error: `oldString not found in file (tried all 9 matchers). Make sure the text exists.\n\n${preview}`,
        }
      }
      return { error: (err as Error).message }
    }
  },
}

export const fileCreateDirTool: Tool<
  { container: string; dirPath: string },
  { dirPath: string; created: boolean } | { error: string }
> = {
  description: "Create a directory in an Exegol container. Creates parent directories as needed (like mkdir -p).",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    dirPath: z.string().describe("Absolute path to directory to create"),
  }),
  execute: async ({ container, dirPath }) => {
    const escaped = shellEscape(dirPath)
    const result = await dockerExec(container, `mkdir -p ${escaped}`)
    if (result.exitCode !== 0) return { error: result.stderr || `Failed to create directory: ${dirPath}` }
    return { dirPath, created: true }
  },
}

export const fileDeleteTool: Tool<
  { container: string; targetPath: string; recursive?: boolean },
  { targetPath: string; deleted: boolean } | { error: string }
> = {
  description:
    "Delete a file or directory in an Exegol container. " +
    "Set recursive=true to delete directories with contents. " +
    "Protected paths (/bin, /sbin, /usr, /lib, /boot, /dev, /proc, /sys) cannot be deleted.",
  inputSchema: z.object({
    container: z.string().describe("Exegol container name"),
    targetPath: z.string().describe("Absolute path to delete"),
    recursive: z.boolean().default(false).describe("Delete directories recursively"),
  }),
  execute: async ({ container, targetPath, recursive = false }) => {
    const PROTECTED = ["/bin", "/sbin", "/usr", "/lib", "/lib64", "/boot", "/dev", "/proc", "/sys", "/"]
    const normalized = targetPath.replace(/\/+$/, "") || "/"
    if (PROTECTED.includes(normalized)) return { error: `Cannot delete protected path: ${targetPath}` }

    const escaped = shellEscape(targetPath)
    const exists = await dockerExec(container, `test -e ${escaped} && echo EXISTS || echo MISSING`)
    if (exists.stdout.trim() !== "EXISTS") return { error: `Path not found: ${targetPath}` }

    const isDir = await dockerExec(container, `test -d ${escaped} && echo DIR || echo FILE`)
    if (isDir.stdout.trim() === "DIR" && !recursive) {
      return { error: `${targetPath} is a directory. Set recursive=true to delete it.` }
    }

    const cmd = recursive ? `rm -rf ${escaped}` : `rm -f ${escaped}`
    const result = await dockerExec(container, cmd)
    if (result.exitCode !== 0) return { error: result.stderr || `Failed to delete: ${targetPath}` }
    return { targetPath, deleted: true }
  },
}

export const fileTools = {
  file_read: fileReadTool,
  file_write: fileWriteTool,
  file_edit: fileEditTool,
  file_create_dir: fileCreateDirTool,
  file_delete: fileDeleteTool,
}
