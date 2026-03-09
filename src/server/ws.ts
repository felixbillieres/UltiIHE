import { z } from "zod"
import { terminalManager } from "../terminal/manager"
import type { ServerWebSocket } from "bun"

// --- Message Schemas ---

const terminalCreateSchema = z.object({
  type: z.literal("terminal:create"),
  data: z.object({
    container: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid container name"),
    name: z.string().optional(),
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

const clientMessageSchema = z.discriminatedUnion("type", [
  terminalCreateSchema,
  terminalInputSchema,
  terminalResizeSchema,
  terminalCloseSchema,
])

type ClientMessage = z.infer<typeof clientMessageSchema>

// --- Connected clients ---

const connectedClients = new Set<ServerWebSocket<unknown>>()

/** Broadcast a message to all connected WebSocket clients */
function broadcast(_terminalId: string, message: object): void {
  if (connectedClients.size > 1) {
    console.warn(`[WS] Broadcasting to ${connectedClients.size} clients — expected 1 (possible duplicate connections)`)
  }
  const payload = JSON.stringify(message)
  for (const client of connectedClients) {
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
  }
}

async function handleTerminalCreate(
  ws: ServerWebSocket<unknown>,
  data: { container: string; name?: string },
): Promise<void> {
  try {
    const terminal = await terminalManager.create(data.container, data.name, broadcast)
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

// --- Exported WebSocket handlers for Bun.serve() ---

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
