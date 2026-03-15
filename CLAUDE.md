# Exegol IHE - Interactive Hacking Environment

## Vision

Exegol IHE est un **IDE de pentest AI-native** centré sur les terminaux Exegol.
Ce n'est PAS un clone de Claude Code / Cursor. C'est un outil pensé pour le pentester,
ou le terminal est roi et l'IA est un copilote qui voit et comprend tout ce qui se passe dans les shells.

**Produit 100% Exegol** : aucune exécution sur l'host. L'utilisateur choisit un container Exegol au lancement,
et l'IA n'a de contexte que les containers Exegol disponibles.

## Philosophie

- **Terminal-first** : le centre de l'UI est un terminal (ou plusieurs), pas un éditeur de code
- **AI comme copilote pentest** : l'IA voit le contexte terminal (output, commandes) comme un IDE voit le filesystem
- **Exegol-native** : sandboxé dans les containers Exegol, jamais l'host
- **Local-only** : pas de DB externe, pas d'auth, pas de multi-tenancy — outil pour lab ephemere
- **Pas d'over-engineering** : simple, direct, fonctionnel

## Stack technique

- **TypeScript** partout (un seul langage)
- **AI SDK Vercel** (`ai@6+`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, + 15 autres providers)
- **Hono** pour le serveur HTTP/WebSocket (léger, moderne)
- **React 18** pour l'UI
- **xterm.js** pour l'émulation terminal
- **bun-pty** pour les PTY (pas node-pty)
- **Tailwind CSS** pour le style
- **Zustand** pour le state management (localStorage persist, pas de DB)
- **Zod** pour la validation (request bodies, WebSocket schemas)
- **Bun** comme runtime et package manager

## Structure du projet (état réel)

