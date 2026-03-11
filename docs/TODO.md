# UltiIHE — Master TODO

> Single source of truth for all tasks. Updated 2026-03-12.
> Status: `[ ]` todo, `[~]` in progress, `[x]` done, `[-]` dropped

---

## 1. AI Engine

### 1.1 Tool Call Reliability
- [x] Tool call repair middleware — case-insensitive fix + InvalidTool fallback (`toolResilience.ts`)
- [x] Doom loop detection — 3x identical tool calls abort with clear message (`toolResilience.ts`)
- [x] Provider message transforms — Mistral IDs, empty msgs, tool_call sanitization (`providerTransforms.ts`)
- [x] Prompt caching — Anthropic/OpenRouter/Bedrock cache hints (`providerTransforms.ts`)
- [x] Temperature/sampling defaults per model — qwen, gemini, glm-4, minimax, kimi, etc. (`providerTransforms.ts`)
- [x] `z.coerce.number()` for Groq numResults string→number (`web-tools.ts`)
- [x] Gemini 2.5 Flash thinking budget cap at 24576 (`reasoning.ts`)
- [x] "hallucinated" added to 400 error pattern matching (`errors.ts`)
- [x] `wrapLanguageModel` middleware — transforms at AI SDK level before HTTP call, like OpenCode (`providerTransforms.ts`)
- [x] Arg normalization in repair callback — fixes `name`→`tool`, `arguments`→`args` for weak models (`toolResilience.ts`)
- [x] Tolerant batch tool schema — `z.preprocess()` accepts field name aliases (`workflow-tools.ts`)
- [x] Unsupported media parts → text errors for local models (`providerTransforms.ts`)
- [x] Google/Gemini schema sanitization — int enums→string, required filter, array items (`providerTransforms.ts`)
- [~] Adaptive output truncation — truncate based on context pressure, not just hardcoded limits
- [ ] Tool output save to disk — large outputs saved to file, model gets hint to use Grep/Read

### 1.2 Context Management
- [x] Context budget calculation — 3 tiers (full/medium/minimal) (`budget.ts`)
- [x] Adaptive system prompts — tier-based prompt size (`prompt.ts`)
- [x] Message pruning — clear old assistant messages, protect last 2 user turns (`pruner.ts`)
- [x] Token estimation — 4 chars/token heuristic (`tokens.ts`)
- [x] LLM-based compaction — structured summary (Goal/Discoveries/Accomplished) (`compaction.ts`)
- [x] `/api/compact` endpoint for frontend-triggered compaction
- [x] `needsCompaction` flag in X-Context-Info header
- [x] Auto-trigger compaction — frontend auto-calls `/api/compact` when `needsCompaction` flag is set, with toast feedback
- [ ] Compaction with cheaper model fallback (use smaller model for summary if available)

### 1.3 Model Catalog
- [x] models.dev integration — auto-refresh, cache/snapshot/network fallback (`models-dev.ts`)
- [x] "Latest per family" filtering like OpenCode (`models-dev.ts`)
- [x] Aggregator providers (OpenRouter/Bedrock/Azure) require tool_call
- [x] Provider catalog API — `/api/providers` endpoint (`providers.ts`)
- [x] Dynamic catalog Zustand store — auto-fetch from backend (`providerCatalog.ts`)
- [x] Context resolver using models.dev lookup (`contextResolver.ts`)
- [x] Expandable model details in provider settings UI (`ProviderSettings.tsx`)
- [x] Local model catalog rewrite — 15 battle-tested GGUF models 14B-80B (`modelCatalog.ts`)
- [x] Cloud provider fixes — removed decommissioned/broken models

### 1.4 Advanced AI (not yet started)
- [ ] Plugin/hook system — 15+ hooks for tool/chat/permission extensibility
- [ ] MCP server integration — stdio + HTTP transports, OAuth, tool conversion
- [ ] Sub-agent system — TaskTool to spawn child sessions (recon/exploit/report)
- [ ] Fine-grained permissions — PermissionNext rule engine with glob patterns
- [ ] Tool metadata/versioning — Tool.Info with categories, deprecation, visibility per agent
- [x] Reasoning parts rendering — collapsible thinking blocks in SSE stream + UI (`reasoning.ts`, `MessageBubble.tsx`)
- [ ] Multi-step agent orchestration — agent can plan + execute across multiple turns

---

## 2. Chat UI

