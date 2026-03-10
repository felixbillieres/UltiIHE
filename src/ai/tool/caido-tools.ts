import { z } from "zod"
import type { Tool } from "ai"
import { getCaidoClient } from "../../server/services/caido"

/**
 * AI SDK tools for reading Caido proxy traffic.
 * Lets the AI analyze intercepted HTTP requests/responses.
 */

export const caidoReadTool: Tool<
  { requestId?: string; filter?: string; count?: number },
  | { requests: any[]; totalCount: number }
  | { request: any }
  | { error: string }
> = {
  description:
    "Read HTTP requests captured by the Caido proxy. " +
    "Without requestId: lists recent requests (optionally filtered with HTTPQL). " +
    'With requestId: gets full request/response with headers and body. ' +
    'Filter examples: req.host.cont:"example.com", resp.code.eq:200, req.method.eq:"POST".',
  inputSchema: z.object({
    requestId: z
      .string()
      .optional()
      .describe("Specific request ID for full details (from a previous list call)"),
    filter: z
      .string()
      .optional()
      .describe('HTTPQL filter, e.g. req.host.cont:"target.com" AND resp.code.eq:200'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Number of requests to return (default 20, max 100)"),
  }),
  execute: async ({ requestId, filter, count }) => {
    const client = getCaidoClient()
    if (!client) {
      return { error: "Caido is not connected. Ask the user to connect via the Proxy panel." }
    }

    try {
      if (requestId) {
        const detail = await client.getRequestById(requestId)
        return { request: detail }
      }

      const page = await client.getRequests({ first: count || 20, filter: filter || undefined })
      return {
        requests: page.requests.map((r) => ({
          id: r.id,
          method: r.method,
          host: r.host,
          path: r.path + (r.query ? `?${r.query}` : ""),
          scheme: r.scheme,
          statusCode: r.statusCode,
          responseLength: r.responseLength,
          roundtripTime: r.roundtripTime,
        })),
        totalCount: page.totalCount,
      }
    } catch (err) {
      return { error: (err as Error).message }
    }
  },
}

export const caidoScopeTool: Tool<
  Record<string, never>,
  { scopes: any[] } | { error: string }
> = {
  description:
    "List the current Caido proxy scopes. Shows which hosts/paths are in scope " +
    "for the engagement. Use this to understand what targets are authorized for testing.",
  inputSchema: z.object({}),
  execute: async () => {
    const client = getCaidoClient()
    if (!client) {
      return { error: "Caido is not connected. Ask the user to connect via the Proxy panel." }
    }

    try {
      const scopes = await client.getScopes()
      return { scopes }
    } catch (err) {
      return { error: (err as Error).message }
    }
  },
}

export const caidoTools = {
  caido_read: caidoReadTool,
  caido_scope: caidoScopeTool,
}
