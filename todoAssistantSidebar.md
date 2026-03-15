# TODO — Assistant Sidebar & Chat Refacto

## Priorité 1 — Stabiliser (bugs critiques)

- [ ] **Fix null check abort handler** — `ChatPanel.tsx:705-717` : `msg?.parts` peut être undefined si le streaming n'a jamais généré de parts. Ajouter `msg?.parts ?? []`
- [ ] **Fix SSEParser catch silencieux** — `SSEParser.ts:28-30` : le `catch {}` vide avale les events SSE malformés. Logger l'erreur + émettre un event fallback
- [ ] **Fix doom loop resetOnText** — `toolResilience.ts:320-324` + `index.ts:331,457` : `resetOnText()` reset le compteur sur n'importe quel text-delta, même 1 caractère. Ne reset que si text > 5 chars
- [ ] **Fix resetOnSuccess manquant** — `index.ts:353-361` : ajouter `doomTracker.resetOnSuccess()` après ligne 360 dans le warn du buffer initial
- [ ] **Fix MCP tools hors budget** — `chat/index.ts:145-147` : les MCP tools sont ajoutés après le calcul de budget. Les inclure avant le culling
- [ ] **Fix readOnlyTools pas synchronisé** — `chat/index.ts:110` : générer `readOnlyTools` comme filtre runtime de `allTools` au lieu de le hardcoder séparément
- [ ] **Fix updateFromHeader sans try-catch** — `ChatPanel.tsx:541-543` : wrap `updateFromHeader()` dans un try-catch pour éviter corruption store
- [ ] **Fix compaction pas validée** — `ChatPanel.tsx:318-336` : valider la réponse compaction avec Zod avant de remplacer les messages
- [ ] **Fix images perdues silencieusement** — `ChatPanel.tsx:158-175` : si aucun message user n'existe, warn l'utilisateur au lieu de drop les images
- [ ] **Ajouter timeout fetch chat** — ChatPanel : ajouter AbortController avec timeout 60s sur le fetch `/api/chat`

## Priorité 2 — Découper ChatPanel.tsx (47KB → hooks modulaires)

ChatPanel.tsx est un monolithe de 47KB. Extraire en hooks dédiés :

- [ ] **`useChatStreaming()`** — Toute la logique SSE : fetch `/api/chat`, SSEParser, retry avec backoff, abort handling, message part updates, usage tracking
- [ ] **`useChatInput()`** — Slash commands (`/scan`, `/think`, `/compact`, `/undo`, `/model`), @mentions (terminals, files), input state, history navigation (ArrowUp/Down), dedup window
- [ ] **`useChatApprovals()`** — Command approval + tool approval flow, PermissionBanner rendering logic, approval mode switching (ask/auto-run/allow-all)
- [ ] **`useMessageProcessor()`** — Pipeline de preprocessing avant render : combine tool sequences → filter internal → group low-stakes tools → prepare display parts
- [ ] **ChatPanel.tsx** ne garde que le JSX de render + orchestration des hooks

## Priorité 3 — Performance

- [ ] **Ajouter react-virtuoso** — Remplacer le scroll natif du message list par `<Virtuoso>` pour gérer des centaines de messages sans lag
- [ ] **React.memo + deepEqual sur MessageBubble** — Éviter les re-renders inutiles (comme le `ChatRow` de Cline avec deepEqual comparator)
- [ ] **Lazy load shiki** — Le syntax highlighter dans FileApprovalBanner est déjà lazy mais vérifier que le bundle initial ne l'inclut pas
- [ ] **Lazy load Monaco** — S'assurer que Monaco n'est chargé que quand on ouvre un fichier, pas au boot
- [ ] **useSize() hook** — Implémenter un hook de height tracking (pattern Cline) pour un auto-scroll plus fiable que le useAutoScroll actuel

## Priorité 4 — Vrais modes d'agent (remplace le faux "Agents" actuel)

### Problème actuel
La sidebar affiche "Agents" et "New Agent" mais ce sont juste des sessions de chat. `AgentId = "build"` est hardcodé. Le paramètre `mode` existe côté serveur mais n'est jamais exposé dans l'UI. Il faut de vrais modes qui changent le comportement de l'IA.

### Les 3 modes

#### Mode CTF (couleur : cyan `#22d3ee`, icône : flag/puzzle)
- **Mentalité** : solveur. Jeopardy (web, crypto, pwn, forensics, reverse, misc) ou box fullpwn (HTB, THM, root-me)
- **System prompt** : orienté résolution rapide, créativité, essai-erreur, pas peur de brute-force ou de tenter des trucs
- **Comportement** :
  - Moins strict : pas besoin de rester "in scope", pas de méthodologie formelle
  - Encourage l'exploration agressive (enum, fuzzing, bruteforce léger)
  - Propose des one-liners et des tricks CTF classiques
  - Reconnaît les patterns CTF courants (flag format, challenges types)
  - Pas de logging formel, pas de rapport — on veut le flag
- **Tools** : tous les tools disponibles, auto-run plus permissif
- **Approval** : mode "auto-run" par défaut (sauf commandes destructives évidentes)

