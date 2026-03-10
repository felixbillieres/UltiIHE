import { z } from "zod"
import type { Tool } from "ai"
import { questionQueue } from "./question-queue"

/**
 * user_question — Ask the user a question and wait for their response.
 */
export const userQuestionTool: Tool<
  { question: string; options?: string[] },
  { answer: string }
> = {
  description:
    "Ask the user a question and wait for their response. " +
    "Use when you need clarification, confirmation, or a choice between options.",
  inputSchema: z.object({
    question: z.string().describe("The question to ask"),
    options: z.array(z.string()).optional().describe("Optional list of choices"),
  }),
  execute: async ({ question, options }) => {
    const answer = await questionQueue.ask(question, options)
    return { answer }
  },
}

/**
 * Create a batch tool that dispatches calls to other tools in parallel.
 * Needs the full tool map to look up tools by name.
 */
export function createBatchTool(
  toolMap: Record<string, { execute: (args: any) => Promise<any> }>,
): Tool<
  { calls: { tool: string; args: Record<string, any> }[] },
  {
    results: {
      tool: string
      status: "ok" | "error"
      result?: any
      error?: string
    }[]
  }
> {
  const BLOCKED = new Set(["batch", "user_question"])

  return {
    description:
      "Execute multiple tool calls in parallel (max 25). " +
      "Useful for running several independent operations at once " +
      "(e.g., reading multiple files, searching in parallel). Cannot nest batch calls.",
    inputSchema: z.object({
      calls: z
        .array(
          z.object({
            tool: z.string().describe("Tool name to call"),
            args: z.record(z.any()).describe("Arguments for the tool"),
          }),
        )
        .min(1)
        .max(25),
    }),
    execute: async ({ calls }) => {
      const promises = calls.map(async (call) => {
        if (BLOCKED.has(call.tool)) {
          return {
            tool: call.tool,
            status: "error" as const,
            error: `Cannot use ${call.tool} inside batch`,
          }
        }

        const target = toolMap[call.tool]
        if (!target) {
          return {
            tool: call.tool,
            status: "error" as const,
            error: `Unknown tool: ${call.tool}`,
          }
        }

        try {
          const result = await target.execute(call.args)
          return { tool: call.tool, status: "ok" as const, result }
        } catch (err) {
          return {
            tool: call.tool,
            status: "error" as const,
            error: (err as Error).message,
          }
        }
      })

      const results = await Promise.all(promises)
      return { results }
    },
  }
}
