# AI System Improvements — OpenCode Parity Audit

Audit done 2026-03-11 comparing UltiIHE's AI tool system vs OpenCode's.
Classified by real impact on reliability, not just "OpenCode does it".

**Implementation status (2026-03-11):** P0 items 1-4 and P1 items 5-7 all implemented.
- `src/server/routes/chat/toolResilience.ts` — Tool repair + doom loop + InvalidTool
- `src/server/routes/chat/providerTransforms.ts` — Message normalization + prompt caching + temperature
- `src/ai/context/compaction.ts` — LLM-based context summarization
- `src/server/routes/chat/index.ts` — Integrated all of the above + /compact endpoint

---

## CRITICAL — Breaks experience when missing

### 1. Tool Call Repair Middleware
**Status:** ✅ Implemented — `toolResilience.ts`
**Problem:** When a model sends a malformed tool call (wrong name, invalid args), it crashes. The model sees a raw error and must self-correct.
**OpenCode does:**
- Auto-repair case-insensitive tool names (`Read` → `read`)
- Fallback to `InvalidTool` that returns a clean error message to the model
- Model never sees a crash — sees "Invalid tool args: ..." and can correct
**Why it matters:** Small/medium models (Groq, Cerebras, local GGUF) often get tool names wrong. Without repair, they loop on errors.
**Effort:** ~100 lines in chat route streaming setup
**Where:** `src/server/routes/chat/index.ts` — add `experimental_repairToolCall` callback to `streamText()`

### 2. Doom Loop Detection
**Status:** ✅ Implemented — `toolResilience.ts` (3x identical detection + step limit as backup)
**Problem:** Model can call `terminal_read` with identical args 29 times before being stopped.
**OpenCode does:** Detects 3 consecutive identical tool calls (same tool + same JSON args), asks permission or stops.
**Why it matters:** Token/money waste. A medium model stuck on a `grep` that finds nothing will loop indefinitely.
**Effort:** ~50 lines — track last 3 tool calls in the streaming loop, compare
**Where:** `src/server/routes/chat/index.ts` streaming loop

### 3. Provider Message Transforms
**Status:** ✅ Implemented — `providerTransforms.ts` (Mistral IDs, empty msgs, tool_call sanitization)
**Problem:** Works for Claude/GPT but breaks on other providers:
- **Mistral**: requires tool_call IDs of exactly 9 alphanumeric chars; crashes if user message follows tool result directly (needs synthetic assistant "Done." between)
- **Anthropic**: rejects empty messages (`content: ""`)
- **Claude**: sometimes produces tool_call IDs with invalid characters
**OpenCode does:** `ProviderTransform.message()` middleware normalizes all messages before sending to each provider.
**Why it matters:** Root cause of many mysterious provider crashes and "hallucinated tool calls" errors.
**Effort:** ~150 lines — middleware function applied before streamText()
**Where:** New file `src/server/routes/chat/providerTransforms.ts`, called from chat route

### 4. Prompt Caching
**Status:** ✅ Implemented — `providerTransforms.ts` (Anthropic, OpenRouter, Bedrock cache hints)
**Problem:** ~1500 token system prompt re-sent and re-billed every single request.
**OpenCode does:** Marks first 2 system messages + last 2 messages with `cacheControl: { type: "ephemeral" }` for Anthropic/OpenRouter/Bedrock.
**Why it matters:** On Anthropic, cache reduces system prompt cost by ~90% and reduces latency. Significant on long sessions.
**Effort:** ~40 lines — add providerOptions with cache hints
**Where:** `src/server/routes/chat/index.ts` message assembly, provider-conditional

---

## IMPORTANT — Improves quality, not blocking

