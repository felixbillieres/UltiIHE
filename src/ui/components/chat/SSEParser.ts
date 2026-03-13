/**
 * Server-Sent Events parser for streaming AI responses.
 */

export interface SSEEvent {
  event: string
  data: any
}

export class SSEParser {
  private buffer = ""

  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk
    const events: SSEEvent[] = []
    const parts = this.buffer.split("\n\n")
    this.buffer = parts.pop() || ""

    for (const part of parts) {
      if (!part.trim()) continue
      let event = ""
      let data = ""
      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7)
        else if (line.startsWith("data: ")) data = line.slice(6)
      }
      if (event && data) {
        try {
          events.push({ event, data: JSON.parse(data) })
        } catch {}
      }
    }
    return events
  }
}
