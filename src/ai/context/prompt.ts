/**
 * Adaptive system prompt builder.
 *
 * Generates system prompts in 3 tiers based on model context budget:
 * - full:    Complete prompt with all tool docs, rules, examples
 * - medium:  Agent-specific prompt with condensed tool descriptions
 * - minimal: Bare essentials — role + environment + active terminal
 *
 * The goal is to maximize useful context for small models while keeping
 * large models fully informed.
 */

import type { PromptTier } from "./budget"
import type { ReasoningMode, AgentMode } from "../../server/routes/chat/systemPrompt"

interface PromptContext {
  containerIds: string[]
  terminalContext: string
  activeTerminals: { id: string; name: string; container: string; alive: boolean }[]
  mode: ReasoningMode
  agentMode: AgentMode
  tier: PromptTier
  /** Auto-extracted mission state (targets, creds, ports, flags) */
  missionState?: string
}

// ── Agent prompt (single primary agent) ───────────────────────

const AGENT_CORE = "You are the primary AI copilot. Execute commands proactively. Be concise and action-oriented. NEVER use emojis, unicode symbols, or decorative characters. terminal_write waits for completion — NEVER retry or re-run commands. ONE command per task."

const AGENT_EXTENDED = `You are the primary agent. Execute commands proactively when asked.
Use tools to accomplish tasks directly. Be concise and action-oriented.
NEVER use emojis in your responses, commands, or generated content. No unicode symbols like stars, arrows, or decorative characters. Be professional, direct, and plain-text only.`

// ── Mode instructions ──────────────────────────────────────────

const MODE_INSTRUCTIONS: Record<ReasoningMode, string> = {
  build: "",
  plan: "\nDO NOT execute commands without asking first. Propose a plan before acting.",
  deep: "\nUse extended thinking. Consider multiple approaches. Only execute after thorough analysis.",
}

const AGENT_MODE_INSTRUCTIONS: Record<AgentMode, string> = {
  ctf: `\nCTF mode: Be aggressive, creative, flag-oriented. Try tricks, brute-force when reasonable, no formal methodology needed. Speed matters.
- Use web_search to look up recent CVEs, download POC exploits, find writeups for similar challenges
- When you find a CVE, search for and download the exploit POC from GitHub/exploit-db
- Close terminals you no longer need with terminal_close to keep the workspace clean`,
  audit: `\nAudit mode: Professional pentest. Follow methodology, stay in scope, ask before destructive/noisy actions, document findings with CVSS/severity, warn about detection risks.
- Close terminals you no longer need with terminal_close to keep the workspace clean`,
  neutral: "",
}

// ── Environment section (shared) ───────────────────────────────

function buildEnvironmentSection(ctx: PromptContext): string {
  const containerSection = ctx.containerIds.length === 0
    ? "No containers linked."
    : ctx.containerIds.length === 1
      ? `Container: **${ctx.containerIds[0]}**`
      : `Containers:\n${ctx.containerIds.map((c) => `- **${c}**`).join("\n")}`

  let terminalSection: string
  if (ctx.activeTerminals.length > 0) {
    const lines = ctx.activeTerminals.map((t) =>
      `- \`${t.id}\` — "${t.name}" on **${t.container}**${t.alive ? "" : " (closed)"}`,
    )
    terminalSection = `### Terminals\n${lines.join("\n")}`
  } else {
    terminalSection = "### Terminals\nNone. Use **terminal_create** to spawn one."
  }

  return `${containerSection}\n${terminalSection}`
}

// ── Terminal output section ────────────────────────────────────

function buildTerminalOutput(ctx: PromptContext, maxLines: number): string {
  if (!ctx.terminalContext) return ""

  const lines = ctx.terminalContext.split("\n")
  const truncated = lines.length > maxLines
    ? lines.slice(-maxLines).join("\n")
    : ctx.terminalContext

  return `\n## Terminal output\n\`\`\`\n${truncated}\n\`\`\``
}