### 2.1 Message Rendering
- [x] Markdown rendering — `react-markdown` + `remark-gfm` + Shiki syntax highlighting (`MarkdownContent.tsx`)
- [x] Copy button on code blocks — clipboard API with "Copied" feedback, hover-reveal (`MarkdownContent.tsx`)
- [x] Tool call visualization — expandable cards with status (running/done/error), duration, icons (`ToolCallCard.tsx`)
- [x] Tool call input/output display — collapsible output with markdown rendering (`ToolCallCard.tsx`)
- [x] SSE structured streaming — backend sends typed events (text-delta, tool-call, tool-result), frontend parses
- [x] Message parts model — TextPart + ToolCallPart, interleaved rendering (`MessageBubble.tsx`)
- [x] Auto-scroll to bottom — smart pause on manual scroll, "scroll to bottom" button (`useAutoScroll.ts`)
- [x] Reasoning/thinking display — collapsible "Thought" section with brain icon, streaming support (`MessageBubble.tsx`)
- [ ] Streaming text shimmer — animated cursor or shimmer while text is being generated

### 2.2 Chat Input
- [x] Slash commands — `/scan`, `/recon`, `/exploit`, `/report` + agent/mode switching (`chatCommands.tsx`)
- [x] Slash command autocomplete — popover with keyboard navigation (`CommandPopover.tsx`)
- [x] `@agent` context references — mention agents and terminals (`chatCommands.tsx`)
- [x] Terminal/file context quotes — inline collapsible cards with comment support (`ContextQuotes.tsx`)
- [x] Multi-line input — Shift+Enter for newlines, Enter to send
- [ ] `@file` context references — mention files with line range selection
- [ ] Image/file attachment — drag-and-drop, paste from clipboard, thumbnails
- [ ] Message history — up/down arrows to cycle through previous messages

### 2.3 Session Management
- [x] Session auto-titling — LLM generates title after first exchange via `/api/title` endpoint
- [ ] Session fork — clone conversation at any point, branch off
- [ ] Session revert/undo — snapshot before tool execution, restore on demand
- [ ] Session search — full-text search across all sessions
- [ ] Session archive — soft-delete, restorable
- [ ] Session tabs — multiple sessions open simultaneously

### 2.4 Context & Cost Display
- [x] Token usage indicator — color-coded bar with % used (`ControlBar.tsx`)
- [x] Token breakdown tooltip — tokens used/limit, free, tier, tool count (`ControlBar.tsx`)
- [x] Compaction indicator — pruned status shown in context display (`ControlBar.tsx`)
- [ ] Cost tracking per session — input/output tokens × model pricing
- [ ] Cost display in UI — cumulative $ spent per session

---

## 3. UX Features

### 3.1 Command Palette
- [x] Cmd+Shift+P / Cmd+K — searchable command list (`CommandPaletteDialog.tsx`)
- [x] Command registration system — dynamic commands from components (`useCommandPalette.tsx`)
- [x] Categories — General, Session, Navigation, Terminal, Model & Agent (`useBuiltinCommands.tsx`)
- [x] Keybind display — show shortcut next to each command (`formatKeybind()`)
- [ ] Frecency sorting — frequently used commands float to top

### 3.2 Keybindings
- [x] Keybind system — platform-aware (Mac ⌘ vs Ctrl) (`useCommandPalette.tsx`)
- [ ] Customizable keybinds — settings UI to remap
- [x] Default keybinds — new session, focus chat, focus terminal, switch model, toggle sidebar (`useBuiltinCommands.tsx`)
- [ ] Keybind display in tooltips — everywhere a shortcut exists

### 3.3 Sound Effects
- [ ] Sound system — Web Audio API, configurable per event type
- [ ] Events: agent done, permission request, error, command complete
- [ ] Sound picker in settings — preview + select per event
- [ ] Enable/disable per category — agent sounds, error sounds, notification sounds

### 3.4 Layout
- [x] Resizable panels — sidebar, chat, center area
- [x] Bottom panel — file manager (Nautilus-style)
- [x] Swappable panels — Files and Chat can swap positions
- [x] Session sidebar — toggleable session list
- [x] Layout persistence — panel sizes, open/closed state, swap saved to localStorage (`layoutPersistence.ts`)
- [ ] Layout presets — Default, Terminal, Zen (full terminals), Split
- [ ] Panel collapse/expand — double-click divider to toggle

---

## 4. Terminal

- [x] Terminal multiplexer — create, rename, list, kill terminals
- [x] Ring buffer — last N lines per terminal, ANSI-stripped for AI
- [x] Command queue — approval system for AI-written commands
- [x] Terminal notifications — badge for new output in inactive tabs
- [ ] Terminal search — Ctrl+F search within terminal output
- [ ] Terminal split views — horizontal/vertical split within terminal area
- [ ] Terminal groups — group related terminals (e.g., "recon" group)
- [ ] Terminal drag-and-drop — reorder tabs, drag to split

---

## 5. File System

- [x] File browser — tree view with lazy-loading, 5 default roots
- [x] File read/write/edit/delete — via docker exec
- [x] Monaco editor — syntax highlighting, dirty state, Ctrl+S save
- [x] Fuzzy edit matching — 9 strategies for AI file edits
- [ ] File diff view — unified/split diff for file changes
- [ ] File search — global search across container filesystem
- [ ] Cross-container file transfer — copy files between containers via tar
- [ ] Binary file detection improvements — better MIME handling

