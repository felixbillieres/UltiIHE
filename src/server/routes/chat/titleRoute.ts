import { Hono } from "hono"
import { generateText } from "ai"
import { createRegistry } from "./registry"
import { extractErrorMessage } from "./errors"

export const titleRoute = new Hono()

// Generates a short, descriptive title for a chat session.
// Called by the frontend after the first assistant response.

titleRoute.post("/title", async (c) => {
  const body = await c.req.json()
  const { messages, providerId, modelId, apiKey, baseUrl } = body as {
    messages: Array<{ role: string; content: string }>
    providerId: string
    modelId: string
    apiKey: string
    baseUrl?: string
  }

  if (!messages || messages.length < 2) {
    return c.json({ error: "Need at least 2 messages" }, 400)
  }

  try {
    const registry = await createRegistry(providerId, apiKey, modelId, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    const result = await generateText({
      model,
      system: `Generate a short title (max 50 characters) for this conversation.
Rules:
- Single line, no quotes, no punctuation at the end
- Same language as the user's message
- Describe the topic/intent, not the tools used
- No meta descriptions like "Chat about..." or "Discussion of..."
- Be specific and concise`,
      messages: [
        {
          role: "user" as const,
          content: messages.map((m) => `[${m.role}]: ${m.content.slice(0, 300)}`).join("\n"),
        },
      ],
      maxRetries: 0,
    })

    let title = result.text
      .replace(/<think>[\s\S]*?<\/think>\s*/g, "") // Strip reasoning tags
      .replace(/<[^>]+>/g, "") // Strip any remaining XML/HTML tags
      .split("\n")[0] // First line only
      .replace(/^["']|["']$/g, "") // Strip wrapping quotes
      .trim()

    if (title.length > 60) title = title.slice(0, 57) + "..."
    if (!title) title = "New chat"

    return c.json({ title })
  } catch (err) {
    const msg = extractErrorMessage(err)
    return c.json({ error: msg }, 500)
  }
})
