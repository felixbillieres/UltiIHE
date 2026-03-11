import { z } from "zod"
import type { Tool } from "ai"
import { dockerExec, shellEscape } from "./exec"

// ── Levenshtein distance ──────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length)
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
    }
  }
  return matrix[a.length][b.length]
}

// ── Fuzzy edit matchers (ported from OpenCode) ────────────────────
// Each replacer is a generator that yields matching substrings in the content.
// They are tried in order; the first match wins.

type Replacer = (content: string, find: string) => Generator<string>

const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3

/** 1. Exact string match */
const SimpleReplacer: Replacer = function* (_content, find) {
  yield find
}

/** 2. Match lines with trimmed whitespace */
const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) { matches = false; break }
    }
    if (matches) {
      let startIdx = 0
      for (let k = 0; k < i; k++) startIdx += originalLines[k].length + 1
      let endIdx = startIdx
      for (let k = 0; k < searchLines.length; k++) {
        endIdx += originalLines[i + k].length
        if (k < searchLines.length - 1) endIdx += 1
      }
      yield content.substring(startIdx, endIdx)
    }
  }
}

/** 3. Use first/last lines as anchors + Levenshtein similarity on middle */
const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines.length < 3) return
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()

  const firstLineSearch = searchLines[0].trim()
  const lastLineSearch = searchLines[searchLines.length - 1].trim()
  const searchBlockSize = searchLines.length

  const candidates: { startLine: number; endLine: number }[] = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) continue
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        candidates.push({ startLine: i, endLine: j })
        break
      }
    }
  }

  if (candidates.length === 0) return

  function getMatch(startLine: number, endLine: number) {
    let s = 0
    for (let k = 0; k < startLine; k++) s += originalLines[k].length + 1
    let e = s
    for (let k = startLine; k <= endLine; k++) {
      e += originalLines[k].length
      if (k < endLine) e += 1
    }
    return content.substring(s, e)
  }

  function calcSimilarity(startLine: number, endLine: number): number {
    const actualBlockSize = endLine - startLine + 1
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2)
    if (linesToCheck <= 0) return 1.0
    let sim = 0
    for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
      const oLine = originalLines[startLine + j].trim()
      const sLine = searchLines[j].trim()
      const maxLen = Math.max(oLine.length, sLine.length)
      if (maxLen === 0) continue
      sim += (1 - levenshtein(oLine, sLine) / maxLen) / linesToCheck
    }
    return sim
  }

  if (candidates.length === 1) {
    const { startLine, endLine } = candidates[0]
    if (calcSimilarity(startLine, endLine) >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      yield getMatch(startLine, endLine)
    }
    return
  }

  let bestMatch: { startLine: number; endLine: number } | null = null
  let maxSim = -1
  for (const c of candidates) {
    const sim = calcSimilarity(c.startLine, c.endLine)
    if (sim > maxSim) { maxSim = sim; bestMatch = c }
  }
  if (maxSim >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
    yield getMatch(bestMatch.startLine, bestMatch.endLine)
  }
}

/** 4. Normalize all whitespace to single space and match */
const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const norm = (text: string) => text.replace(/\s+/g, " ").trim()
  const normalizedFind = norm(find)
  const lines = content.split("\n")

  for (let i = 0; i < lines.length; i++) {
    if (norm(lines[i]) === normalizedFind) { yield lines[i]; continue }
    const normalizedLine = norm(lines[i])
    if (normalizedLine.includes(normalizedFind)) {
      const words = find.trim().split(/\s+/)
      if (words.length > 0) {
        const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")
        try {
          const match = lines[i].match(new RegExp(pattern))
          if (match) yield match[0]
        } catch {}
      }
    }
  }

  const findLines = find.split("\n")
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length)
      if (norm(block.join("\n")) === normalizedFind) yield block.join("\n")
    }
  }
}

/** 5. Strip common indentation and match */
const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndent = (text: string) => {
    const lines = text.split("\n")
    const nonEmpty = lines.filter((l) => l.trim().length > 0)
    if (nonEmpty.length === 0) return text
    const minIndent = Math.min(...nonEmpty.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0))
    return lines.map((l) => (l.trim().length === 0 ? l : l.slice(minIndent))).join("\n")
  }
  const normalizedFind = removeIndent(find)
  const contentLines = content.split("\n")
  const findLines = find.split("\n")
  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n")
    if (removeIndent(block) === normalizedFind) yield block
  }
}

/** 6. Unescape escape sequences and match */
const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescape = (str: string): string =>
    str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (m, c) => {
      switch (c) {
        case "n": return "\n"
        case "t": return "\t"
        case "r": return "\r"
        case "'": return "'"
        case '"': return '"'
        case "`": return "`"
        case "\\": return "\\"
        case "\n": return "\n"
        case "$": return "$"
        default: return m
      }
    })
  const unescapedFind = unescape(find)
  if (content.includes(unescapedFind)) { yield unescapedFind; return }
  const lines = content.split("\n")
  const findLines = unescapedFind.split("\n")
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")
    if (unescape(block) === unescapedFind) yield block
  }
}