```
src/
├── config.ts                  # Constantes centralisées (timeouts, limites, paths)
├── shared/
│   └── validation.ts          # Regex container name, validatePath, PROTECTED_ROOTS
│
├── server/                    # Hono server + WebSocket
│   ├── index.ts               # Entrypoint serveur (Bun.serve)
│   ├── ws.ts                  # WebSocket handlers (15 schemas Zod)
│   ├── routes/
│   │   ├── chat/              # Endpoint IA principal
│   │   │   ├── index.ts       # POST /api/chat — streaming SSE + Zod validation
│   │   │   ├── systemPrompt.ts # Prompts par mode (CTF/Audit/Neutral)
│   │   │   ├── registry.ts    # Provider SDK factory + cache LRU
│   │   │   ├── providerTransforms.ts # Normalisation par provider (Claude, Mistral, O1...)
│   │   │   ├── toolResilience.ts # Doom loop detection + tool call repair
│   │   │   ├── contextResolver.ts # Context window + max output lookup
│   │   │   ├── reasoning.ts   # Thinking effort config
│   │   │   ├── errors.ts      # Error extraction
│   │   │   ├── compactRoute.ts # POST /api/compact
│   │   │   ├── contextRoute.ts # POST /api/context
│   │   │   └── titleRoute.ts  # POST /api/title
│   │   ├── files.ts           # CRUD filesystem container (docker exec, array args)
│   │   ├── containers.ts      # Liste/gestion containers Docker
│   │   ├── providers.ts       # Config providers AI
│   │   ├── search.ts          # Recherche fichiers container
│   │   ├── probe.ts           # Quick chat probes
│   │   ├── local.ts           # Local AI server lifecycle
│   │   ├── exh.ts             # Exegol-history API
│   │   ├── caido.ts           # Caido proxy API
│   │   ├── webtool.ts         # Web tools (desktop, outils)
│   │   └── mcp/index.ts       # MCP server management
│   ├── services/
│   │   ├── exegol.ts          # CLI exegol wrapper (start/stop/create/remove)
│   │   ├── caido.ts           # Caido proxy client
│   │   ├── webtool.ts         # Tool definitions (5 web tools)
│   │   ├── models-dev.ts      # Models.dev cache (context windows)
│   │   └── local/             # Local AI server (binary, hardware, catalog, server)
│   └── utils/exec.ts          # Shell exec helper
│
├── ai/                        # Moteur IA
│   ├── context/               # Gestion contexte automatique
│   │   ├── budget.ts          # Budget tokens (3 tiers: minimal/medium/full)
│   │   ├── prompt.ts          # System prompt adaptatif par tier + mode agent
│   │   ├── tokens.ts          # Estimation tokens
│   │   ├── pruner.ts          # Pruning vieux tool outputs
│   │   ├── compaction.ts      # Résumé LLM quand overflow
│   │   └── index.ts           # Barrel exports
│   ├── tool/                  # Outils IA (AI SDK tools)
│   │   ├── index.ts           # Combine tools + approval factory + allTools/readOnlyTools
│   │   ├── registry.ts        # Metadata catalog (name, category, requiresApproval, readOnly)
│   │   ├── exec.ts            # dockerExec() + shellEscape() (source unique)
│   │   ├── terminal-tools.ts  # terminal_create, terminal_write, terminal_read, terminal_list
│   │   ├── file-tools.ts      # file_read, file_write, file_edit, file_create_dir, file_delete
│   │   ├── search-tools.ts    # search_find, search_grep
│   │   ├── web-tools.ts       # web_search (Exa), web_fetch
│   │   ├── workflow-tools.ts  # user_question, batch (parallel execution)
│   │   ├── todo-tools.ts      # todo_read, todo_write
│   │   ├── caido-tools.ts     # caido_read, caido_scope
│   │   ├── exh-tools.ts       # exh_read_creds/hosts/env, exh_add_cred/host
│   │   ├── tool-approval.ts   # Approval queue (frontend → server → resume/abort)
│   │   ├── question-queue.ts  # User question queue
│   │   ├── fuzzyReplace.ts    # Fuzzy find-replace pour file_edit
│   │   └── diff.ts            # Diff generation pour approval UI
│   └── mcp/                   # Model Context Protocol
│       ├── client.ts          # MCP client (stdio + HTTP transport)
│       └── convert.ts         # MCP → AI SDK tool conversion
│
├── terminal/                  # Gestion terminaux
│   ├── manager.ts             # PTY lifecycle, ring buffer (1000 lignes), ANSI strip
│   ├── command-queue.ts       # Injection par chunks 4 chars, dedup 3s
│   ├── ops-tracker.ts         # Suivi opérations background
│   └── strip-ansi.ts          # ANSI escape removal
│
└── ui/                        # Frontend React
    ├── App.tsx                # Routes: / → StartPanel, /project/:id → Workspace
    ├── main.tsx               # React 18 entry
    ├── components/
    │   ├── workspace/         # Layout principal
    │   │   ├── WorkspaceLayout.tsx # Orchestration panels + stores
    │   │   ├── TopBar.tsx     # VS Code style: logo, project, search bar centrée, toggles
    │   │   ├── StatusBar.tsx  # Terminals count, findings, tokens
    │   │   ├── CenterArea.tsx # Terminals + file editor + web tools
    │   │   ├── ChatSidePanel.tsx # Session tabs + chat panel
    │   │   ├── FilesSidePanel.tsx # Explorer + collapsible CONTAINERS section
    │   │   ├── WorkspaceTabBar.tsx # Tabs + filtres à droite + drag-drop
    │   │   ├── IconRail.tsx   # Sidebar icônes (44px)
    │   │   └── PopOutPortal.tsx # Fenêtres détachées
    │   ├── chat/              # Chat panel IA
    │   │   ├── ChatPanel.tsx  # Messages + input + streaming + approvals
    │   │   ├── MessageBubble.tsx # Rendu messages + tool grouping Cline-style
    │   │   ├── ToolCallCard.tsx # Visualisation tool calls + status dot
    │   │   ├── ControlBar.tsx # Model picker + thinking effort + agent mode toggle
    │   │   ├── FileApprovalBanner.tsx # Diff approval Cursor-style
    │   │   ├── PermissionBanners.tsx # Command/tool approval UI
    │   │   ├── MarkdownContent.tsx # Rendu markdown
    │   │   ├── SSEParser.ts   # Parse SSE stream
    │   │   └── chatCommands.tsx # Slash commands + @mentions
    │   ├── layout/
    │   │   ├── FileTree.tsx   # Orchestrateur (thin, ~60 lignes)
    │   │   └── filetree/      # Composants splitté
    │   │       ├── TreeNodes.tsx      # TreeDir, TreeFile, InlineInput, ActionBtn
    │   │       ├── PinnedSection.tsx  # Fichiers/dossiers pinnés
    │   │       ├── HostBrowser.tsx    # Navigateur filesystem host
    │   │       ├── ContainerSection.tsx # Arbre container + VisibleRootsModal
    │   │       ├── constants.ts       # Racines par défaut, constantes
    │   │       └── types.ts           # DragData interface
    │   ├── terminal/          # xterm.js + split layout
    │   ├── settings/          # Settings dialog (9 fichiers + localai/)
    │   ├── probe/             # Quick chat (ProbeModal + ProbeHistory)
    │   ├── exegol/            # Container management UI
    │   ├── exh/               # Exegol-history panel
    │   ├── files/             # File editor (Monaco)
    │   ├── search/            # Recherche globale
    │   ├── start/             # Page d'accueil projets
    │   └── CommandPaletteDialog.tsx # Command palette (Ctrl+Shift+P)
    ├── hooks/
    │   ├── useChatStreaming.ts # SSE streaming, retry, abort, auto-title/compact
    │   ├── useChatInput.ts    # Slash/@ popovers, history, keyboard, image paste
    │   ├── useCommandPalette.tsx # Provider + keybind system
    │   ├── useBuiltinCommands.tsx # 18 commandes palette
    │   ├── useAutoScroll.ts   # Smart scroll (Cline pattern)
    │   ├── useWebSocket.ts    # Singleton WS avec reconnect
    │   ├── useConfirm.ts      # Dialog confirmation
    │   └── useResizeHandle.ts # Drag resize panels
    ├── stores/                # Zustand stores (29 fichiers)
    │   ├── session.ts         # Sessions + messages + parts (persist localStorage)
    │   ├── terminal.ts        # Terminals + groups + layout tree
    │   ├── workspace.ts       # Tabs + filtres + per-project scoping
    │   ├── settings.ts        # Providers, models, theme, font, keybinds, agent mode
    │   ├── fileEditor.ts      # Open files, active file, save/close
    │   ├── filesystemCache.ts # Dir cache, CRUD container
    │   ├── fileConfig.ts      # Pinned paths, visible roots (persist)
    │   ├── files.ts           # Barrel re-export des 3 stores ci-dessus
    │   ├── project.ts         # Projets list + active (persist)
    │   ├── orchestrator.ts    # Coordonne switchProject() sur 11 stores
    │   ├── chatContext.ts     # Quotes + images pour le message en cours
    │   ├── commandApproval.ts # Queue approbation commandes
    │   ├── toolApproval.ts    # Queue approbation tools
    │   ├── context.ts         # Token usage tracking
    │   ├── localAI.ts         # Serveur IA local (hardware, models, downloads)
    │   ├── exegol.ts          # Containers Exegol (CRUD via CLI)
    │   ├── container.ts       # Containers Docker bruts
    │   ├── exh.ts             # Credentials/hosts exegol-history
    │   ├── probe.ts           # Quick chat probes
    │   ├── search.ts          # Recherche globale
    │   ├── webtools.ts        # Web tools en cours d'exécution
    │   ├── mcp.ts             # MCP server connections
    │   ├── popout.ts          # Fenêtres détachées
    │   ├── operations.ts      # Opérations background
    │   ├── providerCatalog.ts # Catalogue providers AI
    │   ├── settingsTypes.ts   # Types: AgentMode, ThinkingEffort, AGENT_MODES
    │   └── catalogs/          # Themes, fonts, keybinds, providers
    └── utils/
        ├── layoutHelpers.ts   # Fonctions pures layout tree (extraites de terminal.ts)
        └── sound.ts           # Playback sons UI
```

