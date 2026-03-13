/**
 * Fuzzy string replacement engine (ported from OpenCode).
 *
 * 9 matchers tried in sequence — the first match wins:
 * 1. Exact string match
 * 2. Lines with trimmed whitespace
 * 3. Block anchor (first/last line + Levenshtein similarity)
 * 4. Whitespace-normalized
 * 5. Indentation-flexible
 * 6. Escape-normalized
 * 7. Trimmed boundary
 * 8. Context-aware (first/last anchors + 50% middle similarity)
 * 9. Multi-occurrence (for replaceAll)
 */

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

// ── Replacer types & thresholds ───────────────────────────────────

type Replacer = (content: string, find: string) => Generator<string>

const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3

// ── Replacer implementations ─────────────────────────────────────

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

// ── Replacer pipeline ────────────────────────────────────────────

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

const MATCHER_NAMES = [
  "exact", "line-trimmed", "block-anchor", "whitespace-normalized",
  "indentation-flexible", "escape-normalized", "trimmed-boundary",
  "context-aware", "multi-occurrence",
]

/**
 * OpenCode-style replace: try 9 matchers in sequence.
 * Returns { result, matcherName } or throws Error("NOT_FOUND").
 */
export function smartReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): { result: string; matcherName: string } {
  for (let idx = 0; idx < ALL_REPLACERS.length; idx++) {
    const replacer = ALL_REPLACERS[idx]
    for (const search of replacer(content, oldString)) {
      const foundIdx = content.indexOf(search)
      if (foundIdx === -1) continue
      if (replaceAll) {
        return { result: content.replaceAll(search, newString), matcherName: MATCHER_NAMES[idx] }
      }
      // For single replace, ensure it's unique
      const lastIdx = content.lastIndexOf(search)
      if (foundIdx !== lastIdx) continue
      return {
        result: content.substring(0, foundIdx) + newString + content.substring(foundIdx + search.length),
        matcherName: MATCHER_NAMES[idx],
      }
    }
  }

  throw new Error("NOT_FOUND")
}
