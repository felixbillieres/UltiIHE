# Audit: Terminal Orchestration & Tool Call Architecture

**Date**: 2026-03-26
**Scope**: Bug nmap root cause, Cline/OpenCode comparative analysis, architecture redesign
**Repos analyzed**: Cline (latest), OpenCode (latest), Exegol IHE (main branch)

---

## 1. Bug Report: The nmap Incident

### What happened

User: "run nmap fast on localhost"

1. AI called `terminal_write` with `nmap -F 127.0.0.1`
2. Immediately called `terminal_read` — output empty
3. Hallucinated explanation: "the terminal ne capture pas bien l'output"
4. Re-submitted the same command (doom loop embryonnaire)
5. Result: 3 calls, 19 seconds, garbled output in terminal

What the user saw:
```
nmap -F localhost pwd echo "Starting nmap scan..." && nmap -F 127.0.0.1
```

### Root Cause Chain

**This bug is IMPOSSIBLE with the current codebase** — unless it occurred on a version before the recent fixes. Here's why:

The current `terminal_write` implementation (`manager.ts:336-381`) **already waits for completion**:
1. Acquires per-terminal injection lock (line 342)
2. Waits for shell readiness via `waitForReady()` (line 350)
3. Waits for previous command via `waitForIdle()` (line 352)
4. Writes command in one shot (line 364)
5. Sends Enter (line 370)
6. Sets `busy = true` and **waits for prompt return** via `waitForIdle()` (line 376)
7. Only releases lock in `finally` block (line 379)

The Vercel AI SDK `streamText()` calls tools **sequentially within a step** — tool N+1 only executes after tool N's Promise resolves. Since `terminal_write` awaits `commandQueue.enqueue()` which awaits `writeTyping()` which awaits `waitForIdle()`, the AI SDK **cannot** call `terminal_read` until the command finishes.

**So what caused the original bug?** Most likely one of:

