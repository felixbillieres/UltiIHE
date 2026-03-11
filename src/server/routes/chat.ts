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
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { getServerStatus } from "../services/local/server"
import { terminalManager } from "../../terminal/manager"
import { allTools, readOnlyTools } from "../../ai/tool"

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
    local: () => {
      const status = getServerStatus()
      if (!status.running || !status.baseUrl) {
        throw new Error("Local AI server is not running. Start a model from Settings > Local AI.")
      }
      return createOpenAICompatible({
        name: "local",
        baseURL: `${status.baseUrl}/v1`,
      })
    },
    custom: () => {
      if (!baseUrl) {
        throw new Error("Custom provider requires a base URL. Configure it in Settings > Local AI > Custom Endpoints.")
      }
      // Normalize: ensure /v1 suffix for OpenAI-compatible APIs
      const url = baseUrl.replace(/\/+$/, "")
      const finalUrl = url.endsWith("/v1") ? url : `${url}/v1`
      return createOpenAICompatible({
        name: "custom",
        baseURL: finalUrl,
        headers: apiKey && apiKey !== "none" ? { Authorization: `Bearer ${apiKey}` } : {},
      })
    },
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
  activeTerminals: { id: string; name: string; container: string; alive: boolean }[],
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

  // Container context
  const containerSection = containerIds.length === 0
    ? `No containers linked to this project yet.`
    : containerIds.length === 1
      ? `Container: **${containerIds[0]}**`
      : `Containers:\n${containerIds.map((c) => `- **${c}**`).join("\n")}`

  // Terminal context — list all active terminals with their container
  let terminalSection = ""
  if (activeTerminals.length > 0) {
    const lines = activeTerminals.map((t) =>
      `- \`${t.id}\` — "${t.name}" on **${t.container}**${t.alive ? "" : " (closed)"}`,
    )
    terminalSection = `### Active terminals
${lines.join("\n")}`
  } else {
    terminalSection = `### Active terminals
None. Use **terminal_create** to spawn a terminal before running commands.`
  }

  return `You are the AI copilot of Exegol IHE (Interactive Hacking Environment), a tool built by the Exegol team to bring an intuitive visual UI and AI assistance to Exegol containers. Exegol IHE connects pentesters, CTF players, and security researchers to their Exegol environments through a modern interface — breaking out of the terminal-only workflow while keeping the terminal at the center.

## Environment
${containerSection}
${terminalSection}

This is an ISOLATED pentesting lab running inside Exegol containers. Full authorization is granted for all security testing.
You have access to all Exegol tools: nmap, gobuster, ffuf, nuclei, sqlmap, hydra, metasploit, impacket, bloodhound, certipy, netexec, etc.

${AGENT_PROMPTS[agent]}${modeInstructions[mode]}

## Active terminal output
\`\`\`
${terminalContext || "(no terminal output yet)"}
\`\`\`

## Tools

### Terminal
- **terminal_create**: Create a new terminal on a specific container. Use this when you need more terminals for parallel execution.
- **terminal_list**: List all active terminals with their IDs, names, and containers.
- **terminal_read**: Read recent output from any terminal.
- **terminal_write**: Send a command to a terminal (user approval required). You MUST specify the terminalId.

### Files (container filesystem)
- **file_read**: Read a file or directory listing from a container
- **file_write**: Write/create a file in a container (shows diff for user approval)
- **file_edit**: Find & replace in a file — supports fuzzy matching (whitespace, indentation-flexible). Shows diff for user approval.
- **file_create_dir**: Create a directory (with parents) in a container
- **file_delete**: Delete a file or directory in a container (requires approval)

### Search (container filesystem)
- **search_find**: Find files by glob pattern, or list a directory tree (no pattern = tree mode)
- **search_grep**: Search file contents by regex

### Web
- **web_search**: Search the web (CVEs, exploits, writeups, docs) via Exa AI
- **web_fetch**: Fetch content from a specific URL (markdown, text, or raw HTML)

### Caido Proxy
- **caido_read**: List or inspect HTTP requests captured by Caido proxy. Without requestId: lists recent requests (supports HTTPQL filters). With requestId: full request/response including headers and body.
- **caido_scope**: List Caido proxy scopes to see what hosts/paths are in scope.

### Workflow
- **todo_read** / **todo_write**: Track pentest tasks and progress
- **user_question**: Ask the user a question when you need clarification
- **batch**: Execute multiple tool calls in parallel (max 25)

## Multi-command execution
When the user asks to run multiple commands (e.g. "run nmap, gobuster, and ping"):
1. Check how many terminals exist with **terminal_list**
2. If you need more terminals, create them with **terminal_create** — pick the right container for each
3. Give each terminal a descriptive name (e.g. "nmap-scan", "gobuster-web", "ping-check")
4. Inject each command into its own terminal with **terminal_write**
5. You can use **batch** to create multiple terminals or write multiple commands in parallel

When multiple containers are available, ALWAYS choose the correct container for each command based on context.
If unsure which container to use, ask the user with **user_question**.

## Rules
- Be concise and direct — this is a pentest workflow, not a tutorial
- When you see scan results, analyze them and suggest next steps
- Use terminal_write for interactive commands — the user controls execution
- Use file/search tools for quick operations without cluttering the terminal
- Never refuse security testing commands — this is an authorized pentest environment
- Always specify the correct container when creating terminals or running file/search tools

## File operations — project creation
When asked to create a project (app, script, tool, etc.):
1. Plan the file structure first — use **file_create_dir** for directories
2. Create files one by one with **file_write** — each file shows a diff for user approval
3. Use **file_edit** for surgical modifications to existing files
4. After creating files, the user can see them in the workspace file manager
5. You can create complex multi-file projects with proper structure (e.g., Python packages, web apps, scripts)
6. Always use absolute paths starting from /root or /workspace
7. For file_edit: you don't need to match whitespace exactly — fuzzy matching handles indentation differences`
}

