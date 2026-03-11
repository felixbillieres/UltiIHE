import { useState, useEffect, memo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ComponentProps } from "react"

// ── Shiki lazy loader ────────────────────────────────────────────
// Load Shiki once, cache globally. Falls back to plain <code> if loading.

let highlighterPromise: Promise<any> | null = null
let highlighterInstance: any = null

function getHighlighter() {
  if (highlighterInstance) return Promise.resolve(highlighterInstance)
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(async (shiki) => {
      const hl = await shiki.createHighlighter({
        themes: ["github-dark-default"],
        langs: [
          "javascript", "typescript", "python", "bash", "shell", "json",
          "yaml", "html", "css", "sql", "go", "rust", "java", "c", "cpp",
          "ruby", "php", "markdown", "xml", "toml", "ini", "dockerfile",
          "diff", "lua", "powershell", "plaintext",
        ],
      })
      highlighterInstance = hl
      return hl
    })
  }
  return highlighterPromise
}

// Pre-load highlighter on module import (non-blocking)
getHighlighter().catch(() => {})

// ── Highlighted code block ───────────────────────────────────────

const HighlightedCode = memo(function HighlightedCode({
  code,
  language,
}: {
  code: string
  language: string
}) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getHighlighter()
      .then((hl) => {
        if (cancelled) return
        // Map common aliases
        const langMap: Record<string, string> = {
          sh: "bash", zsh: "bash", fish: "bash",
          js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
          py: "python", rb: "ruby", rs: "rust",
          yml: "yaml", tf: "hcl", conf: "ini", cfg: "ini",
        }
        let lang = langMap[language] || language
        // Check if language is supported, fallback to plaintext
        const loadedLangs = hl.getLoadedLanguages()
        if (!loadedLangs.includes(lang)) lang = "plaintext"

        const result = hl.codeToHtml(code, {
          lang,
          theme: "github-dark-default",
        })
        if (!cancelled) setHtml(result)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [code, language])

  if (html) {
    return (
      <div
        className="my-2 rounded-lg border border-border-weak overflow-x-auto [&_pre]:!bg-[#0d1117] [&_pre]:p-3 [&_pre]:text-xs [&_pre]:leading-relaxed [&_code]:!text-xs [&_code]:!font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  // Fallback while loading
  return (
    <pre className="my-2 p-3 rounded-lg bg-surface-1 border border-border-weak overflow-x-auto">
      <code className="text-xs font-mono text-text-strong">{code}</code>
    </pre>
  )
})

// ── Markdown components ──────────────────────────────────────────

const mdComponents: ComponentProps<typeof Markdown>["components"] = {
  h1: ({ children }) => (
    <div className="font-bold text-text-strong text-base mt-2 mb-1">{children}</div>
  ),
  h2: ({ children }) => (
    <div className="font-semibold text-text-strong mt-2 mb-0.5">{children}</div>
  ),
  h3: ({ children }) => (
    <div className="font-semibold text-text-strong text-xs mt-2 mb-0.5">{children}</div>
  ),
  p: ({ children }) => <p className="my-1">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1 ml-4 space-y-0.5 list-disc list-outside">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 ml-4 space-y-0.5 list-decimal list-outside">{children}</ol>
  ),
  li: ({ children }) => <li className="text-text-base">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-text-strong">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const langMatch = className?.match(/language-(\w+)/)
    const language = langMatch?.[1] || ""
    const codeStr = String(children).replace(/\n$/, "")
    const isBlock = !!langMatch || codeStr.includes("\n")

    if (isBlock) {
      return <HighlightedCode code={codeStr} language={language || "plaintext"} />
    }

    return (
      <code className="px-1 py-0.5 rounded bg-surface-2 text-xs font-mono text-accent">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/30 pl-3 my-1 text-text-weak italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border-weak px-2 py-1 bg-surface-1 text-text-strong font-semibold text-left">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border-weak px-2 py-1">{children}</td>
  ),
  hr: () => <hr className="my-2 border-border-weak" />,
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {content}
    </Markdown>
  )
}
