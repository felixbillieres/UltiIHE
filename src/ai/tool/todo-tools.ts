import { z } from "zod"
import type { Tool } from "ai"

export interface Todo {
  id: string
  status: "pending" | "in-progress" | "done"
  content: string
  priority?: "low" | "medium" | "high"
}

// In-memory storage — resets on server restart.
// Future: persist per-session in SQLite.
let todos: Todo[] = []

/**
 * todo_read — Read the current todo/task list.
 */
export const todoReadTool: Tool<Record<string, never>, { todos: Todo[]; count: number }> = {
  description:
    "Read the current todo/task list. Use this to check pentest progress, " +
    "remaining targets, and completed work.",
  inputSchema: z.object({}),
  execute: async () => {
    return { todos: [...todos], count: todos.length }
  },
}

/**
 * todo_write — Replace the entire todo list.
 */
export const todoWriteTool: Tool<
  {
    todos: {
      id?: string
      status: "pending" | "in-progress" | "done"
      content: string
      priority?: "low" | "medium" | "high"
    }[]
  },
  { todos: Todo[]; count: number }
> = {
  description:
    "Update the todo/task list (replaces the entire list). " +
    "Track pentest progress: recon tasks, exploitation targets, report items.",
  inputSchema: z.object({
    todos: z.array(
      z.object({
        id: z.string().optional().describe("Todo ID (auto-generated if omitted)"),
        status: z.enum(["pending", "in-progress", "done"]),
        content: z.string().describe("Task description"),
        priority: z.enum(["low", "medium", "high"]).optional(),
      }),
    ),
  }),
  execute: async ({ todos: incoming }) => {
    todos = incoming.map((t, i) => ({
      id: t.id || `todo-${Date.now()}-${i}`,
      status: t.status,
      content: t.content,
      priority: t.priority,
    }))
    return { todos: [...todos], count: todos.length }
  },
}

export const todoTools = {
  todo_read: todoReadTool,
  todo_write: todoWriteTool,
}
