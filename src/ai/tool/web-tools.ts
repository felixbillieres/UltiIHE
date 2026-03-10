import { z } from "zod"
import type { Tool } from "ai"
import TurndownService from "turndown"

const MAX_RESPONSE = 100 * 1024 // 100KB
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB

// ── HTML processing ─────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim()
}

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndown.remove(["script", "style", "meta", "link", "noscript"])
  return turndown.turndown(html)
}

function truncate(content: string, max = MAX_RESPONSE): { content: string; truncated: boolean } {
  if (content.length <= max) return { content, truncated: false }
  return { content: content.slice(0, max) + "\n\n[truncated]", truncated: true }
}

// ── Shared headers ──────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"

function acceptHeader(format: string): string {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1"
    case "text":
      return "text/plain;q=1.0, text/html;q=0.8, */*;q=0.1"
    case "html":
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, */*;q=0.1"
    default:
      return "text/html,application/xhtml+xml,*/*;q=0.8"
  }
}

// ── web_fetch ───────────────────────────────────────────────────

export const webFetchTool: Tool<
  { url: string; format?: "text" | "markdown" | "html"; timeout?: number },
  | { url: string; status: number; contentType: string; content: string; truncated: boolean }
  | { error: string }
> = {
  description:
    "Fetch content from a URL. Useful for reading CVE databases, exploit-db, " +
    "documentation, or any web resource. Supports text, markdown, and HTML formats.",
  inputSchema: z.object({
    url: z.string().url().describe("URL to fetch"),
    format: z
      .enum(["text", "markdown", "html"])
      .default("markdown")
      .describe("Output format: 'markdown' (default), 'text' (stripped), or 'html' (raw)"),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(120)
      .default(30)
      .describe("Timeout in seconds (default 30)"),
  }),
  execute: async ({ url, format = "markdown", timeout = 30 }) => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout * 1000)

      const headers = {
        "User-Agent": UA,
        Accept: acceptHeader(format),
        "Accept-Language": "en-US,en;q=0.9",
      }

      let response = await fetch(url, { signal: controller.signal, headers })

      // Retry with honest UA if Cloudflare bot detection triggers
      if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
        response = await fetch(url, {
          signal: controller.signal,
          headers: { ...headers, "User-Agent": "UltiIHE" },
        })
      }

      clearTimeout(timer)

      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` }
      }

      // Size guard
      const contentLength = response.headers.get("content-length")
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        return { error: "Response too large (exceeds 5MB)" }
      }

      const raw = await response.text()
      const contentType = response.headers.get("content-type") || ""
      const isHtml = contentType.includes("text/html")

      let processed: string
      switch (format) {
        case "markdown":
          processed = isHtml ? htmlToMarkdown(raw) : raw
          break
        case "text":
          processed = isHtml ? stripHtml(raw) : raw
          break
        case "html":
        default:
          processed = raw
          break
      }

      const { content, truncated } = truncate(processed)
      return { url, status: response.status, contentType, content, truncated }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("abort") || message.includes("AbortError"))
        return { error: `Timed out after ${timeout}s` }
      return { error: message }
    }
  },
}

// ── web_search (Exa MCP) ────────────────────────────────────────

interface ExaMcpResponse {
  jsonrpc: string
  result: {
    content: Array<{ type: string; text: string }>
  }
}

export const webSearchTool: Tool<
  {
    query: string
    numResults?: number
    type?: "auto" | "fast" | "deep"
  },
  { query: string; content: string } | { error: string }
> = {
  description:
    `Search the web using Exa AI. Use this to find CVEs, exploits, documentation, ` +
    `writeups, or any information relevant to a pentest engagement. Current year: ${new Date().getFullYear()}.`,
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe("Number of results (default 8)"),
    type: z
      .enum(["auto", "fast", "deep"])
      .default("auto")
      .describe("'auto' (balanced), 'fast' (quick), or 'deep' (comprehensive)"),
  }),
  execute: async ({ query, numResults = 8, type = "auto" }) => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 25_000)

      const response = await fetch("https://mcp.exa.ai/mcp", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "web_search_exa",
            arguments: {
              query,
              type,
              numResults,
              livecrawl: "fallback",
            },
          },
        }),
      })

      clearTimeout(timer)

      if (!response.ok) {
        const text = await response.text()
        return { error: `Exa search error (${response.status}): ${text}` }
      }

      const responseText = await response.text()

      // Parse SSE response (Exa returns data: lines)
      for (const line of responseText.split("\n")) {
        if (line.startsWith("data: ")) {
          const data: ExaMcpResponse = JSON.parse(line.substring(6))
          if (data.result?.content?.length > 0) {
            const { content, truncated } = truncate(data.result.content[0].text)
            return { query, content: truncated ? content : content }
          }
        }
      }

      // Fallback: try parsing as plain JSON (non-SSE response)
      try {
        const data: ExaMcpResponse = JSON.parse(responseText)
        if (data.result?.content?.length > 0) {
          const { content } = truncate(data.result.content[0].text)
          return { query, content }
        }
      } catch {
        // Not JSON either
      }

      return { error: "No results found. Try a different query." }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("abort") || message.includes("AbortError"))
        return { error: "Search timed out (25s)" }
      return { error: message }
    }
  },
}

export const webTools = {
  web_fetch: webFetchTool,
  web_search: webSearchTool,
}
