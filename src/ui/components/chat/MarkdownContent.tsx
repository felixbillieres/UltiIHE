import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ComponentProps } from "react"

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
    const isBlock = className?.startsWith("language-") || String(children).includes("\n")
    if (isBlock) {
      return (
        <pre className="my-2 p-3 rounded-lg bg-surface-1 border border-border-weak overflow-x-auto">
          <code className="text-xs font-mono text-text-strong">{children}</code>
        </pre>
      )
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
