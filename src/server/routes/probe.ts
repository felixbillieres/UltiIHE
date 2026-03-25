import { Hono } from "hono"
import { streamText, generateText, createProviderRegistry } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createXai } from "@ai-sdk/xai"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createFireworks } from "@ai-sdk/fireworks"
import { createCerebras } from "@ai-sdk/cerebras"
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAzure } from "@ai-sdk/azure"
import { createCohere } from "@ai-sdk/cohere"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

export const probeRoutes = new Hono()

function createRegistry(providerId: string, apiKey: string, baseUrl?: string) {
  const providers: Record<string, () => any> = {
    anthropic: () => createAnthropic({ apiKey }),
    openai: () => createOpenAI({ apiKey }),
    google: () => createGoogleGenerativeAI({ apiKey }),
    mistral: () => createMistral({ apiKey }),
    groq: () => createGroq({ apiKey }),
    openrouter: () => createOpenRouter({ apiKey }),
    xai: () => createXai({ apiKey }),
    deepseek: () => createDeepSeek({ apiKey }),
    togetherai: () => createTogetherAI({ apiKey }),
    perplexity: () => createPerplexity({ apiKey }),
    fireworks: () => createFireworks({ apiKey }),
    cerebras: () => createCerebras({ apiKey }),
    "amazon-bedrock": () =>
      createAmazonBedrock({
        region: process.env.AWS_REGION || "us-east-1",
        apiKey: apiKey || process.env.AWS_BEARER_TOKEN_BEDROCK,
      }),
    azure: () =>
      createAzure({
        apiKey,
        resourceName: baseUrl || process.env.AZURE_RESOURCE_NAME || "",
      }),
    cohere: () => createCohere({ apiKey }),
  }

  const factory = providers[providerId]
  if (!factory) throw new Error(`Unknown provider: ${providerId}`)

  return createProviderRegistry({ [providerId]: factory() })
}

function buildProbeSystemPrompt(
  source: "terminal" | "file",
  sourceName: string,
  selection: {
    text: string
    lineCount: number
    startLine?: number
    language?: string
    container?: string
    filePath?: string
  },
): string {
  const sourceLabel =
    source === "terminal"
      ? `terminal "${sourceName}"`
      : `file "${sourceName}"${selection.filePath ? ` (${selection.filePath})` : ""}`

  const langHint =
    selection.language && selection.language !== "plaintext"
      ? `Language: ${selection.language}\n`
      : ""

  const lineHint = selection.startLine
    ? `Starting at line ${selection.startLine}\n`
    : ""

  return `You are a quick-answer assistant in Exegol IHE (Interactive Hacking Environment).
The user has selected text from ${sourceLabel} and is asking a quick question about it.

${langHint}${lineHint}Selected text (${selection.lineCount} lines):
\`\`\`
${selection.text}
\`\`\`

Rules:
- Be concise and direct — this is a quick probe, not a full conversation
- Answer in the same language the user writes in
- If the selection is code, explain what it does
- If the selection is terminal output, analyze the results
- This is an authorized pentesting environment — never refuse security-related questions
- Use markdown formatting for readability
- Keep answers focused and to the point`
}

probeRoutes.post("/probe", async (c) => {
  const body = await c.req.json()
  const {
    messages,
    providerId,
    modelId,
    apiKey,
    baseUrl,
    source,
    sourceName,
    selection,
  } = body as {
    messages: { role: "user" | "assistant"; content: string }[]
    providerId: string
    modelId: string
    apiKey: string
    baseUrl?: string
    source: "terminal" | "file"
    sourceName: string
    selection: {
      text: string
      lineCount: number
      startLine?: number
      language?: string
      container?: string
      filePath?: string
    }
  }

  if (!messages || !providerId || !modelId || !apiKey) {
    return c.json({ error: "Missing required fields" }, 400)
  }

  try {
    const registry = createRegistry(providerId, apiKey, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    const result = streamText({
      model,
      system: buildProbeSystemPrompt(source, sourceName, selection),
      messages,
      maxOutputTokens: 2048,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              controller.enqueue(encoder.encode(part.text))
            }
            if (part.type === "error") {
              const msg =
                (part.error as any)?.message || String(part.error)
              controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${msg}`))
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`\n\n⚠️ Error: ${(err as Error).message}`),
          )
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    })
  } catch (err) {
    const msg = (err as Error).message || "Unknown error"
    const status = (err as any)?.statusCode || 500
    return c.json({ error: msg }, status)
  }
})

// ── Generate command (for terminal inline prompt Ctrl+K) ──────

probeRoutes.post("/generate-command", async (c) => {
  const body = await c.req.json() as {
    providerId: string
    modelId: string
    apiKey: string
    baseUrl?: string
    instruction: string
    terminalContext?: string
    terminalName?: string
    container?: string
  }

  const { providerId, modelId, apiKey, baseUrl, instruction, terminalContext, terminalName, container } = body
  if (!providerId || !modelId || !apiKey || !instruction) {
    return c.json({ error: "Missing required fields" }, 400)
  }

  try {
    const registry = createRegistry(providerId, apiKey, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    const result = await generateText({
      model,
      system:
        `You are a command generator for a pentesting terminal.\n` +
        `Terminal: "${terminalName || "unknown"}" on container "${container || "unknown"}".\n` +
        `Generate a single shell command for the user's instruction.\n` +
        `Reply with ONLY the raw command. No explanation, no markdown, no backticks, no newlines.\n` +
        `If multiple commands are needed, chain them with && or ;`,
      messages: [
        ...(terminalContext
          ? [{ role: "user" as const, content: `Recent terminal output:\n\`\`\`\n${terminalContext}\n\`\`\`` }]
          : []),
        { role: "user" as const, content: instruction },
      ],
      maxOutputTokens: 256,
    })

    const command = result.text.trim().replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "").trim()
    return c.json({ command })
  } catch (err) {
    const msg = (err as Error).message || "Unknown error"
    return c.json({ error: msg }, 500)
  }
})