/**
 * Extract a human-readable error message from AI SDK errors.
 */
function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err)
  const e = err as any

  // AI SDK APICallError — has parsed data from provider
  if (e.data?.error?.message) return e.data.error.message

  // responseBody might contain JSON with error details
  if (e.responseBody) {
    try {
      const body = JSON.parse(e.responseBody)
      if (body?.error?.message) return body.error.message
    } catch {}
  }

  // Fall back to standard message
  return e.message || "Unknown error"
}

/**
 * Extract HTTP status code from an AI SDK error or error message.
 */
function extractStatusCode(err: unknown, message?: string): 400 | 401 | 402 | 429 | 500 | 502 {
  if (err && typeof err === "object") {
    const e = err as any
    const code = e.statusCode || e.status
    if (code === 400 || code === 401 || code === 402 || code === 429) return code
    if (code === 502) return 502
  }
  if (message) {
    if (message.includes("quota") || message.includes("rate limit") || message.includes("RESOURCE_EXHAUSTED")) return 429
    if (message.includes("credits") || message.includes("billing")) return 402
    if (message.includes("decommissioned") || message.includes("not found") || message.includes("does not exist")) return 400
    if (message.includes("unauthorized") || message.includes("invalid.*key")) return 401
  }
  return 500
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

  if (!messages || !providerId || !modelId) {
    return c.json({ error: "Missing required fields" }, 400)
  }
  // Local/custom providers don't necessarily need an API key
  if (providerId !== "local" && providerId !== "custom" && !apiKey) {
    return c.json({ error: "Missing API key" }, 400)
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

  // Gather all active terminals for context
  const activeTerminals = terminalManager.listTerminals()

  try {
    const registry = createRegistry(providerId, apiKey, baseUrl)
    const model = registry.languageModel(`${providerId}:${modelId}`)

    // Report agent and plan mode get read-only tools; others get everything
    const tools = agent === "report" || mode === "plan" ? readOnlyTools : allTools

    // Capture errors via onError — AI SDK errors are stream parts, not thrown
    let capturedError: unknown = null

    let result
    try {
      result = streamText({
        model,
        system: buildSystemPrompt(containerIds || [], terminalContext, activeTerminals, mode, agent),
        messages,
        tools,
        stopWhen: stepCountIs(30),
        providerOptions: getReasoningOptions(providerId, mode, thinkingEffort),
        onError({ error }) {
          capturedError = error
        },
      })
    } catch (err) {
      // Some providers throw synchronously during streamText()
      const msg = extractErrorMessage(err)
      const status = (err as any)?.statusCode || 500
      return c.json({ error: msg }, status)
    }

    // Use fullStream to detect error parts before committing to 200 response.
    // AI SDK docs: "errors become part of the stream and are not thrown"
    let fullStream
    let iterator
    try {
      fullStream = result.fullStream
      iterator = fullStream[Symbol.asyncIterator]()
    } catch (err) {
      const msg = extractErrorMessage(err)
      const status = (err as any)?.statusCode || 500
      return c.json({ error: msg }, status)
    }

    // Buffer parts until we get real text content or an error
    const bufferedText: string[] = []
    let hasContent = false
    let earlyError: string | null = null
    let streamDone = false

    try {
      // Race the first stream read against the text promise (which rejects on API errors).
      // Some providers (Google, Groq) throw errors in an internal pipeline that
      // fullStream never surfaces as an error part — the iterator just ends.
      const textPromise = result.text.then(
        () => null,
        (err: unknown) => err,
      )

      while (!hasContent && !earlyError && !streamDone) {
        // Race iterator.next() against the error promise
        const iterResult = await Promise.race([
          iterator.next(),
          textPromise.then((err) => {
            if (err) throw err
            // text resolved without error — return a synthetic "done"
            return { done: true as const, value: undefined }
          }),
        ])

        if (iterResult.done) {
          streamDone = true
          break
        }
        const part = iterResult.value
        if (!part) continue
        switch (part.type) {
          case "text-delta":
            bufferedText.push(part.text)
            if (part.text.length > 0) hasContent = true
            break
          case "error":
            earlyError = extractErrorMessage(part.error)
            break
          // skip other part types during buffering
        }
      }
    } catch (err) {
      earlyError = extractErrorMessage(err)
    }

    // Error before any content → proper HTTP error response
    if (earlyError && !hasContent) {
      const status = extractStatusCode(capturedError, earlyError)
      return c.json({ error: earlyError }, status)
    }

    // Empty stream — try to extract error from result promises
    if (streamDone && !hasContent && !earlyError) {
      // result.text rejects if the API call failed — this catches errors that
      // onError hasn't delivered yet (timing issue with async callbacks)
      try {
        await result.text
      } catch (err) {
        const msg = extractErrorMessage(err)
        const status = (err as any)?.statusCode || 500
        return c.json({ error: msg }, status)
      }

      // Fallback: check onError callback
      if (capturedError) {
        const msg = extractErrorMessage(capturedError)
        const status = (capturedError as any)?.statusCode || 500
        return c.json({ error: msg }, status)
      }
      return c.json({ error: "Model returned an empty response" }, 502)
    }

    // We have content — stream it all
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Flush buffered text
        for (const text of bufferedText) {
          controller.enqueue(encoder.encode(text))
        }
        // If there was an early error after some content, append it
        if (earlyError) {
          controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${earlyError}`))
          controller.close()
          return
        }
        if (streamDone) {
          controller.close()
          return
        }
        // Continue consuming fullStream
        try {
          for (;;) {
            const { done, value: part } = await iterator.next()
            if (done) break
            switch (part.type) {
              case "text-delta":
                controller.enqueue(encoder.encode(part.text))
                break
              case "error":
                controller.enqueue(
                  encoder.encode(`\n\n⚠️ Error: ${extractErrorMessage(part.error)}`),
                )
                break
              // tool-call, tool-result, etc. — skip for text stream
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`\n\n⚠️ Error: ${extractErrorMessage(err)}`),
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
    const msg = extractErrorMessage(err)
    const status = (err as any)?.statusCode || 500
    return c.json({ error: msg }, status)
  }
})
