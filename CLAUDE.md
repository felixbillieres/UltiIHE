# UltiIHE - Ultimate Interactive Hacking Environment

## Vision

UltiIHE est un **IDE de pentest AI-native** centré sur les terminaux Exegol.
Ce n'est PAS un clone de Claude Code / Cursor. C'est un outil pensé pour le pentester,
ou le terminal est roi et l'IA est un copilote qui voit et comprend tout ce qui se passe dans les shells.

**Produit 100% Exegol** : aucune exécution sur l'host. L'utilisateur choisit un container Exegol au lancement,
et l'IA n'a de contexte que les containers Exegol disponibles.

## Philosophie

- **Terminal-first** : le centre de l'UI est un terminal (ou plusieurs), pas un éditeur de code
- **AI comme copilote pentest** : l'IA voit le contexte terminal (output, commandes) comme un IDE voit le filesystem
- **Exegol-native** : sandboxé dans les containers Exegol, jamais l'host
- **Local-only** : pas de DB, pas d'auth, pas de multi-tenancy — outil pour lab ephemere
- **Pas d'over-engineering** : simple, direct, fonctionnel

## Architecture : Fusion des deux projets

### Pris d'OpenCode (cerveau IA)
Tout le moteur IA est pris d'OpenCode car c'est ultra propre et on ne fera pas mieux :

- **Agent system** : agents (primary/subagent/all), permissions par agent, Agent.Info schema Zod
- **Sub-agents** : recon, exploit, report + general, explore, plan — invocables via TaskTool
- **AI SDK Vercel** (`ai` + `@ai-sdk/*`) : multi-provider (30+), streaming, tool calling unifié
- **Tool registry** : interface Tool.Info + Tool.Context, validation Zod, permission checks via ctx.ask()
- **MCP integration** : servers locaux (stdio) et remote (HTTP/SSE+OAuth), conversion automatique MCP→AI SDK Tool
- **Permission system** : PermissionNext avec rules (allow/deny/ask), ruleset par agent, auto-remember
- **Plugin hooks** : 15 hooks (chat.params, chat.headers, tool.definition, etc.) pour extensibilité
- **Provider transform** : normalisation messages par provider (Claude, Mistral, etc.), prompt caching
- **Session/LLM streaming** : streamText avec middleware, tool repair, doom loop detection
- **Message parts** : TextPart, ToolPart, ReasoningPart, PatchPart, StepStart/Finish

### Pris d'OpenCode (gestion contexte automatique)
Le système de contexte d'OpenCode est essentiel — l'IA doit gérer sa mémoire seule :

- **Compaction automatique** : quand les tokens overflow, le système prune et résume
  - Détection overflow : `tokens_used >= (input_limit - reserved)` (reserved = min(20k, maxOutput))
  - Pruning : parcourt l'historique en arrière, efface les outputs des vieux tool calls
  - Protège les 40k derniers tokens de tool calls + les 2 derniers turns user
  - Cible : libérer minimum 20k tokens par compaction
  - Résumé généré par agent "compaction" avec template : Goal, Instructions, Discoveries, Accomplished, Relevant files
- **Message conversion intelligente** :
  - Tool calls compactés marqués `time.compacted` → output remplacé par `"[Old tool result content cleared]"`
  - Tools interrompus → `"[Tool execution was interrupted]"`
  - Media (images/PDFs) filtrés si le provider ne les supporte pas
  - Reasoning tokens préservés si le model supporte
- **Frontend sync event-driven** :
  - GlobalSync écoute tous les events backend
  - Cache LRU : max 40 sessions actives en store, éviction des plus anciennes
  - Per-directory stores : max 30, éviction après 20min d'inactivité
  - Session trimming : garde les 50 sessions récentes (< 4h) + enfants + permissions pending

### Pris d'OpenCode (système projets + sessions)
La gestion projets/sessions d'OpenCode est reprise et adaptée pour le pentest :

- **Projets** = engagements pentest (un projet = un audit/lab)
  - Dans OpenCode : auto-détecté par `.git` root, ID = hash du root commit
  - Dans UltiIHE : un projet = un container Exegol + ses métadonnées d'engagement
  - Stockage : SQLite (ProjectTable) avec cascade delete sur les sessions
  - Métadonnées : name, icon (url/color), commands (bootstrap), sandboxes (paths additionnels)
  - Instance pattern : contexte async par directory, state scopé, lazy init, dispose/cleanup
