import { Hono } from "hono"
import { streamText, stepCountIs, createProviderRegistry } from "ai"
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

type ReasoningMode = "build" | "plan" | "deep"

/**
 * Create a provider registry scoped to the current request.
 * Each provider is lazy-initialized with the API key from the request body.
 */
function createRegistry(providerId: string, apiKey: string, baseUrl?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  if (!factory) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  // Build registry entries: only register the requested provider
  // This avoids needing API keys for unused providers
  return createProviderRegistry({
    [providerId]: factory(),
  })
}

/**
 * Return provider-specific options for reasoning/thinking modes.
 *
 * - build: standard tool-calling agent, no extra reasoning
 * - plan: analysis mode with moderate reasoning budget
 * - deep: thorough research with maximum reasoning budget
 */
function getReasoningOptions(
  providerId: string,
  mode: ReasoningMode
): Record<string, any> {
  if (mode === "build") return {}

  switch (providerId) {
    case "anthropic":
      return mode === "deep"
        ? {
            anthropic: {
              thinking: { type: "enabled", budgetTokens: 32000 },
            },
          }
        : {
            anthropic: {
              thinking: { type: "enabled", budgetTokens: 16000 },
            },
          }
    case "openai":
      return {
        openai: {
          reasoningEffort: mode === "deep" ? "high" : "medium",
        },
      }
    case "google":
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: mode === "deep" ? 24000 : 16000,
          },
        },
      }
    case "deepseek":
      // DeepSeek reasoner handles thinking internally
      return {}
    default:
      return {}
  }
}

function buildSystemPrompt(
  containerName: string,
  terminalContext: string,
  mode: ReasoningMode = "build"
): string {
  const modeInstructions: Record<ReasoningMode, string> = {
    build: `## Mode: Build (default)
You are a standard tool-calling agent. Execute commands proactively when asked.
Use tools to accomplish tasks directly. Be concise and action-oriented.`,

    plan: `## Mode: Plan (analysis)
You are in analysis/planning mode. DO NOT execute commands without explicitly asking the user first.
- Explain your reasoning step by step
- Propose a plan of action before executing anything
- Ask for confirmation before running any command
- Focus on strategy and methodology over immediate execution`,

    deep: `## Mode: Deep (thorough research)
You are in deep analysis mode. Use extended thinking to thoroughly research the problem.
- Perform comprehensive analysis before acting
- Consider multiple attack vectors and approaches
- Document your reasoning chain in detail
- Cross-reference findings across terminals
- Only execute after thorough analysis`,
  }

  return `You are an AI pentesting assistant inside UltiIHE, an Interactive Hacking Environment.

## Environment
- You are operating inside an Exegol Docker container: "${containerName}"
- This is an ISOLATED pentesting lab. Full authorization is granted for all security testing.
- You have access to standard pentest tools: nmap, gobuster, ffuf, nuclei, sqlmap, hydra, metasploit, impacket, bloodhound, etc.

${modeInstructions[mode]}

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
    mode = "build",
  } = body as {
    messages: any[]
    providerId: string
    modelId: string
    apiKey: string
    containerName?: string
    activeTerminalId?: string
    baseUrl?: string
    mode?: ReasoningMode
  }

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
    const registry = createRegistry(providerId, apiKey, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    const result = streamText({
      model,
      system: buildSystemPrompt(containerName || "unknown", terminalContext, mode),
      messages,
      tools: mode === "plan" ? {} : terminalTools,
      stopWhen: stepCountIs(10),
      providerOptions: getReasoningOptions(providerId, mode),
    })

    return result.toTextStreamResponse()
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})