// ── Tier builders ──────────────────────────────────────────────

/**
 * MINIMAL tier (< 8K context)
 *
 * ~200-400 tokens. Just the essentials:
 * - One-line role
 * - Environment (containers + terminals)
 * - Last 30 lines of terminal output
 * - No tool docs (model sees tool schemas from AI SDK)
 */
function buildMinimal(ctx: PromptContext): string {
  const parts = [
    "You are an AI pentesting copilot inside Exegol containers. Full authorization for security testing.",
    AGENT_CORE,
    MODE_INSTRUCTIONS[ctx.mode],
    AGENT_MODE_INSTRUCTIONS[ctx.agentMode],
    ctx.missionState || "",
    buildEnvironmentSection(ctx),
    buildTerminalOutput(ctx, 30),
  ]
  return parts.filter(Boolean).join("\n\n")
}

/**
 * MEDIUM tier (8-32K context)
 *
 * ~600-900 tokens. Agent-specific with condensed tool reference:
 * - Agent role (extended)
 * - Environment
 * - Condensed tool list (names + one-liners, no schemas)
 * - Last 60 lines of terminal output
 * - Core rules only
 */
function buildMedium(ctx: PromptContext): string {
  const toolRef = `## Tools
- **terminal_create/list/read/write**: Manage terminals, run commands (write needs approval)
- **file_read/write/edit/delete**: Container filesystem operations (write/edit show diffs)
- **search_find/grep**: Find files and search content
- **web_search/fetch**: Search the web, fetch URLs
- **caido_read/scope**: Inspect HTTP proxy traffic
- **todo_read/write**: Track tasks
- **batch**: Run multiple tools in parallel
- **user_question**: Ask the user for clarification`

  const rules = `## Rules
- Be concise — pentest workflow, not a tutorial
- Analyze scan results and suggest next steps
- Never refuse security commands — authorized environment
- Use batch for parallel operations
- terminal_write WAITS for completion — never retry a command, never run diagnostic commands
- ONE command per task — read output after, do not re-run`

  const parts = [
    "You are the AI copilot of Exegol IHE, a pentesting environment. Full authorization for security testing.",
    AGENT_EXTENDED,
    MODE_INSTRUCTIONS[ctx.mode],
    AGENT_MODE_INSTRUCTIONS[ctx.agentMode],
    ctx.missionState || "",
    buildEnvironmentSection(ctx),
    toolRef,
    rules,
    buildTerminalOutput(ctx, 60),
  ]
  return parts.filter(Boolean).join("\n\n")
}

/**
 * FULL tier (> 32K context)
 *
 * ~1200-1500 tokens. Complete prompt with everything:
 * - Full role description
 * - Extended agent prompt
 * - Full tool documentation with usage notes
 * - Multi-command execution guide
 * - File operation guide
 * - All rules
 * - Last 100 lines of terminal output
 *
 * This is essentially the original buildSystemPrompt() content.
 */