- **Sessions** = conversations indépendantes par projet
  - Chaque session a son propre historique de messages, permissions, agent context
  - SessionTable : id (ULID desc), project_id (FK cascade), title, directory, permissions, summary
  - MessageTable : id, session_id (FK cascade), data JSON (MessageV2.Info)
  - PartTable : id, message_id (FK cascade), data JSON (TextPart/ToolPart/ReasoningPart/etc.)
  - Session lifecycle : create → busy/idle/retry → archive
  - Fork : clone messages jusqu'à un point, incrémente counter dans le titre
  - Sessions enfants : parent_id pour sub-sessions (sub-agent tasks)
  - Permissions par session : ruleset JSON mergé avec agent defaults
  - Revert : snapshots avant tool execution, restore possible
  - Titre auto : `"New session - {ISO date}"`, renommage automatique par agent "title"
  - Liste : par projet, triée par time_updated DESC, search, pagination cursor

### Pris d'OpenCode (UI framework, layout, settings)
La base UI d'OpenCode est excellente et on reprend sa logique :

- **Layout system** : panels resizables avec persistence localStorage (clé "layout.v6")
  - Sidebar (344px default), chat panel (450px), terminal panel (280px), file tree (344px)
  - ResizeHandle avec min/max constraints
  - Layout presets : default, split, terminal, zen (full-screen terminals)
- **Settings complet** :
  - General : autoSave, fontSize (14 default), font (13 mono fonts), sounds avec preview
  - Keybinds : 6 groupes (General, Session, Navigation, Model/agent, Terminal, Prompt)
  - Providers : Connected (source: env/api/config/custom) + Popular providers, OAuth + API key flows
  - Models : visibility toggle, recherche, recent stack (max 5), variants
- **Theme system** : CSS variables (200+ tokens), dark/light/system auto-detect
  - Preload script avant render (`oc-theme-preload.js`)
  - Variables : `--text-*`, `--surface-*`, `--border-*`, `--icon-*`, `--avatar-*`
  - Stocké dans localStorage : `opencode-theme-id`, `opencode-color-scheme`
- **i18n** : 18 langues (en, fr, de, es, ja, ko, zh, zht, ru, ar, pl, da, no, br, th, bs, tr)
  - @solid-primitives/i18n (à adapter pour React : react-i18next ou similaire)
  - Détection auto via navigator.languages + cookie persistence
  - Dictionnaires plats avec clés pointées : `"settings.general.row.language.title"`
- **Provider settings UI** :
  - Liste connected providers avec badge source (Environment, API Key, Config, Custom)
  - Popular providers triés : opencode, anthropic, copilot, openai, google, openrouter, vercel
  - Dialog de connexion : OAuth flow ou saisie API key manuelle
  - ProviderIcon par provider, notes/descriptions pré-définies
- **Dialog system** : ConnectProvider, Settings, SelectModel, SelectProvider, SelectMCP, etc.
- **Command palette** : Cmd+Shift+P, useCommand() hook, keybind parsing
- **Toast notifications** : success/error/default, optional persistent, action buttons
- **Font stack** : 13 fonts mono avec Nerd Font variants + fallback chains
  - ibm-plex-mono (default), cascadia-code, fira-code, hack, jetbrains-mono, etc.

### Pris d'IHE (UI terminal pentest + filesystem container)
L'UI terminal et l'interaction pentest sont pris d'IHE :

