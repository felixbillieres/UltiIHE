/**
 * File icons powered by material-file-icons (377 icons, VSCode Material Icon Theme).
 * Single import, automatic filename-to-SVG mapping.
 */

import { getIcon } from "material-file-icons"
import { Folder, FolderOpen } from "lucide-react"
import { sanitizeHtml } from "../../utils/sanitize"

// ── File icon ────────────────────────────────────────────────

const sizeClasses = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
}

export function FileIcon({
  filename,
  size = "sm",
  className = "",
}: {
  filename: string
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const icon = getIcon(filename)
  const s = sizeClasses[size]
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${s} ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(icon.svg) }}
    />
  )
}

// ── Directory icon ───────────────────────────────────────────

const DIR_COLORS: Record<string, string> = {
  workspace: "text-accent",
  ".git": "text-orange-400",
  node_modules: "text-text-weaker",
  venv: "text-text-weaker",
  __pycache__: "text-text-weaker",
  ".cache": "text-text-weaker",
  tools: "text-green-400",
  bin: "text-green-400",
  sbin: "text-green-400",
  ".ihe": "text-accent",
  screenshots: "text-purple-400",
}

export function DirIcon({
  name,
  expanded = false,
  size = "sm",
  className = "",
}: {
  name: string
  expanded?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const s = sizeClasses[size]
  const color = DIR_COLORS[name.toLowerCase()] || "text-text-weak"
  const Icon = expanded ? FolderOpen : Folder
  return <Icon className={`${s} shrink-0 ${color} ${className}`} />
}