---

## 6. Pentest Features

### 6.1 Auto-parsing (P0)
- [ ] Output parser framework — detect tool outputs in terminal (nmap, nuclei, ffuf, netexec...)
- [ ] Structured data extraction — hosts, services, vulns, creds
- [ ] Parser priority list: nmap XML, nuclei JSONL, ffuf JSON, gobuster stdout, netexec, impacket
- [ ] Auto-import when tool writes file (`nmap -oX scan.xml`)

### 6.2 Scope Manager (P0)
- [ ] Scope definition UI — CIDR, domains, URLs, ports
- [ ] Hard gate before commands — warning if target out of scope
- [ ] AI scope check — model verifies scope before proposing commands
- [ ] Import from CSV/text

### 6.3 Credential Vault (P0)
- [ ] Credential table — auto-populated from tool outputs
- [ ] Fields: username, password/hash, type, source, host, service, validity
- [ ] Auto-capture from netexec, secretsdump, hydra, responder
- [ ] Hash tracking — cracked vs pending, export for hashcat/john
- [ ] AI can use vault creds in authenticated commands

### 6.4 Timeline (P1)
- [ ] Activity log — every command with timestamp, terminal, container, output snippet
- [ ] Chronological view — filterable by terminal, time range, event type
- [ ] Annotations — add notes to timeline entries
- [ ] Export — markdown/HTML for reports

### 6.5 Network Map (P1)
- [ ] Visual graph — hosts/services from nmap/masscan data
- [ ] Node styling — color by OS, size by ports count
- [ ] Expandable tree — IP → ports → services → versions → vulns
- [ ] Library: cytoscape.js or d3-force

### 6.6 Findings & Reporting (P1)
- [ ] CVSS calculator — v3.1/v4.0 interactive
- [ ] Finding templates — OWASP Top 10, AD classiques, network
- [ ] Evidence attachment — terminal output, screenshots, HTTP requests
- [ ] Deduplication — same vuln on N hosts = 1 finding
- [ ] Report generation — findings + timeline + screenshots → Markdown/HTML/DOCX

### 6.7 Command Templates (P1)
- [ ] Template system — `/nmap-full {target}` with auto-filled placeholders
- [ ] Playbooks — ordered command sequences (output N → input N+1)
- [ ] 50+ built-in templates, custom templates per user

### 6.8 Nice to Have (P2)
- [ ] Screenshot management — capture, gallery, tagging by finding/host
- [ ] Methodology checklists — OWASP WSTG, PTES, AD, API testing
- [ ] Per-host/service notes — markdown attached to any object
- [ ] Engagement metadata — client, type, dates, RoE, contacts
- [ ] Data import/export — Nmap XML, Nessus, Burp XML, Nuclei JSONL

---

## 7. Integrations

### 7.1 Caido (Proxy)
- [x] Basic Caido tools — `caido_read`, `caido_scope` via GraphQL
- [ ] Caido panel in sidebar — real-time traffic view
- [ ] Request replay from chat — modify and resend intercepted requests
- [ ] Scope sync — Caido scope ↔ IHE scope manager

### 7.2 Exegol
- [x] Container picker — filter by exegol images
- [x] Multi-container support — terminals scoped to containers
- [ ] Container lifecycle — start/stop/restart from UI
- [ ] Image awareness — detect exegol-full/light/ad/web, adapt tool suggestions
- [ ] my-resources — expose shared folder in file browser
- [ ] Resource monitoring — CPU/RAM per container

### 7.3 External Tools (P2+)
- [ ] BloodHound CE — embed web UI as tab, query via API
- [ ] SysReptor/Ghostwriter — export findings to reporting platform
- [ ] Nessus/OpenVAS — import scan results

---

## 8. Infrastructure

- [x] Hono server + WebSocket
- [x] AI SDK Vercel multi-provider
- [x] Zustand state management
- [x] Tailwind CSS theming
- [x] i18n — 18 languages
- [ ] SQLite for sessions/messages — replace in-memory stores
- [ ] Settings persistence — localStorage with migration
- [ ] Theme system — dark/light/system auto-detect with CSS variables
- [ ] Font picker — mono fonts with Nerd Font variants

---

## Files superseded by this TODO

These docs are now consolidated here and can be treated as reference/archive:
- `docs/todo.md` → layout notes (section 3.4)
- `docs/features.md` → pentest features (section 6) + integrations (section 7)
- `docs/ai-improvements.md` → AI engine (section 1.1, 1.2)
- `docs/context-management-research.md` → research notes (section 1.2)
- `docs/cloud-provider-notes.md` → provider fixes (section 1.3)
- `docs/local-model-catalog.md` → GGUF catalog (section 1.3)