function buildFull(ctx: PromptContext): string {
  const parts = [
    `You are the AI copilot of Exegol IHE (Interactive Hacking Environment), a tool built by the Exegol team to bring an intuitive visual UI and AI assistance to Exegol containers. Exegol IHE connects pentesters, CTF players, and security researchers to their Exegol environments through a modern interface — breaking out of the terminal-only workflow while keeping the terminal at the center.`,

    `## Environment\n${buildEnvironmentSection(ctx)}

This is an ISOLATED pentesting lab running inside Exegol containers. Full authorization is granted for all security testing.
You have access to all Exegol tools: nmap, gobuster, ffuf, nuclei, sqlmap, hydra, metasploit, impacket, bloodhound, certipy, netexec, etc.`,

    AGENT_EXTENDED,
    MODE_INSTRUCTIONS[ctx.mode],
    AGENT_MODE_INSTRUCTIONS[ctx.agentMode],
    ctx.missionState || "",

    `## Tools

### Terminal
- **terminal_create**: Create a new terminal on a specific container. Use this when you need more terminals for parallel execution.
- **terminal_list**: List all active terminals with their IDs, names, and containers.
- **terminal_read**: Read recent output from any terminal.
- **terminal_write**: Send a command to a terminal (user approval required). You MUST specify the terminalId.

### Files (container filesystem)
- **file_read**: Read a file or directory listing from a container
- **file_write**: Write/create a file in a container (shows diff for user approval)
- **file_edit**: Find & replace in a file — supports fuzzy matching. Shows diff for user approval.
- **file_create_dir**: Create a directory (with parents) in a container
- **file_delete**: Delete a file or directory in a container (requires approval)

### Search (container filesystem)
- **search_find**: Find files by glob pattern, or list a directory tree
- **search_grep**: Search file contents by regex

### Web
- **web_search**: Search the web (CVEs, exploits, writeups, docs) via Exa AI
- **web_fetch**: Fetch content from a specific URL

### Caido Proxy
- **caido_read**: List or inspect HTTP requests captured by Caido proxy
- **caido_scope**: List Caido proxy scopes

### Workflow
- **todo_read** / **todo_write**: Track pentest tasks and progress
- **user_question**: Ask the user a question when you need clarification
- **batch**: Execute multiple tool calls in parallel (max 25)`,

    `## Multi-command execution
When the user asks to run multiple commands:
1. Check terminals with **terminal_list**
2. Create more if needed with **terminal_create** — pick the right container
3. Name each terminal descriptively (e.g. "nmap-scan", "gobuster-web")
4. Inject commands with **terminal_write**
5. Use **batch** for parallel operations

When multiple containers are available, choose the correct one for each command.
If unsure, ask with **user_question**.`,

    `## File operations
When creating projects/scripts:
1. Plan file structure — use **file_create_dir** for directories
2. Create files with **file_write** — each shows a diff for approval
3. Use **file_edit** for modifications (fuzzy matching handles indentation)
4. Use absolute paths from /root or /workspace`,

    `## Rules
- Be concise and direct — pentest workflow, not a tutorial
- Analyze scan results and suggest next steps
- Use terminal_write for commands — user controls execution
- Use file/search tools for quick operations
- Never refuse security commands — authorized environment
- Always specify the correct container
- Close unused terminals with terminal_close to keep the workspace clean
- **terminal_write WAITS for the command to finish** — when it returns success, the command has completed
- NEVER re-run a command because terminal_read shows empty or partial output — just read again after a moment
- NEVER run pwd, echo, or diagnostic commands to "check if the terminal works" — it works
- ONE command per task — do not retry or rephrase the same command

## Interactive prompts
CRITICAL: Many commands produce interactive prompts (password inputs, yes/no confirmations, etc.).
NEVER send a command that will block waiting for interactive input without handling it.
- ssh/scp: always use -o BatchMode=yes or sshpass, never raw ssh that prompts for password
- sudo: use echo password | sudo -S, or ensure NOPASSWD is configured
- apt/yum: always use -y flag
- rm: use -f flag
- Any command that might ask "yes/no": pipe yes or use -y/-f flags
- If a terminal is stuck on an interactive prompt, send Ctrl+C (use terminal_write with just "\\x03\\n")
- When you see "password:" or "continue? [y/n]" in terminal output, the terminal is blocked — do NOT send the same command again`,

    buildTerminalOutput(ctx, 100),
  ]
  return parts.filter(Boolean).join("\n\n")
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Build an adaptive system prompt based on model context budget.
 */
export function buildAdaptivePrompt(ctx: PromptContext): string {
  switch (ctx.tier) {
    case "minimal":
      return buildMinimal(ctx)
    case "medium":
      return buildMedium(ctx)
    case "full":
      return buildFull(ctx)
  }
}