- **Terminal multiplexer** : split screen, rename, groupes, tabs — xterm.js avec PTY réel
- **Terminal comme contexte IA** : ring buffer des N dernières lignes, stripped ANSI, feedé à l'IA
- **Command injection** : l'IA peut écrire directement dans les terminaux (chunks 4 chars, dedup window 3s)
- **Command preview** : avant exécution, l'IA propose les commandes avec explications + warnings interactifs
- **Terminal proposals** : l'IA peut proposer de créer N terminaux avec noms (ex: "nmap-scan", "gobuster-web")
- **Parallel execution** : commandes en parallèle sur plusieurs terminaux avec résumé AI
- **Container picker** : sélection du container Exegol au démarrage (filtre par image exegol)
- **Layouts** : horizontal/vertical split, grid, focus mode
- **Notifications** : indicateur de nouveau output dans les tabs non-actifs
- **Filesystem browser container** (adapté pour Exegol, pas l'host) :
  - Arbre récursif avec lazy-loading par dossier, 5 racines par défaut : `/workspace`, `/opt/tools`, `/root`, `/etc`, `/tmp`
  - Drag-and-drop avec Ctrl/Cmd pour copy vs move, y compris entre containers
  - Inline create/rename/delete avec confirmation modale
  - Monaco editor intégré : theme exegol-dark, language auto-detect, dirty state, Ctrl+S save
  - Read-only pour fichiers > 1MB, rejet binaires (null bytes), strip ANSI
  - Backend via `docker exec` : find, stat, cat, tee, tar (cross-container transfers)
  - Sécurité : validation path regex, symlink escape detection, protected roots
  - Zustand store : openFiles (tabs), activeFileId, dirCache (LRU), savingFiles (dedup)

### Types clés d'IHE à reprendre

```typescript
interface TerminalInfo {
  id: string;
  name: string;
  isActive: boolean;
  lastCommand?: string;
  container?: string;
  groupId?: string;
  hasNotification?: boolean;
}

interface TerminalGroup {
  id: string;
  name: string;
  collapsed: boolean;
}

interface CommandPreview {
  command: string;
  terminalId: string;
  explanation?: string;
  autoRun: boolean;
  interactiveWarning?: {
    command: string;
    warning: string;
    suggestion: string;
  };
}

interface TerminalCreateProposal {
  count: number;
  names: string[];
  container?: string;
  status: 'pending' | 'accepted' | 'rejected';
  mode?: 'split' | 'tabs';
}
```

### Nouveau dans UltiIHE (ni OpenCode ni IHE)

- **Container-scoped context** : au lancement, on choisit un container Exegol → tout est scopé à ce container
- **Terminal = outil AI de premier rang** : les terminaux sont des Tool au sens AI SDK, pas juste de l'UI
- **Findings intégrés à l'UI** : panneau dédié avec CVSS, severity, status, evidence — pas juste un JSON
- **Engagement flow** : recon → exploit → report comme workflow guidé dans l'UI

## Stack technique

- **TypeScript** partout (un seul langage)
- **AI SDK Vercel** directement (`ai@5+`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.)
- **Hono** pour le serveur HTTP/WebSocket (léger, moderne)
- **React 18** pour l'UI (expertise existante)
- **xterm.js** pour l'émulation terminal
- **node-pty** ou `docker exec` streams pour les PTY
- **Tailwind CSS** pour le style
- **Zustand** pour le state management
- **Zod** pour la validation
- **Bun** comme runtime et package manager

## Structure du projet

```
ultiIHE/
├── src/
│   ├── server/              # Hono server + WebSocket
│   │   ├── index.ts         # Entrypoint serveur
│   │   ├── ws.ts            # WebSocket handlers
│   │   └── routes/          # API REST si besoin
│   │
│   ├── ai/                  # Moteur IA (porté d'OpenCode)
│   │   ├── agent/           # Agent system (primary, subagent, permissions)
│   │   ├── provider/        # AI SDK providers + transform + caching
│   │   ├── tool/            # Tool registry + built-in tools
│   │   │   ├── registry.ts
│   │   │   ├── exegol-exec.ts
│   │   │   ├── exegol-container.ts
│   │   │   ├── exegol-findings.ts
│   │   │   └── terminal-read.ts    # NOUVEAU: lire output terminal comme tool
│   │   ├── mcp/             # MCP client/server integration
│   │   ├── permission/      # PermissionNext system
│   │   ├── session/         # Session, LLM streaming, message parts
│   │   └── plugin/          # Plugin hook system
│   │
│   ├── terminal/            # Gestion terminaux (porté d'IHE)
│   │   ├── manager.ts       # Création/destruction PTY, ring buffer
│   │   ├── injector.ts      # Command injection (chunks, dedup)
│   │   └── docker.ts        # Docker exec, container detection Exegol
│   │
│   ├── project/             # Système projets (porté d'OpenCode)
│   │   ├── project.ts       # Project CRUD, auto-detect, SQLite storage
│   │   ├── instance.ts      # Async context per-directory, state scoping
│   │   └── db.ts            # SQLite tables (project, session, message, part)
│   │
│   ├── session/             # Système sessions (porté d'OpenCode)
│   │   ├── session.ts       # Session lifecycle (create, fork, archive, list)
│   │   ├── prompt.ts        # User message assembly, context building
│   │   ├── processor.ts     # Stream processing, tool call handling
│   │   ├── compaction.ts    # Auto-compaction (prune + summarize on overflow)
│   │   ├── message.ts       # MessageV2 model, parts, toModelMessages()
│   │   ├── status.ts        # Session status (idle/busy/retry)
│   │   └── summary.ts       # Session summarization, diff tracking
│   │
│   ├── engagement/          # Workflow pentest
│   │   ├── findings.ts      # Findings DB (JSON structuré)
│   │   └── flow.ts          # Recon → Exploit → Report orchestration
│   │
│   ├── filesystem/           # Filesystem browser container (porté d'IHE)
│   │   ├── manager.ts       # Docker exec wrapper (find, stat, cat, tee, tar)
│   │   ├── security.ts      # Path validation, symlink escape, protected roots
│   │   └── transfer.ts      # Cross-container copy/move via tar piping
│   │
│   └── ui/                  # Frontend React
│       ├── App.tsx
│       ├── components/
│       │   ├── terminal/    # xterm.js, split pane, tabs, groups
│       │   ├── chat/        # Chat panel, command previews, streaming
│       │   ├── findings/    # Findings panel, CVSS display
│       │   ├── containers/  # Container picker Exegol
│       │   ├── files/       # File tree browser + Monaco editor
│       │   ├── settings/    # Settings dialog (general, keybinds, providers, models)
│       │   └── layout/      # Layout manager (panels resizables, presets)
│       ├── stores/          # Zustand stores
│       │   ├── terminal.ts
│       │   ├── chat.ts      # Messages, parts, streaming state
│       │   ├── ai.ts        # Provider/model config, agent state
│       │   ├── layout.ts    # Panels sizes + persistence localStorage
│       │   ├── files.ts     # openFiles, dirCache, activeFileId
│       │   ├── settings.ts  # Appearance, keybinds, permissions, sounds
│       │   ├── theme.ts     # Theme + color scheme
│       │   ├── i18n.ts      # Language detection + dictionaries
│       │   ├── project.ts   # Projects list, active project, CRUD
│       │   ├── session.ts   # Sessions per project, active session, cache (max 40)
│       │   └── engagement.ts
│       └── hooks/
│
├── agents/                  # Agent definitions (markdown + config)
│   ├── recon.md
│   ├── exploit.md
│   └── report.md
│
├── package.json
├── tsconfig.json
├── bunfig.toml
└── CLAUDE.md                # Ce fichier
```

## Agents pentest

### recon (subagent, cyan #22d3ee)
- Outils : exegol_exec, exegol_container, exegol_findings, terminal_read
- Workflow : découverte réseau → énumération services → scan vulns
- Commandes typiques : nmap, gobuster, ffuf, dig, whois, subfinder

### exploit (subagent, red #ef4444)
- Outils : exegol_exec, exegol_findings, terminal_read
- Workflow : valider vulns → exploitation → capture evidence
- Commandes typiques : sqlmap, hydra, metasploit, nuclei, impacket

### report (subagent, purple #a855f7)
- Outils : exegol_findings (read-only), terminal_read
- Workflow : collecter findings → générer rapport (CVSS, impact business, remédiation)
- Interdit : exegol_exec, bash (lecture seule)

### build (primary, default)
- Agent principal avec qui l'utilisateur interagit
- Peut invoquer les sub-agents recon/exploit/report
- Accès à tous les outils selon permissions

## Layout UltiIHE

Le layout fusionne la fluidité d'OpenCode avec l'orientation terminal d'IHE :

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar : container actif, agent actif, model selector     │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │                   │
│ Sidebar  │   Zone principale            │  Chat panel       │
│ (resize) │   = Terminaux                │  (resize)         │
│          │   splits/tabs/groups         │                   │
│ - Files  │                              │  - Messages       │
│ - Terms  │   ┌─────────┬─────────┐      │  - Cmd previews   │
│ - Groups │   │ term-1  │ term-2  │      │  - Tool calls     │
│ - Finds  │   │ (nmap)  │ (gobus) │      │  - Streaming      │
│          │   ├─────────┴─────────┤      │                   │
│          │   │ term-3 (sqlmap)   │      │                   │
│          │   └───────────────────┘      │                   │
│          │                              │                   │
├──────────┴──────────────────────────────┴───────────────────┤
│  Status bar : findings count, active terminals, tokens used │
└─────────────────────────────────────────────────────────────┘
```

**Sidebar gauche** (comme OpenCode, contenu adapté pentest) :
- Onglet Files : arbre filesystem du container Exegol (pas l'host)
- Onglet Terminals : liste des terminaux avec groupes, status, notifications
- Onglet Findings : liste des vulns trouvées, filtrable par severity/status

**Zone principale** (logique IHE) :
- Terminaux en split/tabs/groupes, resizables
- Monaco editor en tab quand on ouvre un fichier
- Presets : default (sidebar+terms+chat), terminal (terms+mini chat), zen (terms only), split (chat+terms)

**Chat panel droit** (moteur OpenCode) :
- Streaming AI responses avec message parts
- Command previews avec accept/reject/modify
- Tool call visualization (exegol_exec, findings, etc.)
- Agent indicator (build/recon/exploit/report avec couleur)
- **Gestion contexte automatique** visible : indicateur tokens used/limit, compaction en cours
- **Session switcher** : liste des sessions du projet, créer/fork/archiver
- **Project switcher** : dans la toolbar, changer de projet (= changer de container/engagement)

**Layout modifiable** :
- Tous les panels sont resizables avec drag handles (min/max constraints)
- Panels peuvent être ouverts/fermés individuellement
- Presets rapides : default, terminal, zen, split (boutons dans la toolbar)
- Persistence complète dans localStorage (sizes, opened/closed, active preset)
- L'utilisateur peut réarranger selon son workflow (ex: chat en bas au lieu de droite)

## Concepts clés

### Le terminal comme contexte IA
Contrairement à un IDE classique ou l'IA voit les fichiers, ici l'IA voit les **terminaux** :
- Chaque terminal a un ring buffer (dernières N lignes de sortie)
- L'IA peut lire n'importe quel terminal via le tool `terminal_read`
- L'IA peut écrire dans n'importe quel terminal via `exegol_exec` ou command injection
- Le output est strippé des escape ANSI avant d'être passé à l'IA
- L'IA voit quel terminal est actif, leurs noms, groupes

### Container-scoped
- Au lancement : liste des containers Exegol disponibles (filtre par image `exegol*`)
- L'utilisateur en choisit un (ou plusieurs)
- Toute exécution passe par `docker exec <container>`
- Aucun accès host — jamais de `bash` natif
- L'IA ne voit que les containers Exegol, pas le système host

### Command preview & injection
- L'IA propose des commandes avec explications AVANT exécution
- L'utilisateur peut accepter/refuser/modifier chaque commande
- Les commandes acceptées sont injectées dans le terminal cible via PTY
- Injection par chunks de 4 caractères avec délai (évite buffer overflow terminal)
- Fenêtre de déduplication de 3 secondes (évite doubles injections)

## Règles de développement

### DO
- Typer tout avec Zod pour la validation runtime
- Garder l'architecture plate (pas de monorepo)
- Utiliser l'AI SDK Vercel directement, pas de wrapper custom
- Streaming partout (SSE/WebSocket pour l'UI)
- Tester les tools individuellement
- Penser "terminal-first" pour chaque feature

### DON'T
- Ne JAMAIS permettre l'exécution sur l'host
- Ne pas créer de monorepo — un seul package
- SQLite uniquement pour projets/sessions/messages (comme OpenCode) — pas de Postgres/MySQL
- Ne pas faire d'auth/multi-tenancy — outil local single-user
- Ne pas copier l'UI d'un IDE code — c'est un IDE pentest
- Ne pas sur-abstraire — code simple et direct

## Sources de référence

Les deux projets d'origine sont dans `oldversions/` :
- `oldversions/IHEMCPEXEGOL/` — IHE original (Python/FastAPI + React)
- `oldversions/opencode-exegol/` — Fork OpenCode avec agents pentest (TypeScript monorepo)

Consulter ces projets pour le code de référence mais NE PAS les modifier.
