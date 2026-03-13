/**
 * Unified diff generation for file edit previews.
 */

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