## Modes d'agent

Pas de sub-agents — 3 **modes** qui changent le comportement de l'IA.
Cycle avec un bouton dans la ControlBar (même UX que le toggle thinking effort).

### CTF (cyan `#22d3ee`, icône Flag)
- Mentalité solveur : Jeopardy ou fullpwn (HTB, THM, root-me)
- Agressif, créatif, essai-erreur, brute-force OK
- Pas de logging formel, pas de rapport — on veut le flag
- Approval mode par défaut : auto-run

### Audit (orange `#f59e0b`, icône ShieldCheck)
- Pentester senior, méthodologie structurée (OWASP, PTES)
- Scope strict, ask avant actions destructives/bruyantes
- Log chaque action, documente les findings (CVSS, remediation)
- Prévient si risque de détection IDS/WAF
- Approval mode par défaut : ask

### Neutral (gris `#9ca3af`, icône Terminal)
- Assistant générique, pas de directives pentest
- Approval mode par défaut : ask

Configuration : `settingsTypes.ts` définit `AGENT_MODES` avec label, description, couleur, icône, defaultApproval.
Persisté par projet via `agentModeByProject` dans settings store.
Le mode est envoyé au serveur dans le body `/api/chat` → injecté dans le system prompt adaptatif.

## Concepts clés

### Le terminal comme contexte IA
- Chaque terminal a un ring buffer (1000 lignes max)
- L'IA lit via `terminal_read`, écrit via `terminal_write`
- Output strippé des escape ANSI avant d'être passé à l'IA
- L'IA voit tous les terminaux, leurs noms, containers

### Container-scoped
- Au lancement : liste des containers Exegol disponibles
- L'utilisateur en choisit un (ou plusieurs) par projet
- Toute exécution passe par `docker exec <container>`
- Aucun accès host — jamais de `bash` natif

