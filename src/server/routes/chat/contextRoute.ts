import { Hono } from "hono"
import { terminalManager } from "../../../terminal/manager"
import { allTools, readOnlyTools } from "../../../ai/tool"
import type { ReasoningMode } from "./systemPrompt"
import {
  calculateBudget,
  buildAdaptivePrompt,
  buildContextBreakdown,
} from "../../../ai/context"
import { resolveContextWindow } from "./contextResolver"

export const contextRoute = new Hono()

contextRoute.post("/context", async (c) => {
  const body = await c.req.json()
  const {
    messages = [],
    providerId,
    modelId,
    containerIds,
    activeTerminalId,
    mode = "build",
  } = body as {
    messages: Array<{ role: string; content: string }>
    providerId: string
    modelId: string
    containerIds?: string[]
    activeTerminalId?: string
    mode?: ReasoningMode
  }

  const contextWindow = resolveContextWindow(providerId, modelId)
  const budget = calculateBudget(contextWindow)

  let terminalContext = ""
  if (activeTerminalId) {
    try {
      terminalContext = terminalManager.getOutput(activeTerminalId)
      const lines = terminalContext.split("\n")
      const maxLines = budget.promptTier === "minimal" ? 30 : budget.promptTier === "medium" ? 60 : 100
      if (lines.length > maxLines) {
        terminalContext = lines.slice(-maxLines).join("\n")
      }
    } catch {}
  }
  const activeTerminals = terminalManager.listTerminals()

  const systemPrompt = buildAdaptivePrompt({
    containerIds: containerIds || [],
    terminalContext,
    activeTerminals,
    mode,
    tier: budget.promptTier,
  })

  const tools = mode === "plan" ? readOnlyTools : allTools
  const toolCount = Math.min(Object.keys(tools).length, budget.maxTools)
  const breakdown = buildContextBreakdown(systemPrompt, toolCount, messages, budget.inputBudget)

  return c.json({
    ...breakdown,
    contextWindow,
    outputReserve: budget.outputReserve,
    promptTier: budget.promptTier,
    maxTools: budget.maxTools,
    pruneNeeded: false,
  })
})