/** 7. Match trimmed boundaries */
const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim()
  if (trimmedFind === find) return
  if (content.includes(trimmedFind)) { yield trimmedFind; return }
  const lines = content.split("\n")
  const findLines = find.split("\n")
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")
    if (block.trim() === trimmedFind) yield block
  }
}

/** 8. Context-aware: first/last line anchors + 50% middle similarity */
const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n")
  if (findLines.length < 3) return
  if (findLines[findLines.length - 1] === "") findLines.pop()
  const contentLines = content.split("\n")
  const firstLine = findLines[0].trim()
  const lastLine = findLines[findLines.length - 1].trim()

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() === lastLine) {
        const blockLines = contentLines.slice(i, j + 1)
        if (blockLines.length === findLines.length) {
          let matching = 0, total = 0
          for (let k = 1; k < blockLines.length - 1; k++) {
            const bl = blockLines[k].trim(), fl = findLines[k].trim()
            if (bl.length > 0 || fl.length > 0) { total++; if (bl === fl) matching++ }
          }
          if (total === 0 || matching / total >= 0.5) {
            yield blockLines.join("\n")
            return
          }
        }
        break
      }
    }
  }
}

/** 9. Yield all exact matches (for replaceAll) */
const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  let startIndex = 0
  while (true) {
    const index = content.indexOf(find, startIndex)
    if (index === -1) break
    yield find
    startIndex = index + find.length
  }
}

const ALL_REPLACERS: Replacer[] = [
  SimpleReplacer,
  LineTrimmedReplacer,
  BlockAnchorReplacer,
  WhitespaceNormalizedReplacer,
  IndentationFlexibleReplacer,
  EscapeNormalizedReplacer,
  TrimmedBoundaryReplacer,
  ContextAwareReplacer,
  MultiOccurrenceReplacer,
]

/**
 * OpenCode-style replace: try 9 matchers in sequence.
 * Returns { result, matcherName } or throws.
 */
function smartReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): { result: string; matcherName: string } {
  const matcherNames = [
    "exact", "line-trimmed", "block-anchor", "whitespace-normalized",
    "indentation-flexible", "escape-normalized", "trimmed-boundary",
    "context-aware", "multi-occurrence",
  ]

  for (let idx = 0; idx < ALL_REPLACERS.length; idx++) {
    const replacer = ALL_REPLACERS[idx]
    for (const search of replacer(content, oldString)) {
      const foundIdx = content.indexOf(search)
      if (foundIdx === -1) continue
      if (replaceAll) {
        return { result: content.replaceAll(search, newString), matcherName: matcherNames[idx] }
      }
      // For single replace, ensure it's unique
      const lastIdx = content.lastIndexOf(search)
      if (foundIdx !== lastIdx) continue
      return {
        result: content.substring(0, foundIdx) + newString + content.substring(foundIdx + search.length),
        matcherName: matcherNames[idx],
      }
    }
  }

  throw new Error("NOT_FOUND")
}

// ── Unified diff generation ───────────────────────────────────────

export function generateDiff(
  filePath: string,
  original: string,
  modified: string,
  contextLines = 3,
): string {
  const oldLines = original.split("\n")
  const newLines = modified.split("\n")

  if (original === modified) return "(no changes)"

  const hunks: string[] = []
  hunks.push(`--- a${filePath}`)
  hunks.push(`+++ b${filePath}`)

  const maxLen = Math.max(oldLines.length, newLines.length)
  let i = 0

  while (i < maxLen) {
    if (i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i]) { i++; continue }

    const hunkStart = Math.max(0, i - contextLines)
    let diffEnd = i
    while (diffEnd < maxLen) {
      if (diffEnd < oldLines.length && diffEnd < newLines.length && oldLines[diffEnd] === newLines[diffEnd]) {
        let allMatch = true
        for (let k = 0; k < contextLines * 2 && diffEnd + k < maxLen; k++) {
          if (diffEnd + k >= oldLines.length || diffEnd + k >= newLines.length || oldLines[diffEnd + k] !== newLines[diffEnd + k]) {
            allMatch = false; break
          }
        }
        if (allMatch) break
      }
      diffEnd++
    }

    const hunkEnd = Math.min(maxLen, diffEnd + contextLines)
    const oldStart = hunkStart + 1
    const oldCount = Math.min(hunkEnd, oldLines.length) - hunkStart
    const newStart = hunkStart + 1
    const newCount = Math.min(hunkEnd, newLines.length) - hunkStart
    hunks.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`)

    for (let j = hunkStart; j < i; j++) { if (j < oldLines.length) hunks.push(` ${oldLines[j]}`) }
    for (let j = i; j < diffEnd; j++) { if (j < oldLines.length) hunks.push(`-${oldLines[j]}`) }
    for (let j = i; j < diffEnd; j++) { if (j < newLines.length) hunks.push(`+${newLines[j]}`) }
    for (let j = diffEnd; j < hunkEnd && j < oldLines.length; j++) { hunks.push(` ${oldLines[j]}`) }

    i = hunkEnd
  }

  return hunks.join("\n")
}

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