### Approval system
- **Commands** : l'IA propose, l'user approve/refuse via banner
- **File writes** : diff Cursor-style avec approve/deny
- **Generic tools** : approval queue (web_search, web_fetch, etc.)
- Factory `withApproval()` dans `ai/tool/index.ts` pour wrapper n'importe quel tool

### Context management automatique
- 3 tiers de prompt selon la context window du model : minimal (<8K), medium (8-32K), full (>32K)
- Pruning : supprime les vieux tool outputs quand tokens overflow
- Compaction : résumé LLM quand >85% du budget utilisé
- Token estimation + context breakdown visibles dans l'UI

### Tool registry
- `ai/tool/registry.ts` : metadata catalog (name, category, requiresApproval, readOnly)
- `readOnlyTools` généré dynamiquement depuis le registry (pas hardcodé)
- Helpers : `getReadOnlyToolNames()`, `getToolsByCategory()`, `getApprovalRequiredTools()`

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo] | Project ▾ |    [🔍 Search...          Ctrl+K]    |◧◨◩⇄|⌘ ⚙│
├──────────┬──────────────────────────────┬────────────────────┤
│          │  Tabs: term-1 | term-2 | f… │ Filters ▸ | + ⊟   │
│ EXPLORER │  ┌─────────┬─────────┐      ├────────────────────┤
│ ──────── │  │ term-1  │ term-2  │      │ [CTF] model ▾ think│
│ > src    │  │ (nmap)  │ (gobus) │      │                    │
│ > docs   │  ├─────────┴─────────┤      │ Messages...        │
│   ...    │  │ term-3 (sqlmap)   │      │ Tool calls...      │
│          │  └───────────────────┘      │ Streaming...       │
│ ▸ CONTRS │                              │                    │
│  ● exgol │                              │ [input] [send]     │
│          │                              │ [ControlBar]       │
├──────────┴──────────────────────────────┴────────────────────┤
│  Status: 3 terminals | 2 findings | 1.2k tokens             │
└──────────────────────────────────────────────────────────────┘
```

- **TopBar** : VS Code style — logo, project switcher, search bar centrée, panel toggles à droite, swap panels, command palette, settings
- **Sidebar gauche** : Explorer avec file tree + section collapsible CONTAINERS (VS Code Outline style)
- **Centre** : Terminals en split/tabs + file editor + web tools en tabs. Filtres à droite du tab bar
- **Chat droite** : Sessions tabs, agent mode toggle, streaming, tool calls, approvals
- **StatusBar** : Compteurs terminaux, findings, tokens
- Tous les panels resizables, swappable, avec presets (default, focus, editor, terminal, recon)

## Règles de développement

### DO
- Typer avec Zod pour les request bodies (voir `ChatRequestSchema` dans `chat/index.ts`)
- Garder l'architecture plate (pas de monorepo)
- Utiliser l'AI SDK Vercel directement
- Streaming partout (SSE pour le chat, WebSocket pour les terminaux)
- Centraliser les constantes dans `src/config.ts`
- Centraliser la validation dans `src/shared/validation.ts`
- Utiliser le tool registry (`ai/tool/registry.ts`) quand on ajoute un tool
- Générer `readOnlyTools` depuis le registry, pas le hardcoder
- Utiliser `withApproval()` factory pour wrapper les tools qui nécessitent approbation
- Extraire les helpers purs dans `ui/utils/` (pas dans les stores)

### DON'T
- Ne JAMAIS permettre l'exécution sur l'host
- Ne pas créer de monorepo — un seul package
- Pas de SQLite/Postgres — localStorage via Zustand persist uniquement
- Pas d'auth/multi-tenancy — outil local single-user
- Pas de sur-abstraction — code simple et direct
- Ne pas dupliquer `dockerExec()` ou les regex de validation — utiliser les sources centralisées
- Ne pas mettre de logique métier dans les stores Zustand (extraire en hooks ou utils)

## Sources de référence

Les projets d'origine et d'inspiration sont dans `oldversions/` :
- `oldversions/IHEMCPEXEGOL/` — IHE original (Python/FastAPI + React)
- `oldversions/opencode-exegol/` — Fork OpenCode avec agents pentest (TypeScript monorepo)
- `oldversions/cline/` — Extension VS Code Cline (patterns UI, tool grouping, doom loop)
- `oldversions/vscode/` — VS Code (inspiration layout, sidebar sections, tab bar)
- `oldversions/Havoc/` — Havoc C2 (référence UI)

Consulter ces projets pour inspiration mais NE PAS les modifier.
