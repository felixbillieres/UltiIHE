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
type ThinkingEffort = "off" | "low" | "medium" | "high"
type AgentId = "build" | "recon" | "exploit" | "report"

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
 * Return provider-specific options for reasoning/thinking.
 *
 * thinkingEffort controls the thinking budget:
 * - off: no reasoning
 * - low: minimal reasoning budget
 * - medium: moderate reasoning budget
 * - high: maximum reasoning budget
 *
 * Falls back to mode-based reasoning if thinkingEffort is "off":
 * - plan mode: medium reasoning
 * - deep mode: high reasoning
 */
function getReasoningOptions(
  providerId: string,
  mode: ReasoningMode,
  thinkingEffort: ThinkingEffort = "off",
): Record<string, any> {
  // Determine effective effort from explicit setting or mode fallback
  let effort = thinkingEffort
  if (effort === "off") {
    if (mode === "plan") effort = "medium"
    else if (mode === "deep") effort = "high"
    else return {}
  }

  const budgetMap = { low: 8000, medium: 16000, high: 32000 } as const

  switch (providerId) {
    case "anthropic":
      return {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: budgetMap[effort] },
        },
      }
    case "openai":
      return {
        openai: {
          reasoningEffort: effort === "high" ? "high" : effort === "low" ? "low" : "medium",
        },
      }
    case "google":
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: budgetMap[effort],
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

const AGENT_PROMPTS: Record<AgentId, string> = {
  build: `## Agent: Build (primary)
You are the primary agent. Execute commands proactively when asked.
Use tools to accomplish tasks directly. Be concise and action-oriented.
You can delegate to specialized sub-agents (recon, exploit, report) when appropriate.`,

  recon: `## Agent: Recon (reconnaissance)
You specialize in reconnaissance and enumeration.
Focus on: network discovery, service enumeration, vulnerability scanning.
Typical tools: nmap, gobuster, ffuf, dig, whois, subfinder, nuclei.
- Map the attack surface methodically
- Document all findings as you go
- Suggest next steps based on discoveries`,

  exploit: `## Agent: Exploit (exploitation)
You specialize in exploitation and post-exploitation.
Focus on: validating vulnerabilities, exploitation, privilege escalation, lateral movement.
Typical tools: sqlmap, hydra, metasploit, impacket, bloodhound, crackmapexec.
- Validate findings from recon before exploiting
- Capture evidence (screenshots, hashes, flags)
- Document the exploitation chain`,

  report: `## Agent: Report (read-only)
You specialize in reporting and documentation.
You can ONLY read terminal output — you CANNOT execute commands.
Focus on: collecting findings, generating reports with CVSS scores, impact analysis, remediation.
- Summarize findings with severity ratings
- Provide remediation recommendations
- Format output for professional reports`,
}

function buildSystemPrompt(
  containerIds: string[],
  terminalContext: string,
  mode: ReasoningMode = "build",
  agent: AgentId = "build",
): string {
  const modeInstructions: Record<ReasoningMode, string> = {
    build: "",
    plan: `\n## Mode: Plan
DO NOT execute commands without asking first. Explain reasoning step by step.
Propose a plan of action before executing anything. Focus on strategy.`,
    deep: `\n## Mode: Deep Analysis
Use extended thinking to thoroughly research the problem.
Consider multiple approaches. Document reasoning in detail. Only execute after thorough analysis.`,
  }

  const containerSection = containerIds.length === 0
    ? `- No containers linked to this project yet.`
    : containerIds.length === 1
      ? `- You are operating inside an Exegol Docker container: "${containerIds[0]}"`
      : `- This project has multiple Exegol containers available:\n${containerIds.map((c) => `  - "${c}"`).join("\n")}\n- You can execute commands in any of these containers.`

  return `You are an AI pentesting assistant inside UltiIHE, an Interactive Hacking Environment.

## Environment
${containerSection}
- This is an ISOLATED pentesting lab. Full authorization is granted for all security testing.
- You have access to standard pentest tools: nmap, gobuster, ffuf, nuclei, sqlmap, hydra, metasploit, impacket, bloodhound, etc.

${AGENT_PROMPTS[agent]}${modeInstructions[mode]}

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
    containerIds,
    activeTerminalId,
    baseUrl,
    mode = "build",
    agent = "build",
    thinkingEffort = "off",
  } = body as {
    messages: any[]
    providerId: string
    modelId: string
    apiKey: string
    containerIds?: string[]
    activeTerminalId?: string
    baseUrl?: string
    mode?: ReasoningMode
    agent?: AgentId
    thinkingEffort?: ThinkingEffort
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

    // Report agent cannot execute commands
    const allowTools = agent !== "report" && mode !== "plan"

    const result = streamText({
      model,
      system: buildSystemPrompt(containerIds || [], terminalContext, mode, agent),
      messages,
      tools: allowTools ? terminalTools : {},
      stopWhen: stepCountIs(10),
      providerOptions: getReasoningOptions(providerId, mode, thinkingEffort),
    })

    return result.toTextStreamResponse()
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})