#### Mode Audit (couleur : orange `#f59e0b`, icône : shield-check)
- **Mentalité** : pentester senior, pro, méthodique
- **System prompt** : orienté méthodologie (OWASP, PTES, OSSTMM), scope strict, logging systématique
- **Comportement** :
  - Reste in-scope : ne scan/attaque que ce qui est dans le périmètre défini
  - Demande confirmation avant toute action potentiellement destructive ou bruyante
  - Log chaque action avec timestamp, outil, résultat (pour le rapport final)
  - Suit une méthodologie structurée : recon passive → recon active → enum → vuln scan → exploitation → post-exploitation → reporting
  - Propose des findings structurés : CVSS, severity, evidence, remediation
  - Prévient si une action pourrait être détectée (IDS/WAF) ou causer un déni de service
  - Ne fait jamais d'actions destructives sans autorisation explicite
- **Tools** : tous les tools mais avec approval systématique sur les write/exec
- **Approval** : mode "ask" par défaut, chaque commande montrée avec explication + risques avant exécution
- **Extras** :
  - Findings panel activé et alimenté automatiquement
  - Rappels périodiques de documenter les découvertes
  - Export rapport en fin de session

#### Mode Neutre (couleur : gris `#9ca3af`, icône : terminal)
- **Mentalité** : assistant général, pas de directives particulières de sécurité
- **System prompt** : minimal, pas de persona pentest forcée
- **Comportement** :
  - L'IA est un assistant Exegol générique
  - Pas de méthodologie imposée
  - Pas de logging automatique
  - Répond aux questions, exécute les commandes, sans biais offensif ou défensif
  - Utile pour : admin système, scripting, exploration d'outils, apprentissage
- **Tools** : tous les tools disponibles
- **Approval** : mode "ask" par défaut (standard)

### Implémentation

- [x] **Remplacer `AgentId = "build"`** par `AgentMode = "ctf" | "audit" | "neutral"` dans `settingsTypes.ts` — avec `AGENT_MODES` catalog (label, description, color, icon, defaultApproval)
- [x] **Créer le sélecteur de mode** dans le ChatSidePanel header — bouton avec icône + couleur du mode actif, dropdown pour changer avec descriptions
- [x] **Connecter `agentMode` au fetch `/api/chat`** — Passé dans le body du POST, reçu côté serveur dans `chat/index.ts` et `contextRoute.ts`
- [x] **Adapter `systemPrompt.ts`** — 3 system prompts distincts : CTF (agressif, créatif, flag-oriented), Audit (méthodologie, scope, approval, logging, CVSS), Neutre (pas de directives)
- [x] **Adapter le prompt adaptatif** — `prompt.ts` injecte les instructions agent mode dans les 3 tiers (minimal, medium, full)
- [ ] **Adapter les tools par mode** — CTF : tous + auto-run. Audit : tous + ask systématique. Neutre : tous + ask default
- [ ] **Adapter l'approval default par mode** — Stocker le mode d'approval par défaut dans settings, changé automatiquement quand on switch de mode
- [x] **Renommer "Agents" → "Sessions"** dans ChatSidePanel et "New Agent" → "New Chat"
- [x] **Afficher le mode actif** dans le chat header avec couleur + icône pour que l'utilisateur sache toujours dans quel mode il est
- [x] **Persister le mode par projet** — `agentModeByProject` dans settings store, persisté dans localStorage

## Priorité 5 — Patterns Cline à implémenter (nice-to-have)

- [ ] **Message preprocessing pipeline** — Créer un pipeline `combineCommandSequences → filterInternal → groupLowStakes → prepare` avant render (comme les 7 étapes de Cline)
- [ ] **Height tracking auto-scroll** — `useSize()` hook pour détecter les changements de hauteur des messages et ajuster le scroll (meilleur que scroll brut)
- [ ] **Fix gradient scroll seuils** — `MessageBubble.tsx:176-182` : remplacer `> 1` par `> 4` et `< scrollHeight - 1` par `< scrollHeight - 4` pour éviter le flickering
- [ ] **Fix reasoning block scroll timing** — `MessageBubble.tsx:184-190` : ajouter ResizeObserver ou post-render delay pour le scroll des longs reasoning blocks expandés
- [ ] **Tool group icon déterministe** — `ToolCallCard.tsx:324-329` : ajouter un ordre de priorité explicite pour les icons quand il y a un tie entre types de tools

## Notes

### Catches silencieux à nettoyer (pendant les fixes P1)
- `ChatPanel.tsx:251` — fetch drag-drop image
- `ChatPanel.tsx:286` — auto-title fetch
- `ChatPanel.tsx:339` — compaction error
- `ws.ts:90` — WebSocket handler exceptions
- `chat/index.ts:95` — terminal context fetch

### Architecture à ne PAS changer
- Les 12 Zustand stores sont bien structurés, pas besoin de passer à React Context
- SSE streaming via `/api/chat` est le bon choix (pas besoin de passer à WebSocket pour le chat)
- Le provider registry avec cache LRU fonctionne bien
- Le layout system avec persistence localStorage est solide
