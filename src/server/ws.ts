import { z } from "zod"
import { terminalManager } from "../terminal/manager"
import { commandQueue } from "../terminal/command-queue"
import { questionQueue } from "../ai/tool/question-queue"
import { toolApprovalQueue } from "../ai/tool/tool-approval"
import { opsTracker } from "../terminal/ops-tracker"
import { CONTAINER_NAME_RE } from "../shared/validation"
import type { ServerWebSocket } from "bun"

// --- Message Schemas ---

const terminalCreateSchema = z.object({
  type: z.literal("terminal:create"),
  data: z.object({
    container: z.string().regex(CONTAINER_NAME_RE, "Invalid container name"),
    name: z.string().optional(),
    cols: z.number().int().min(1).max(500).optional(),
    rows: z.number().int().min(1).max(200).optional(),
  }),
})

const terminalInputSchema = z.object({
  type: z.literal("terminal:input"),
  data: z.object({
    terminalId: z.string().uuid(),
    input: z.string(),
  }),
})

const terminalResizeSchema = z.object({
  type: z.literal("terminal:resize"),
  data: z.object({
    terminalId: z.string().uuid(),
    cols: z.number().int().min(1).max(500),
    rows: z.number().int().min(1).max(200),
  }),
})

const terminalCloseSchema = z.object({
  type: z.literal("terminal:close"),
  data: z.object({
    terminalId: z.string().uuid(),
  }),
})

const commandApproveSchema = z.object({
  type: z.literal("command:approve"),
  data: z.object({
    commandId: z.string(),
    allowAll: z.boolean().optional(),
    editedCommand: z.string().optional(),
  }),
})

const commandRejectSchema = z.object({
  type: z.literal("command:reject"),
  data: z.object({
    commandId: z.string(),
  }),
})

const commandSetModeSchema = z.object({
  type: z.literal("command:set-mode"),
  data: z.object({
    mode: z.enum(["ask", "auto-run", "allow-all-session"]),
  }),
})

const questionAnswerSchema = z.object({
  type: z.literal("question:answer"),
  data: z.object({
    questionId: z.string(),
    answer: z.string(),
  }),
})

const toolApproveSchema = z.object({
  type: z.literal("tool:approve"),
  data: z.object({
    id: z.string(),
    allowAlways: z.boolean().optional(),
  }),
})

const toolRejectSchema = z.object({
  type: z.literal("tool:reject"),
  data: z.object({
    id: z.string(),
  }),
})

const toolApproveAllSchema = z.object({
  type: z.literal("tool:approve-all"),
  data: z.object({
    allowAlways: z.boolean().optional(),
  }),
})

const toolRejectAllSchema = z.object({
  type: z.literal("tool:reject-all"),
  data: z.object({}),
})

const toolSetModeSchema = z.object({
  type: z.literal("tool:set-mode"),
  data: z.object({
    mode: z.enum(["ask", "auto-run"]),
  }),
})

const toolPauseSchema = z.object({
  type: z.literal("tool:pause"),
  data: z.object({}),
})

const toolResumeSchema = z.object({
  type: z.literal("tool:resume"),
  data: z.object({}),
})

const commandPauseSchema = z.object({
  type: z.literal("command:pause"),
  data: z.object({}),
})

const commandResumeSchema = z.object({
  type: z.literal("command:resume"),
  data: z.object({}),
})

const terminalRequestSuggestionSchema = z.object({
  type: z.literal("terminal:request-suggestion"),
  data: z.object({
    terminalId: z.string(),
  }),
})

const opsStopOneSchema = z.object({
  type: z.literal("ops:stop-one"),
  data: z.object({
    opId: z.string(),
  }),
})

const opsStopAllSchema = z.object({
  type: z.literal("ops:stop-all"),
  data: z.object({}),
})

const clientMessageSchema = z.discriminatedUnion("type", [
  terminalCreateSchema,
  terminalInputSchema,
  terminalResizeSchema,
  terminalCloseSchema,
  commandApproveSchema,
  commandRejectSchema,
  commandSetModeSchema,
  questionAnswerSchema,
  toolApproveSchema,
  toolRejectSchema,
  toolApproveAllSchema,
  toolRejectAllSchema,
  toolSetModeSchema,
  toolPauseSchema,
  toolResumeSchema,
  terminalRequestSuggestionSchema,
  commandPauseSchema,
  commandResumeSchema,
  opsStopOneSchema,
  opsStopAllSchema,
])

type ClientMessage = z.infer<typeof clientMessageSchema>

// --- Connected clients ---

const connectedClients = new Set<ServerWebSocket<unknown>>()

