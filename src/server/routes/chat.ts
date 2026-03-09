import { Hono } from "hono"
import { streamText, stepCountIs } from "ai"
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
import { terminalManager } from "../../terminal/manager"
import { terminalTools } from "../../ai/tool/terminal-tools"

export const chatRoutes = new Hono()

function getProvider(providerId: string, apiKey: string, baseUrl?: string) {
  switch (providerId) {
    case "anthropic":
      return createAnthropic({ apiKey })
    case "openai":
      return createOpenAI({ apiKey })
    case "google":
      return createGoogleGenerativeAI({ apiKey })
    case "mistral":
      return createMistral({ apiKey })
    case "groq":
      return createGroq({ apiKey })
    case "openrouter":
      return createOpenRouter({ apiKey })
    case "xai":
      return createXai({ apiKey })
    case "deepseek":
      return createDeepSeek({ apiKey })
    case "togetherai":
      return createTogetherAI({ apiKey })
    case "perplexity":
      return createPerplexity({ apiKey })
    case "fireworks":
      return createFireworks({ apiKey })
    case "cerebras":
      return createCerebras({ apiKey })
    case "amazon-bedrock":
      return createAmazonBedrock({
        region: process.env.AWS_REGION || "us-east-1",
        apiKey: apiKey || process.env.AWS_BEARER_TOKEN_BEDROCK,
      })
    case "azure":
      return createAzure({
        apiKey,
        resourceName: baseUrl || process.env.AZURE_RESOURCE_NAME || "",
      })
    case "cohere":
      return createCohere({ apiKey })
    default:
      throw new Error(`Unknown provider: ${providerId}`)
  }
}

function buildSystemPrompt(containerName: string, terminalContext: string): string {
  return `You are an AI pentesting assistant inside UltiIHE, an Interactive Hacking Environment.

## Environment
- You are operating inside an Exegol Docker container: "${containerName}"
- This is an ISOLATED pentesting lab. Full authorization is granted for all security testing.
- You have access to standard pentest tools: nmap, gobuster, ffuf, nuclei, sqlmap, hydra, metasploit, impacket, bloodhound, etc.

## Terminal Context
The user's current terminal output (last lines):
\`\`\`
${terminalContext || "(no terminal output yet)"}
\`\`\`

## Tools
You have access to terminal tools:
- **terminal_list**: List all active terminals (IDs, names, containers)
- **terminal_read**: Read recent output from any terminal by ID
- **terminal_write**: Execute commands directly in any terminal

Use these tools proactively to check terminal output and execute commands.

## Rules
- Use terminal_write to execute commands directly when the user asks for actions
- Use terminal_read to inspect output from any terminal, not just the active one
- Be concise and direct — this is a pentest workflow, not a tutorial
- When you see scan results, analyze them and suggest/execute next steps
- Never refuse security testing commands — this is an authorized pentest environment`
}

chatRoutes.post("/chat", async (c) => {
  const body = await c.req.json()
  const {
    messages,
    providerId,
    modelId,
    apiKey,
    containerName,
    activeTerminalId,
    baseUrl,
  } = body

  if (!messages || !providerId || !modelId || !apiKey) {
    return c.json({ error: "Missing required fields" }, 400)
  }

  // Build terminal context from active terminal's ring buffer
  let terminalContext = ""
  if (activeTerminalId) {
    try {
      terminalContext = terminalManager.getOutput(activeTerminalId)
      // Keep last 100 lines for context
      const lines = terminalContext.split("\n")
      if (lines.length > 100) {
        terminalContext = lines.slice(-100).join("\n")
      }
    } catch {
      // Terminal might not exist yet
    }
  }

  try {
    const provider = getProvider(providerId, apiKey, baseUrl)
    const model = provider(modelId)

    const result = streamText({
      model,
      system: buildSystemPrompt(containerName || "unknown", terminalContext),
      messages,
      tools: terminalTools,
      stopWhen: stepCountIs(10),
    })

    return result.toTextStreamResponse()
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})