### 5. LLM-Based Compaction (Context Summarization)
**Status:** ✅ Implemented — `compaction.ts` + `/api/compact` endpoint
**Problem:** Model loses all context of what was accomplished. On long pentest sessions (recon → exploit → report), it "forgets" earlier findings.
**OpenCode does:** Spawns a hidden "compaction" agent that generates structured summary:
```
Goal: ...
Instructions: ...
Discoveries: ...
Accomplished: ...
Relevant files: ...
```
This summary replaces purged history — model keeps context.
**Why it matters:** Pentest sessions are long. Without summarization, the model can't build on earlier work.
**Effort:** ~200 lines — compaction agent prompt + trigger logic
**Where:** New `src/ai/context/compaction.ts`, triggered from pruner when threshold hit

### 6. Adaptive Output Truncation
**Status:** ⚠️ Partial — `needsCompaction` flag in X-Context-Info header signals frontend; per-tool limits still hardcoded
**Problem:** If context is 90% full and a tool returns 49KB, we overflow. Then pruning kicks in next turn.
**OpenCode does:** Truncation adapts to context pressure. High pressure = more aggressive truncation. Overflow saved to disk with hint: "Use Grep/Read to explore full output at /path".
**Why it matters:** Wastes tokens — we send 50KB then prune it next turn. Better to truncate upfront.
**Effort:** ~80 lines — pass context budget info to tool execution wrapper
**Where:** `src/ai/tool/index.ts` tool wrappers, `src/ai/context/budget.ts` budget info

### 7. Temperature/Sampling Per Provider
**Status:** ✅ Implemented — `providerTransforms.ts` `getDefaultSampling()`
**Problem:** Some models are too "creative" with default temperature and hallucinate tool calls.
**OpenCode defaults:**
- Qwen: temperature 0.55
- Gemini: temperature 1.0
- Claude: undefined (model default is fine)
- Minimax: topP 0.95, topK 20-40
- Most others: undefined
**Why it matters:** Reduces hallucinated tool calls on models with high default temperature.
**Effort:** ~30 lines — provider→temperature map in reasoning.ts or new sampling config
**Where:** `src/server/routes/chat/reasoning.ts` or new `src/server/routes/chat/sampling.ts`

---

## NICE TO HAVE — Clean but not urgent

### 8. Plugin/Hook System
**Status:** Not implemented
**What OpenCode has:** 15+ hooks (tool.execute.before/after, chat.params, chat.headers, tool.definition, permission.ask, etc.)
**Why defer:** No external plugins needed yet. Single-user pentest tool doesn't need extensibility framework.
**When to add:** If/when we add MCP server support or custom tool loading.

### 9. Tool Metadata & Versioning
**Status:** Simple AI SDK Tool objects
**What OpenCode has:** `Tool.Info` with semantic versioning, categories, deprecation flags, visibility per agent.
**Why defer:** Our tool set is small and stable. No need for versioning infrastructure.

### 10. Fine-Grained Permission Rules
**Status:** Binary approve/reject with "always allow" memory
**What OpenCode has:** PermissionNext rule engine with glob pattern matching, per-agent rulesets, session overrides.
**Why defer:** Single-user lab tool. Binary approval is sufficient. Add granularity if multi-user or safety-critical.

---

## Implementation Order

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P0 | Tool call repair | Eliminates crashes on medium models | ~100 lines |
| P0 | Doom loop detection | Stops token waste | ~50 lines |
| P0 | Provider message transforms | Fixes mysterious provider crashes | ~150 lines |
| P1 | Prompt caching | -90% system prompt cost on Anthropic | ~40 lines |
| P1 | LLM compaction | Long sessions keep context | ~200 lines |
| P1 | Adaptive output truncation | Avoids overflow, optimizes tokens | ~80 lines |
| P2 | Temperature per provider | Reduces hallucinations | ~30 lines |
| P3 | Plugin hooks | Future extensibility | ~300 lines |
| P3 | Tool metadata/versioning | Clean architecture | ~100 lines |
| P3 | Fine-grained permissions | Multi-user readiness | ~200 lines |

Total P0+P1: ~620 lines across 5-6 files.