/** Broadcast a message to all connected WebSocket clients */
function broadcast(_terminalId: string, message: object): void {
  const payload = JSON.stringify(message)
  // Copy to array to avoid modifying Set during iteration
  const clients = [...connectedClients]
  for (const client of clients) {
    try {
      client.send(payload)
    } catch {
      connectedClients.delete(client)
    }
  }
}

function sendTo(ws: ServerWebSocket<unknown>, message: object): void {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    // Ignore send errors
  }
}

function sendError(ws: ServerWebSocket<unknown>, message: string, terminalId?: string): void {
  sendTo(ws, {
    type: "terminal:error",
    data: { terminalId: terminalId ?? null, message },
  })
}

// --- Message Handlers ---

async function handleMessage(ws: ServerWebSocket<unknown>, raw: string): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    sendError(ws, "Invalid JSON")
    return
  }

  const result = clientMessageSchema.safeParse(parsed)
  if (!result.success) {
    sendError(ws, `Invalid message: ${result.error.issues.map((i) => i.message).join(", ")}`)
    return
  }

  const msg: ClientMessage = result.data

  switch (msg.type) {
    case "terminal:create":
      await handleTerminalCreate(ws, msg.data)
      break
    case "terminal:input":
      handleTerminalInput(ws, msg.data)
      break
    case "terminal:resize":
      handleTerminalResize(ws, msg.data)
      break
    case "terminal:close":
      handleTerminalClose(ws, msg.data)
      break
    case "command:approve":
      await handleCommandApprove(ws, msg.data)
      break
    case "command:reject":
      handleCommandReject(ws, msg.data)
      break
    case "command:set-mode":
      handleCommandSetMode(ws, msg.data)
      break
    case "question:answer":
      handleQuestionAnswer(ws, msg.data)
      break
    case "tool:approve":
      toolApprovalQueue.approve(msg.data.id, msg.data.allowAlways || false)
      break
    case "tool:reject":
      toolApprovalQueue.reject(msg.data.id)
      break
    case "tool:approve-all":
      toolApprovalQueue.approveAll(msg.data.allowAlways || false)
      break
    case "tool:reject-all":
      toolApprovalQueue.rejectAll()
      break
    case "tool:set-mode":
      toolApprovalQueue.setMode(msg.data.mode)
      console.log(`[Tool] Approval mode set to: ${msg.data.mode}`)
      break
    case "tool:pause":
      toolApprovalQueue.pause()
      break
    case "tool:resume":
      toolApprovalQueue.resume()
      break
    case "command:pause":
      commandQueue.pause()
      break
    case "command:resume":
      commandQueue.resume()
      break
    case "terminal:request-suggestion":
      handleTerminalSuggestion(ws, msg.data)
      break
    case "ops:stop-one": {
      const terminalId = opsTracker.cancelOne(msg.data.opId)
      if (terminalId) {
        terminalManager.sendInterrupt(terminalId)
        console.log(`[Ops] Stopped operation ${msg.data.opId} on terminal ${terminalId}`)
      }
      break
    }
    case "ops:stop-all": {
      const count = terminalManager.interruptAllAI()
      opsTracker.cancelAll()
      console.log(`[Ops] Stopped ${count} running AI operations`)
      broadcastToClients({
        type: "ops:stopped",
        data: { count },
      })
      break
    }
  }
}

async function handleTerminalCreate(
  ws: ServerWebSocket<unknown>,
  data: { container: string; name?: string; cols?: number; rows?: number },
): Promise<void> {
  try {
    const terminal = await terminalManager.create(data.container, data.name, broadcast, data.cols, data.rows)
    terminalManager.subscribe(terminal.id, ws as unknown as WebSocket)

    sendTo(ws, {
      type: "terminal:created",
      data: { terminalId: terminal.id, name: terminal.name, container: data.container },
    })

    console.log(`[WS] Terminal created: ${terminal.name} (${terminal.id}) on ${data.container}`)
  } catch (err) {
    sendError(ws, `Failed to create terminal: ${(err as Error).message}`)
  }
}

function handleTerminalInput(
  _ws: ServerWebSocket<unknown>,
  data: { terminalId: string; input: string },
): void {
  try {
    terminalManager.write(data.terminalId, data.input)
  } catch (err) {
    sendError(_ws, (err as Error).message, data.terminalId)
  }
}

function handleTerminalResize(
  _ws: ServerWebSocket<unknown>,
  data: { terminalId: string; cols: number; rows: number },
): void {
  try {
    terminalManager.resize(data.terminalId, data.cols, data.rows)
  } catch (err) {
    sendError(_ws, (err as Error).message, data.terminalId)
  }
}

