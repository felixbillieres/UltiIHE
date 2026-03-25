/**
 * POST /api/search — Unified search across terminal ring buffers and container files.
 *
 * Terminal search is pure in-memory (instant).
 * File search uses `docker exec grep` (async, with timeout).
 */

import { Hono } from "hono"
import { z } from "zod"
import { terminalManager } from "../../terminal/manager"
import { dockerExec, shellEscape } from "../../ai/tool/exec"
import { isValidContainerName, validatePath } from "../../shared/validation"

export const searchRoutes = new Hono()

const SearchRequestSchema = z.object({
  query: z.string(),
  scopes: z.array(z.enum(["terminals", "files"])).optional().default(["terminals", "files"]),
  containers: z.array(z.string()).optional().default([]),
  filePath: z.string().optional(),
  fileInclude: z.string().optional(),
})

interface TerminalMatch {
  line: string
  lineIndex: number
  column: number
}

interface TerminalSearchResult {
  terminalId: string
  terminalName: string
  container: string
  matches: TerminalMatch[]
  matchCount: number
}

interface FileMatch {
  line: string
  lineNumber: number
  column: number
}

interface FileSearchResult {
  container: string
  filePath: string
  matches: FileMatch[]
  matchCount: number
}

// ── Terminal search (in-memory, instant) ───────────────────────

function searchTerminals(query: string): TerminalSearchResult[] {
  const results: TerminalSearchResult[] = []
  const lowerQuery = query.toLowerCase()
  const terminals = terminalManager.listTerminals()

  for (const t of terminals) {
    if (!t.alive) continue
    const terminal = terminalManager.getTerminal(t.id)
    if (!terminal) continue

    const matches: TerminalMatch[] = []
    for (let i = 0; i < terminal.ringBuffer.length; i++) {
      const line = terminal.ringBuffer[i]
      const lowerLine = line.toLowerCase()
      let col = lowerLine.indexOf(lowerQuery)
      while (col !== -1) {
        matches.push({ line, lineIndex: i, column: col })
        col = lowerLine.indexOf(lowerQuery, col + 1)
      }
    }

    if (matches.length > 0) {
      results.push({
        terminalId: t.id,
        terminalName: t.name,
        container: t.container,
        matches: matches.slice(0, 50), // cap per terminal
        matchCount: matches.length,
      })
    }
  }

  return results
}

// ── File search (docker exec grep, async) ──────────────────────

async function searchFiles(
  query: string,
  containers: string[],
  filePath?: string,
  fileInclude?: string,
): Promise<FileSearchResult[]> {
  const results: FileSearchResult[] = []

  for (const container of containers) {
    const searchPath = filePath || "/workspace"
    const includeFlag = fileInclude ? `--include=${shellEscape(fileInclude)}` : ""
    // -r recursive, -n line numbers, -i case insensitive, max 100 lines
    const cmd = `grep -rn -i ${includeFlag} -- ${shellEscape(query)} ${shellEscape(searchPath)} 2>/dev/null | head -101`

    try {
      const result = await dockerExec(container, cmd, { timeout: 10_000 })
      if (result.exitCode > 1) continue // grep error

      const lines = result.stdout.trim().split("\n").filter(Boolean)
      const byFile = new Map<string, FileMatch[]>()

      for (const raw of lines.slice(0, 100)) {
        // Format: filepath:linenum:content
        const firstColon = raw.indexOf(":")
        if (firstColon < 0) continue
        const secondColon = raw.indexOf(":", firstColon + 1)
        if (secondColon < 0) continue

        const fp = raw.substring(0, firstColon)
        const lineNum = parseInt(raw.substring(firstColon + 1, secondColon), 10)
        const content = raw.substring(secondColon + 1)
        const col = content.toLowerCase().indexOf(query.toLowerCase())

        if (!byFile.has(fp)) byFile.set(fp, [])
        byFile.get(fp)!.push({ line: content, lineNumber: lineNum, column: Math.max(0, col) })
      }

      for (const [fp, matches] of byFile) {
        results.push({
          container,
          filePath: fp,
          matches: matches.slice(0, 20),
          matchCount: matches.length,
        })
      }
    } catch {
      // timeout or error — skip this container
    }
  }

  return results
}

// ── Route ──────────────────────────────────────────────────────

searchRoutes.post("/search", async (c) => {
  const parsed = SearchRequestSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400)
  const body = parsed.data

  if (!body.query || body.query.trim().length === 0) {
    return c.json({ terminals: [], files: [] })
  }

  if (body.filePath && !validatePath(body.filePath)) {
    return c.json({ error: "Invalid file path" }, 400)
  }

  for (const name of body.containers) {
    if (!isValidContainerName(name)) {
      return c.json({ error: `Invalid container name: ${name}` }, 400)
    }
  }

  const query = body.query.trim()
  const scopes = body.scopes

  const terminalResults = scopes.includes("terminals") ? searchTerminals(query) : []

  const fileResults = scopes.includes("files") && body.containers.length > 0
    ? await searchFiles(query, body.containers, body.filePath, body.fileInclude)
    : []

  return c.json({ terminals: terminalResults, files: fileResults })
})