1. **Pre-fix version**: Before commits `be06045` and `24a8d1a`, the waiting/locking mechanism may not have existed
2. **Prompt detection false positive**: `GENERIC_PROMPT_RE = /[\$#>%]\s*$/` — nmap output contains `#` characters (e.g., `# Nmap 7.94`) which can match the generic prompt regex after the 300ms debounce, causing premature `busy = false`
3. **30s timeout**: `waitForIdle` times out after 30 seconds — nmap `-F` on localhost is fast, but a real scan can exceed this, forcing idle and allowing the next tool call
4. **Multiple tool calls in same step**: AI SDK `streamText()` with `maxSteps > 1` runs multiple steps, and within each step the model can request multiple tool calls. If the model requested both `terminal_write` and `terminal_read` in the **same step**, the AI SDK executes them in parallel (they're independent tool calls within one assistant turn).

### The REAL vulnerability: Same-step parallel tool calls

**This is the critical finding.** The Vercel AI SDK's tool execution model:

```
Step 1: Model outputs → [terminal_write(...), terminal_read(...)]
        AI SDK executes BOTH in parallel (Promise.all)
Step 2: Model sees both results, continues
```

When the model emits multiple tool calls in a single response, the AI SDK runs them concurrently. There is **no mechanism** in Exegol IHE to enforce sequencing across tool calls within the same step.

Cline solves this by **forcing one tool call per turn** (`ToolExecutor.ts:333-340`):
```typescript
if (!this.isParallelToolCallingEnabled() && this.taskState.didAlreadyUseTool) {
  // Reject additional tool calls in same turn
  this.taskState.userMessageContent.push({
    type: "text", text: formatResponse.toolAlreadyUsed(block.name)
  })
}
```

### Other vulnerable tool combinations

| Sequence | Risk | Severity |
|----------|------|----------|
| `terminal_write` + `terminal_read` (same step) | Read returns empty, AI hallucinates | **Critical** |
| `file_write` + `file_read` (same step) | Read returns stale content | High |
| `terminal_write` × N (same step, same terminal) | Commands interleave despite injection lock | High |
| `batch` with `terminal_write` × 5 | Pool may not have 5 terminals | Medium |
| `terminal_write` + `terminal_search` (same step) | Search on incomplete output | Medium |
| `file_edit` + `file_edit` (same file, same step) | Second edit based on stale state | High |

### Fix

Two complementary fixes are needed:

**Fix A — Prevent same-step write+read (architecture)**:
Add a `toolCallMiddleware` that serializes dependent tool calls. When the AI SDK is about to execute tools for a step, intercept and reorder:
- All `terminal_write` calls execute first (sequentially per terminal)
- All `terminal_read` / `terminal_search` calls execute after
- All `file_write` / `file_edit` calls execute before `file_read` on same path

**Fix B — Harden prompt detection (prompt regex)**:
The `GENERIC_PROMPT_RE = /[\$#>%]\s*$/` is too broad. Nmap, sqlmap, and many tools produce lines ending with `#` or `>`. Replace with a more specific pattern:
```typescript
// Only match standalone prompt characters at line start (with optional user@host prefix)
const GENERIC_PROMPT_RE = /^(\S+@\S+\s*)?[\$#>%]\s*$/
```
Or better: use a **marker-based approach** (see Architecture section).

---

## 2. Comparative Analysis

### Terminal Management

| Dimension | Cline | OpenCode | Exegol IHE |
|-----------|-------|----------|------------|
| **Process model** | Child process (stdin/stdout pipes) | bun-pty (real PTY) | bun-pty (real PTY) |
| **Completion detection** | `close` event + VS Code shell integration | `onExit()` callback | Prompt regex + 300ms debounce |
| **Interactive support** | Disabled (stdin: "ignore") | Full PTY (user can type) | Full PTY (user can type) |
| **Long-running handling** | "Proceed While Running" button after timeout | Process runs, session tracks status | 30s timeout → forced idle |
| **Output buffering** | Chunks (20 lines/2KB), file for >1000 lines | 2MB ring buffer, 64KB WS chunks | 5000-line ring buffer |
| **ANSI stripping** | Before passing to AI | In terminal manager | In ring buffer storage |
| **Terminal pooling** | No — one terminal per command | No — one session per PTY | Yes — up to 4 AI pool terminals |
| **Concurrent protection** | Single tool per turn (enforced) | Sequential processing loop | Injection lock per terminal |

### Tool Call Orchestration

| Dimension | Cline | OpenCode | Exegol IHE |
|-----------|-------|----------|------------|
| **Sequencing model** | One tool per turn (default) | Event-driven sequential loop | AI SDK multi-step (parallel within step) |
| **Parallel support** | Optional flag + model capability check | Not available | Via `batch` tool (explicit) |
| **Doom loop detection** | 3 soft / 5 hard threshold + signature hash | 3 identical consecutive calls → ask permission | 4 threshold + consecutive mistake counter |
| **Error recovery** | consecutiveMistakeCount + escalating feedback | Permission.ask() on doom | 3 levels: warn → directive → abort |
| **Tool repair** | Streaming XML parser + partial JSON extraction | Not needed (native tool calling) | Case fix + arg aliases + JSON parse + InvalidTool |
| **Max steps per turn** | Unlimited (loop until done or error) | Unlimited (inner while loop) | 5/15/25 (adaptive by context budget) |

### Context & Session Management

| Dimension | Cline | OpenCode | Exegol IHE |
|-----------|-------|----------|------------|
| **Persistence** | VS Code extension state | SQLite (Drizzle ORM) | localStorage (Zustand persist) |
| **Session model** | Task with checkpoint/resume | Session with messages/parts/fork | Session with messages (flat) |
| **Context strategy** | Truncate middle + optional summarization | Prune old tool outputs + LLM compaction | Prune at 70% + compact at 85% |
| **Token counting** | From API response metadata | Per-provider calculation (Decimal) | Heuristic: chars / 4 |
| **Protected content** | First + last messages | "skill" outputs never pruned | None explicitly protected |
| **Compaction prompt** | Optional auto-compact | Structured summary (5 sections) | Structured summary |

### System Prompt Strategy

| Dimension | Cline | OpenCode | Exegol IHE |
|-----------|-------|----------|------------|
| **Wait instructions** | "It is critical you wait for user response after each tool use" | Implicit (sequential loop) | "terminal_write WAITS for completion — NEVER retry" |
| **Tool docs in prompt** | Partial (rules-based, no schemas) | Via agent.prompt + skills | 3 tiers: none / one-liners / full docs |
| **Few-shot examples** | None | None | None |
| **Mode system** | Plan mode (read-only) | 6 agents (build/plan/deep/explore/compaction/title) | 3 modes (CTF/Audit/Neutral) × 3 reasoning modes |
| **Output verification** | "Do not assume success when output is missing" | Implicit | "NEVER re-run because terminal_read shows empty" |

### Approval UX

| Dimension | Cline | OpenCode | Exegol IHE |
|-----------|-------|----------|------------|
| **Command approval** | Inline in chat + "Proceed While Running" | Permission system (ask/allow/deny) | Banner with approve/reject/edit |
| **File diff** | Full file content in chat | Patch-based with snapshots | Diff approval Cursor-style |
| **Auto-approve** | Safe/All toggle | Per-tool permission rules | Mode-based (CTF=auto, Audit=ask) |
| **Bulk approve** | No | No | "Allow all session" mode |
| **Rejection feedback** | Reason injected back to AI | Stops execution | Returns `{ approved: false }` |
| **Timeout** | None (waits forever) | Configurable | 120 seconds |

---

## 3. Architecture Redesign: TerminalQueue v2

### Problem Statement

The current `CommandQueue` handles approval well but has no concept of:
- Tool-level sequencing (write must complete before read)
- Long-running process management (nmap running 10 minutes)
- Partial output streaming during execution
- Background processes vs foreground commands

### Proposed Interface

```typescript
// ── Types ────────────────────────────────────────────────────

type CommandState = "queued" | "awaiting-approval" | "running" | "completed" | "timeout" | "cancelled" | "error"

interface QueuedCommand {
  id: string
  terminalId: string
  terminalName: string
  container: string
  command: string
  state: CommandState
  createdAt: number
  startedAt?: number
  completedAt?: number
  /** Estimated duration category for UI hints */
  durationHint: "fast" | "medium" | "long" | "indefinite"
  /** If redirected to pool terminal */
  actualTerminalId?: string
  /** Exit info when completed */
  exitCode?: number
  /** Truncated output preview (first 5 + last 20 lines) */
  outputPreview?: string
}

interface TerminalQueueOptions {
  /** Default timeout for waitForIdle (ms). Default: 30000 */
  defaultTimeout?: number
  /** Timeout for long-running commands (ms). Default: 300000 (5 min) */
  longRunningTimeout?: number
  /** Max parallel commands across all terminals. Default: 8 */
  maxParallel?: number
}

// ── TerminalQueue class ──────────────────────────────────────

class TerminalQueue {
  private queues: Map<string, QueuedCommand[]>  // per-terminal FIFO
  private running: Map<string, QueuedCommand>   // currently executing per terminal
  private broadcast: BroadcastFn

  /**
   * Enqueue a command. Returns when the command has FINISHED executing
   * (not just when it's been submitted).
   *
   * This is the key difference from the current implementation:
   * the Promise includes the execution result, not just approval status.
   */
  async enqueue(opts: {
    terminalId: string
    command: string
    /** Override timeout for this specific command */
    timeout?: number
    /** Hint for UI: how long will this take? */
    durationHint?: QueuedCommand["durationHint"]
  }): Promise<{
    approved: boolean
    actualTerminalId?: string
    /** Lines of output captured during execution */
    outputLines?: number
    /** Whether command timed out (still running in terminal) */
    timedOut?: boolean
  }>

  /**
   * Check if a terminal has a command currently running.
   * Used by terminal_read to know if output is still being produced.
   */
  isRunning(terminalId: string): boolean

  /**
   * Get the currently running command for a terminal.
   * Returns null if terminal is idle.
   */
  getRunning(terminalId: string): QueuedCommand | null

  /**
   * List all queued + running commands (for UI).
   */
  listAll(): QueuedCommand[]
}
```

### Duration Hint Classification

The system prompt should instruct the AI to classify commands:

```typescript
const DURATION_HINTS: Record<string, QueuedCommand["durationHint"]> = {
  // Fast (< 5s): file operations, simple lookups
  "cat": "fast", "ls": "fast", "pwd": "fast", "id": "fast", "whoami": "fast",
  "echo": "fast", "head": "fast", "tail": "fast", "wc": "fast",

  // Medium (5s - 60s): network probes, short scans
  "ping": "medium", "curl": "medium", "wget": "medium",
  "nmap -F": "medium", "gobuster": "medium", "ffuf": "medium",
  "nikto": "medium", "whatweb": "medium",

  // Long (1 - 10 min): full scans, brute force
  "nmap": "long", "nmap -sC -sV": "long", "hydra": "long",
  "sqlmap": "long", "nuclei": "long", "wfuzz": "long",
  "john": "long", "hashcat": "long",

  // Indefinite: interactive / never-ending
  "tcpdump": "indefinite", "tail -f": "indefinite", "msfconsole": "indefinite",
  "responder": "indefinite", "mitm6": "indefinite",
}
```

### Execution Flow

```
User sends message
  → AI calls terminal_write({ terminalId: "t1", command: "nmap -sV 10.10.10.1" })
    → terminal_write.execute()
      → commandQueue.enqueue({ terminalId: "t1", command: "nmap -sV 10.10.10.1" })
        → [If ask mode] Send "command:pending" to frontend, wait for approval
        → [If approved or auto-run]
          → opsTracker.start(...)
          → terminalManager.writeTyping(terminalId, command)
            → Acquire injection lock
            → waitForReady() — poll until first prompt
            → waitForIdle() — poll until not busy
            → Write command + Enter
            → Set busy = true
            → waitForIdle(timeout) — poll until prompt returns OR timeout
              → On prompt return: busy = false, resolve
              → On timeout: busy = false, resolve with timedOut: true
            → Release lock
          → Return { approved: true, timedOut: false }
    → Return to AI SDK: { success: true, status: "executed" }
  → AI SDK proceeds to next tool call (terminal_read, etc.)
```

### Integration with Zustand (UI state)

```typescript
// In src/ui/stores/operations.ts (already exists)
// Extend with command queue visibility

interface OperationsState {
  // Existing
  operations: Map<string, Operation>

  // New: command queue state
  commandQueue: QueuedCommand[]
  updateCommandQueue: (commands: QueuedCommand[]) => void
}
```

The frontend already receives `command:pending`, `command:executed`, `terminal:idle` via WebSocket. The queue state can be derived from these events without a new store.

---

## 4. Architecture Redesign: Tool Orchestrator

### Problem

The Vercel AI SDK's `streamText()` executes all tool calls within a single step in parallel. This is correct for independent tools but dangerous for dependent ones (write → read).

### Solution: Tool Dependency Layer

Instead of fighting the AI SDK's execution model, add a **pre-execution dependency check** that serializes dependent calls within a step.

```typescript
// src/ai/tool/sequencer.ts

/**
 * Tool dependency rules.
 * Key: tool that MUST wait. Value: tools it must wait for.
 *
 * When the AI SDK is about to execute a step with both a "blocker" and
 * a "waiter" tool, the waiter is deferred to a synthetic next step.
 */
const DEPENDENCIES: Record<string, Set<string>> = {
  // terminal_read must wait for terminal_write on same terminal
  terminal_read: new Set(["terminal_write"]),
  terminal_search: new Set(["terminal_write"]),

  // file_read must wait for file_write/file_edit on same path
  file_read: new Set(["file_write", "file_edit"]),
}

/**
 * Check if two tool calls have a data dependency.
 * Returns true if `waiter` should execute after `blocker`.
 */
function hasDependency(
  blocker: { name: string; args: any },
  waiter: { name: string; args: any }
): boolean {
  const deps = DEPENDENCIES[waiter.name]
  if (!deps || !deps.has(blocker.name)) return false

  // Terminal tools: same terminalId
  if (waiter.name.startsWith("terminal_") && blocker.name.startsWith("terminal_")) {
    return waiter.args.terminalId === blocker.args.terminalId
  }

  // File tools: same container + path
  if (waiter.name.startsWith("file_") && blocker.name.startsWith("file_")) {
    return waiter.args.container === blocker.args.container
      && waiter.args.filePath === blocker.args.filePath
  }

  return true // default: assume dependency
}
```

### Integration Point

The cleanest integration is via the AI SDK's `experimental_repairToolCall` callback, which already intercepts tool calls. But for execution ordering, we need to wrap the tools themselves:

```typescript
// Wrap each tool's execute() to enforce ordering
function withSequencing(tools: Record<string, Tool>): Record<string, Tool> {
  const stepState = {
    executing: new Map<string, Promise<any>>(),  // tool name → promise
  }

  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      const originalExecute = tool.execute!
      const wrappedExecute = async (args: any) => {
        // Wait for any blocking tools to complete first
        const deps = DEPENDENCIES[name]
        if (deps) {
          const blockers = [...stepState.executing.entries()]
            .filter(([n]) => deps.has(n))
          if (blockers.length > 0) {
            await Promise.all(blockers.map(([, p]) => p))
          }
        }

        // Execute and track
        const promise = originalExecute(args)
        stepState.executing.set(name, promise)
        try {
          return await promise
        } finally {
          stepState.executing.delete(name)
        }
      }
      return [name, { ...tool, execute: wrappedExecute }]
    })
  )
}
```

### Alternative: Force Sequential Mode

Simpler approach inspired by Cline — limit `streamText()` to one tool call per step:

```typescript
// In chat/index.ts, add to streamText options:
result = streamText({
  // ... existing options ...
  toolCallStreaming: false, // Wait for complete tool call before executing
  // Force the model to emit one tool call at a time:
  // This is achieved by setting maxToolRoundtrips high but
  // instructing the model to call one tool at a time in the prompt
})
```

The prompt-based approach is less reliable. The sequencing wrapper is the right solution.

### Retry Strategy

Current retry: doom loop detection only. Missing: intelligent retry with context.

```typescript
interface RetryPolicy {
  /** Max retries for this tool category */
  maxRetries: number
  /** Backoff between retries (ms) */
  backoffMs: number
  /** Whether to pass error context to the model */
  feedbackToModel: boolean
}

const RETRY_POLICIES: Record<string, RetryPolicy> = {
  terminal_write: { maxRetries: 1, backoffMs: 0, feedbackToModel: true },
  file_write:     { maxRetries: 2, backoffMs: 100, feedbackToModel: true },
  file_edit:      { maxRetries: 3, backoffMs: 100, feedbackToModel: true }, // fuzzy match may need retries
  web_search:     { maxRetries: 2, backoffMs: 1000, feedbackToModel: false },
  web_fetch:      { maxRetries: 2, backoffMs: 2000, feedbackToModel: false },
}
```

---

## 5. Session & Context Model

### Mission Session Shape

```typescript
// Extend existing session store, don't create new store

interface MissionContext {
  /** Discovered targets */
  targets: Array<{
    ip: string
    hostname?: string
    os?: string
    ports: Array<{ port: number; service: string; version?: string }>
    addedAt: number
  }>

  /** Discovered credentials */
  credentials: Array<{
    username: string
    password?: string
    hash?: string
    domain?: string
    service: string
    addedAt: number
  }>

  /** Findings / vulnerabilities */
  findings: Array<{
    title: string
    severity: "critical" | "high" | "medium" | "low" | "info"
    description: string
    evidence?: string
    cvss?: string
    addedAt: number
  }>

  /** Scope definition */
  scope?: {
    includes: string[]  // CIDRs, domains
    excludes: string[]
  }
}
```

This data is already partially tracked by the `exh` (exegol-history) tools. The mission context should be **derived from exh data**, not duplicated:

```typescript
// In session store, add a computed selector:
getMissionContext: () => {
  const exhStore = useExhStore.getState()
  return {
    targets: exhStore.hosts,
    credentials: exhStore.credentials,
    // findings from todo store tagged as findings
    findings: useTodoStore.getState().items.filter(t => t.tags?.includes("finding")),
  }
}
```

### Terminal State Tracking

The AI currently needs to call `terminal_list` + `terminal_read` to understand terminal state. This is wasteful. Instead, inject terminal metadata into each AI response context.

Already implemented — the system prompt builder (`prompt.ts:77-86`) includes `terminalContext` (last N lines of active terminal output). This is injected at each request.

**What's missing**: per-terminal metadata like current working directory and last command. Add to the terminal model:

```typescript
// In manager.ts Terminal interface, add:
interface Terminal {
  // ... existing fields ...

  /** Last command sent (for AI context) */
  lastCommand?: string
  /** Last command timestamp */
  lastCommandAt?: number
  /** Estimated working directory (parsed from prompt) */
  cwd?: string
}
```

Update these in `writeTyping()` and prompt detection:

```typescript
// In writeTyping(), after writing command:
terminal.lastCommand = command
terminal.lastCommandAt = Date.now()

// In prompt detection, parse cwd from Exegol prompt format:
// [date] container /path/to/dir #
const cwdMatch = curLine.match(/^\[.*?\]\s+\S+\s+(\S+)\s+#/)
if (cwdMatch) terminal.cwd = cwdMatch[1]
```

### Context Injection Strategy

| Data | Where | When |
|------|-------|------|
| Container list | System prompt (environment section) | Every request |
| Active terminals + metadata | System prompt (environment section) | Every request |
| Last 30-100 lines of active terminal | System prompt (terminal output section) | Every request |
| Mission state (targets, creds, flags) | System prompt (after environment) | Every request (if exists) |
| Full terminal output | Via `terminal_read` tool | On demand |
| exh data (hosts, creds) | Via `exh_read_*` tools | On demand |
| File contents | Via `file_read` tool | On demand |

**Key principle**: Inject **summary** in system prompt, let the AI request **details** via tools. Don't dump everything into the prompt — it wastes context budget.

### Pruning Strategy Improvements

Current pruning at 70% is ok. What's missing: **content-aware protection**.

```typescript
// In pruner.ts, add protection rules:

const PROTECTED_PATTERNS = [
  // Credentials
  /password[:\s]+\S+/i,
  /hash[:\s]+[a-f0-9]{32,}/i,
  /NT[LM]?[:\s]+[a-f0-9]+/i,

  // Network findings
  /\d+\/tcp\s+open/,  // nmap open ports
  /CVE-\d{4}-\d+/i,

  // Flags
  /flag\{[^}]+\}/i,
  /HTB\{[^}]+\}/i,
]

function shouldProtect(content: string): boolean {
  return PROTECTED_PATTERNS.some(re => re.test(content))
}
```

When pruning, skip messages whose content matches any protected pattern.

---

## 6. System Prompt Redesign

### Current State

The system prompt already has strong instructions (`prompt.ts:241-244`):
- "terminal_write WAITS for the command to finish"
- "NEVER re-run a command because terminal_read shows empty"
- "NEVER run pwd, echo, or diagnostic commands"
- "ONE command per task"

These are good but insufficient. What's missing:

### Additions for All Tiers

```
## Tool sequencing rules
1. After terminal_write returns, the command has COMPLETED. The output is in the terminal buffer.
   Call terminal_read to see it. Do NOT re-run the command.
2. If terminal_read returns empty or partial output, wait and read again — do NOT re-run the command.
3. NEVER call terminal_write and terminal_read for the same terminal in a single response.
   Always: write in one response → read in the next.
4. For long-running commands (nmap full scan, hydra, sqlmap):
   - terminal_write will return after 30 seconds even if the command is still running
   - This is normal. Call terminal_read periodically to check progress.
   - Look for completion markers: "Nmap done", "sqlmap ended", etc.
5. For indefinite commands (tcpdump, responder, tail -f):
   - They will never "finish". terminal_write will timeout after 30s.
   - This is expected. The process keeps running in the background.
   - Use terminal_read to check output, terminal_write with Ctrl+C to stop.
```

### Mode-Specific Additions

**CTF mode** — add after existing CTF instructions:
```
- Speed over caution: run scans immediately, don't ask permission
- When stuck: try harder, enumerate more, check for easy wins (default creds, known CVEs)
- Always check: exh_read_creds and exh_read_hosts for previously discovered info
- After finding a flag, add it with exh_add_cred
```

**Audit mode** — add after existing Audit instructions:
```
- Before any scan: verify scope with user_question if not clear
- Log each action: use todo_write to track what was done and when
- After finding a vuln: document with severity, CVSS, evidence, remediation
- Warn before: port scans on production, brute force, exploitation attempts
- Add all discovered hosts/creds to exh for the engagement record
```

### Few-Shot Examples (Full Tier Only)

Add a section with 2-3 examples of correct tool usage:

```
## Examples of correct tool usage

### Running a scan and reading results
1. terminal_write({ terminalId: "t1", command: "nmap -sV -sC 10.10.10.1" })
   → Returns: { success: true, status: "executed" }
2. terminal_read({ terminalId: "t1", lines: 200 })
   → Returns: full nmap output with open ports
3. Analyze the output and suggest next steps

### Parallel scans on different targets
1. batch({ calls: [
     { tool: "terminal_write", args: { terminalId: "t1", command: "nmap -sV 10.10.10.1" } },
     { tool: "terminal_write", args: { terminalId: "t2", command: "gobuster dir -u http://10.10.10.1 -w /usr/share/wordlists/dirb/common.txt" } }
   ]})
2. batch({ calls: [
     { tool: "terminal_read", args: { terminalId: "t1", lines: 200 } },
     { tool: "terminal_read", args: { terminalId: "t2", lines: 200 } }
   ]})

### WRONG — never do this
- terminal_write then immediately terminal_read in the same response
- Re-running a command because output was empty
- Running "pwd" or "echo test" to check if terminal works
```

---

## 7. UX Spec: Chat Panel v2

### ToolCallCard

States: `pending` → `running` → `completed` | `error` | `timeout`

```
┌─ terminal_write ─────────────────────── ● running ─┐
│ nmap -sV -sC 10.10.10.1                            │
│ on: exegol-bugbounty (term-1 "nmap-scan")           │
│                                                      │
│ ▼ Output (expanding)                                │
│ Starting Nmap 7.94 ...                              │
│ Discovered open port 22/tcp                         │
│ Discovered open port 80/tcp                         │
│ ... (streaming)                                     │
│                                                      │
│ [Running 12s]                          [Cancel]     │
└──────────────────────────────────────────────────────┘
```

For completed:
```
┌─ terminal_write ─────────────────── ✓ completed 8s ─┐
│ nmap -sV -sC 10.10.10.1                              │
│ ▸ 3 open ports found — click to view in terminal     │
└───────────────────────────────────────────────────────┘
```

For `terminal_read`:
```
┌─ terminal_read ──────────────────────── ✓ 142 lines ─┐
│ Read from term-1 "nmap-scan"                          │
│ ▸ View in terminal                                    │
└────────────────────────────────────────────────────────┘
```

**Implementation**: Modify `ToolCallCard.tsx` to:
- Show command text prominently for `terminal_write`
- Show live output preview (last 5 lines) while running
- Collapse to summary after completion
- "View in terminal" link that focuses the terminal tab

### ApprovalBanner v2

```
┌─ Approve command ────────────────────────────────────┐
│                                                      │
│  $ nmap -sV -sC 10.10.10.1                          │
│  ↳ on exegol-bugbounty (term-1)                     │
│                                                      │
│  [Y] Approve  [N] Deny  [E] Edit  [A] Allow all    │
│  ────────────────────────────────────────────────── │
│  Keyboard: Y=approve  N=deny  E=edit  A=allow-all   │
└──────────────────────────────────────────────────────┘
```

Changes from current:
- Show the command in monospace, prominently
- Inline edit mode: clicking [E] makes the command editable
- Keyboard shortcuts visible (already implemented via keybindings)
- Stack multiple pending approvals vertically

### BatchProgress

```
┌─ batch ──────────────────────── 3/5 completed ──────┐
│ ✓ terminal_read (t1) ── 142 lines                   │
│ ✓ terminal_read (t2) ── 89 lines                    │
│ ✓ terminal_read (t3) ── 203 lines                   │
│ ● terminal_write (t4) ── running 3s                  │
│ ○ terminal_write (t5) ── queued                      │
│                                          ████░░ 60%  │
└──────────────────────────────────────────────────────┘
```

### ModeIndicator

Already implemented in `ControlBar.tsx`. No changes needed — the cycling button with color (cyan/orange/grey) is the right UX.

### Mode Switch Mid-Conversation

When switching CTF → Audit (or vice versa):
1. The approval mode changes immediately (CTF auto-run → Audit ask)
2. **Pending approvals are NOT cancelled** — they inherit the new mode's behavior
3. The system prompt changes on the **next** AI request
4. A system message is injected: "Mode switched to Audit. Commands now require approval."
5. The AI sees this in context and adjusts behavior

Implementation: In `settings.ts` store, when `agentModeByProject` changes, broadcast a `mode:changed` event via WebSocket. The chat hook injects a system message.

---

## 8. Implementation Roadmap

### Phase 1 — Critical Fixes (1-2 days)

**P1.1: Harden prompt regex** — `manager.ts:10-11`
- Replace `GENERIC_PROMPT_RE` with stricter pattern that won't match nmap/tool output
- Add unit tests with common false-positive outputs (nmap, sqlmap, metasploit)
- **Risk**: Low — purely defensive, no behavior change for correct prompts

**P1.2: Tool call sequencing wrapper** — new file `src/ai/tool/sequencer.ts`
- Implement `withSequencing()` wrapper from section 4
- Apply in `src/ai/tool/index.ts` when building the tools object
- Ensures `terminal_read` waits for `terminal_write` even within same AI SDK step
- **Risk**: Medium — needs testing with batch tool to avoid deadlocks

**P1.3: System prompt tool sequencing rules** — `src/ai/context/prompt.ts`
- Add the "Tool sequencing rules" section from section 6
- Add few-shot examples for full tier
- **Risk**: Low — additive only

### Phase 2 — Terminal Reliability (2-3 days)

**P2.1: Long-running command support** — `manager.ts`
- Add configurable timeout per command (pass from tool call)
- When timeout fires: return `timedOut: true` instead of silently forcing idle
- AI sees `timedOut` and knows to poll with `terminal_read`
- **Risk**: Medium — changes waitForIdle contract

**P2.2: Terminal metadata tracking** — `manager.ts`
- Track `lastCommand`, `lastCommandAt`, `cwd` per terminal
- Parse cwd from Exegol prompt format in prompt detection callback
- Inject into system prompt environment section
- **Risk**: Low — additive

**P2.3: Content-aware pruning** — `pruner.ts`
- Add `PROTECTED_PATTERNS` for credentials, ports, flags, CVEs
- Skip protected messages during pruning
- **Risk**: Low — only affects pruning decisions

### Phase 3 — UX Improvements (2-3 days)

**P3.1: ToolCallCard v2** — `ToolCallCard.tsx`
- State machine rendering (pending/running/completed/error/timeout)
- Live output preview for terminal_write (subscribe to terminal:output WS events)
- Collapse-to-summary after completion
- "View in terminal" link

**P3.2: ApprovalBanner v2** — `PermissionBanners.tsx`
- Prominent command display in monospace
- Inline edit mode
- Keyboard shortcut hints
- Stacked multiple approvals

**P3.3: BatchProgress** — new component in `chat/`
- Progress bar for batch tool execution
- Per-tool status line
- **Risk**: Low — purely UI

### Phase 4 — Advanced Features (3-5 days)

**P4.1: Mission context injection** — `prompt.ts` + `session.ts`
- Derive mission context from exh store
- Inject summary (target count, cred count, finding count) into system prompt
- Only when data exists (don't waste tokens on empty mission)

**P4.2: Mode switch system message** — `settings.ts` + `useChatStreaming.ts`
- Broadcast `mode:changed` via WebSocket
- Inject system message into active session
- AI acknowledges mode change on next turn

**P4.3: Smart retry with context** — `toolResilience.ts`
- Implement retry policies per tool category
- Pass structured error context back to model on failure
- Distinguish "tool infrastructure error" vs "command returned error"

### Dependency Graph

```
P1.1 ──→ P2.1 (prompt regex fix enables reliable long-running support)
P1.2 ──→ independent (can land alone)
P1.3 ──→ independent (can land alone)

P2.1 ──→ P3.1 (timeout state needed for ToolCallCard timeout rendering)
P2.2 ──→ P4.1 (terminal cwd needed for mission context)
P2.3 ──→ independent

P3.1 ──→ independent (uses existing WS events)
P3.2 ──→ independent
P3.3 ──→ independent

P4.1 ──→ P2.2
P4.2 ──→ independent
P4.3 ──→ independent
```

### What NOT to do

- **Don't add a database** — the localStorage model works for single-user
- **Don't create sub-agents** — the 3-mode system is the right abstraction
- **Don't replace the AI SDK** — work with its execution model, add sequencing on top
- **Don't add marker-based completion detection** (injecting echo markers before/after commands) — the prompt regex approach is simpler and works well once hardened. Markers add complexity (escaping, nested shells, docker exec layers) for marginal gain
- **Don't over-instrument** — the current ring buffer + prompt detection is fundamentally sound