function handleTerminalClose(
  ws: ServerWebSocket<unknown>,
  data: { terminalId: string },
): void {
  try {
    terminalManager.close(data.terminalId)
    sendTo(ws, {
      type: "terminal:closed",
      data: { terminalId: data.terminalId },
    })
  } catch (err) {
    sendError(ws, (err as Error).message, data.terminalId)
  }
}

// --- Ghost command suggestion handler ---

async function handleTerminalSuggestion(
  ws: ServerWebSocket<unknown>,
  data: { terminalId: string },
): Promise<void> {
  try {
    const output = terminalManager.getOutput(data.terminalId)
    const lastLines = output.split("\n").slice(-10).join("\n")
    if (!lastLines.trim()) return

    // Use a lightweight LLM call via the probe endpoint pattern
    const res = await fetch("http://localhost:3001/api/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are a terminal command suggester for a pentester. Given terminal output, suggest the SINGLE most likely next command. Reply with ONLY the command, no explanation, no backticks, no newlines.",
          },
          {
            role: "user",
            content: `Terminal output (last 10 lines):\n${lastLines}\n\nSuggest the next command:`,
          },
        ],
      }),
    })
    if (!res.ok) return
    const result = await res.json()
    const command = (result.text || result.content || "").trim().split("\n")[0]
    if (command && command.length > 1 && command.length < 200) {
      sendTo(ws, {
        type: "terminal:suggest",
        data: { terminalId: data.terminalId, command },
      })
    }
  } catch {
    // Suggestion failure is silent — not critical
  }
}

// --- Command approval handlers ---

async function handleCommandApprove(
  ws: ServerWebSocket<unknown>,
  data: { commandId: string; allowAll?: boolean; editedCommand?: string },
): Promise<void> {
  try {
    if (data.editedCommand) {
      await commandQueue.approveEdited(data.commandId, data.editedCommand)
    } else {
      await commandQueue.approve(data.commandId, data.allowAll || false)
    }
    sendTo(ws, {
      type: "command:executed",
      data: { commandId: data.commandId },
    })
  } catch (err) {
    sendError(ws, (err as Error).message)
  }
}

function handleCommandReject(
  _ws: ServerWebSocket<unknown>,
  data: { commandId: string },
): void {
  commandQueue.reject(data.commandId)
}

function handleCommandSetMode(
  _ws: ServerWebSocket<unknown>,
  data: { mode: "ask" | "auto-run" | "allow-all-session" },
): void {
  commandQueue.setMode(data.mode)
  // Sync tool approval queue: allow-all/auto-run → tools also auto-approve
  if (data.mode === "allow-all-session" || data.mode === "auto-run") {
    toolApprovalQueue.setMode("auto-run")
  } else {
    toolApprovalQueue.setMode("ask")
  }
  console.log(`[Command] Approval mode set to: ${data.mode} (tools synced)`)
}

// --- Question answer handler ---

function handleQuestionAnswer(
  _ws: ServerWebSocket<unknown>,
  data: { questionId: string; answer: string },
): void {
  questionQueue.answer(data.questionId, data.answer)
}

// --- Exported WebSocket handlers for Bun.serve() ---

// Wire broadcast to WS clients for both queues
const broadcastToClients = (message: object) => {
  const payload = JSON.stringify(message)
  const clients = [...connectedClients]
  for (const client of clients) {
    try {
      client.send(payload)
    } catch {
      connectedClients.delete(client)
    }
  }
}
commandQueue.setBroadcast(broadcastToClients)
questionQueue.setBroadcast(broadcastToClients)
toolApprovalQueue.setBroadcast(broadcastToClients)
terminalManager.setBroadcast((_terminalId, message) => broadcastToClients(message))
opsTracker.setBroadcast(broadcastToClients)

export const websocketHandlers = {
  open(ws: ServerWebSocket<unknown>) {
    connectedClients.add(ws)
    console.log(`[WS] Client connected (${connectedClients.size} total)`)
  },

  message(ws: ServerWebSocket<unknown>, message: string | Buffer) {
    const raw = typeof message === "string" ? message : message.toString()
    handleMessage(ws, raw).catch((err) => {
      console.error("[WS] Unhandled error:", err)
      sendError(ws, "Internal server error")
    })
  },

  close(ws: ServerWebSocket<unknown>) {
    connectedClients.delete(ws)
    terminalManager.unsubscribe(ws as unknown as WebSocket)
    console.log(`[WS] Client disconnected (${connectedClients.size} total)`)
  },
}
