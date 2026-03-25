# Exegol IHE — Chat System Audit & Improvement Plan

> **Date** : 2026-03-25
> **Scope** : Audit complet du systeme de chat IA + plan d'amelioration long terme
> **Reference** : Cursor comme benchmark UX/AI, adapte au pentest terminal-first

---

## Table of Contents

1. [AXE 1 — Audit de la logique actuelle](#axe-1--audit-de-la-logique-actuelle)
2. [AXE 2 — Reverse Engineering Cursor Chat](#axe-2--reverse-engineering-cursor-chat--mapping-exegol-ihe)
3. [AXE 3 — UX/UI du chat pense pentest](#axe-3--uxui-du-chat-pense-pentest)
4. [AXE 4 — Context Management & AI Integration](#axe-4--context-management--ai-integration)
5. [AXE 5 — Scaling & Architecture long terme](#axe-5--scaling--architecture-long-terme)
6. [AXE 6 — Plan d'amelioration priorise](#axe-6--plan-damelioration-priorise)
7. [Business Logic Document](#7-business-logic-document)
8. [Component Spec : ChatPanel](#8-component-spec--chatpanel-cible)

---

## AXE 1 — Audit de la logique actuelle

### Solide — A preserver

**Container-scoped execution model**
`dockerExec()` centralise dans `ai/tool/exec.ts`, validation regex stricte, `PROTECTED_ROOTS`, pas de `sh -c "$command"` — array args partout. Le sandboxing est solide.

**Tool Registry pattern**
`registry.ts` comme source de verite unique pour les metadata tools. `readOnlyTools` genere dynamiquement. `withApproval()` factory propre. Architecture extensible sans duplication.

**Adaptive system prompt (3 tiers)**
Minimal/Medium/Full base sur la context window reelle du modele. Un Llama 8B local ne recoit pas le meme prompt qu'un Claude 200K. Smart.

**Doom loop detection (Cline-style)**
3 niveaux d'escalade, exemptions pour les tools de polling (`terminal_read`), seuils ajustes par type de tool. Reset seulement sur succes, pas sur tentative. Bien pense.

**Provider transform middleware**
15+ providers normalises (ID sanitization Mistral, schema sanitization Google, cache hints Anthropic). L'abstraction `withProviderTransforms()` isole la complexite.

**SSE buffered error detection**
Le pattern "accumulate events before committing to stream" permet de renvoyer une erreur HTTP propre si le provider echoue avant le premier token. Evite les streams SSE fantomes.

**Fuzzy replace engine (9 niveaux)**
Pour un IDE terminal-first, le copier-coller depuis un terminal ANSI est courant. Le matcher indentation-flexible + escape-normalized est exactement ce qu'il faut.

---

### A ameliorer

**Compaction summary structure trop rigide**
Le format "Goal/Instructions/Discoveries/Accomplished/Active Context" est correct mais la section **Discoveries** est critique en pentest (IPs, creds, ports, vulns). Risque : un LLM cheap oublie des creds trouves 30 messages plus tot.

> *Fix* : Injecter un "mission state" structure (JSON) dans le prompt de compaction, pas juste du free-form. Les discoveries devraient etre extraites par regex ou tool call results, pas par summarization.

**Token estimation a 4 chars/token**
Acceptable pour l'estimation pre-send, mais sous-estime les outputs terminal (nmap a beaucoup de ponctuation et d'IP = plus de tokens). La heuristique est safe (pruning declenche plus tot) mais pourrait mener a des compactions prematurees avec des modeles > 128K.

> *Fix* : Utiliser `tiktoken` ou un estimateur base sur le reel `usage` du dernier tour (ratio chars/tokens mesure).

**MCP tool namespace collision**
`{ ...tools, ...mcpTools }` — un MCP tool nomme `file_read` ecraserait silencieusement le builtin.

> *Fix* : Prefixer les MCP tools avec `mcp_<serverName>_` ou verifier les collisions au merge.

**contextRoute.ts `pruneNeeded: false` hardcode**
L'endpoint `/api/context` retourne toujours `pruneNeeded: false`. Le frontend ne peut pas savoir s'il doit declencher la compaction proactivement.

> *Fix* : Calculer la vraie valeur depuis le budget.

**Tool output truncation silencieuse**
`MAX_TOOL_OUTPUT = 3000 chars`. Un `nmap -sV` sur un /24 fait facilement 10K chars. L'IA voit `[... truncated 7000 chars]` mais l'utilisateur ne sait pas que l'IA a perdu 70% de l'output.

> *Fix* : Notifier l'UI quand un tool output est tronque (event SSE `tool-truncated`), proposer "View full output in terminal".

**Approval timeout de 120s sans recovery**
Si l'utilisateur est AFK pendant une chaine de tools, le timeout fire et l'IA recoit `"rejected"`. Pas de retry, pas de pause-resume.

> *Fix* : Implementer un `pause` state qui gele le stream au lieu de rejeter. L'utilisateur revient, approve, le stream reprend.

**`MAX_MESSAGES_PER_SESSION = 100` est tres bas**
Une session CTF active peut generer 100+ echanges en 2h. A 100, les vieux messages sont purges du store mais la compaction LLM n'est pas forcee.

> *Fix* : Soit augmenter (200-300), soit coupler la limite au mecanisme de compaction (compacter automatiquement quand >80 messages).

---

### Problemes reels

**Tension CTF auto-run + web_fetch sans sandbox reseau**
En mode CTF, `defaultApproval: "auto-run"`. L'IA peut appeler `web_fetch` avec n'importe quelle URL. La protection SSRF bloque les IPs privees, mais :
- Un C2 callback URL externe passe
- Un exfil de donnees du container vers un endpoint externe passe
- L'IA "creative" en mode CTF pourrait decider de `web_fetch` un payload depuis un serveur malveillant

> *Impact* : Exfiltration de donnees depuis le container vers Internet. Meme dans un lab ephemere, c'est dangereux si le container a des creds reels.

> *Fix* : En mode CTF auto-run, les web tools (`web_fetch`, `web_search`) doivent rester en `ask`. Seuls les terminal/file tools devraient etre auto-run. Creer une matrice `tool x mode -> approval` explicite.

**localStorage corruption = perte totale de sessions**
Un seul `JSON.parse()` qui fail sur le blob localStorage = toutes les sessions, settings, layouts perdus. Zustand persist n'a pas de recovery.

> *Impact* : L'utilisateur perd tout son historique de mission, ses findings, ses creds.

> *Fix* :
> 1. Separer les stores critiques (sessions -> `session-store`, settings -> `settings-store`) en cles localStorage distinctes
> 2. Ajouter un try/catch + fallback sur le `deserialize` Zustand
> 3. Backup periodique de `session-store` dans une 2eme cle (double-buffer)

**Pas de rate-limit sur les tool calls cote AI SDK**
Le doom loop detecte les *identical* tool calls, mais pas le volume. Un LLM qui appelle 50 tools differents en boucle (chacun unique) n'est jamais stoppe. Avec `batch(max: 25)`, ca fait 25 tools/tour x N tours.

> *Impact* : Un modele hallucinant peut saturer le container Docker.

> *Fix* : Hard cap de tool calls par stream (ex: 100 total, 30 par etape). Au-dela, abort avec message.

**Ring buffer de 1000 lignes insuffisant pour de l'output pentest**
Un `nmap -sV -sC` sur un /24 genere 5000+ lignes. `gobuster dir` avec une grosse wordlist encore plus. L'IA ne voit que les 1000 dernieres lignes via `terminal_read`.

> *Impact* : L'IA rate des resultats critiques (ports ouverts, sous-domaines trouves) qui ont scrolle hors du buffer.

> *Fix* :
> 1. Augmenter a 5000 lignes (memoire negligeable pour du texte strippe ANSI)
> 2. Ajouter un `terminal_search` tool qui grep dans le ring buffer complet
> 3. Pour les scans longs, recommander via system prompt de rediriger vers un fichier (`> /tmp/scan.txt`)

---

## AXE 2 — Reverse Engineering Cursor Chat -> Mapping Exegol IHE

### 2.1 Layout du chat panel

**Cursor** : Sidebar droite resizable (300-600px). Composer en bas avec mention pills. Message list scrollable. Context pills (fichiers, selection) au-dessus du composer.

**Exegol IHE actuel** : `ChatSidePanel.tsx` avec session tabs + `ChatPanel.tsx`. ControlBar en bas (model picker, agent mode). Input textarea avec slash/@ popovers.

| Cursor Feature | Exegol IHE Equivalent | Gap |
|---|---|---|
| Context pills (fichiers) | `@mentions` dans chatCommands.tsx | Pas de pills visuels, juste insertion texte |
| Terminal selection context | `<terminal>` XML blocks dans message | Fonctionnel mais UX brute |
| File reference pills | `@file` mention | Pas de preview inline |
| Image paste | `ChatContextStore.images` + paste handler | Implemente |
| Multi-file context | Quotes store (terminal + file) | Fonctionnel |

**Recommandation** : Ajouter des **context pills visuels** au-dessus du textarea. Chaque `@terminal` ou `@file` devient un chip cliquable avec preview tooltip, supprimable avec x.

### 2.2 Les 3 surfaces Cursor

**Cursor** :
1. **Inline edit** (Ctrl+K) : edition directe dans le code avec diff inline
2. **Chat sidebar** : conversation longue, contexte riche
3. **Agent mode** (Composer) : execution autonome multi-step

**Exegol IHE** : Une seule surface — le chat sidebar. Mais les 3 **agent modes** (CTF/Audit/Neutral) changent le *comportement*, pas la *surface*.

- Inline edit -> **Non applicable** (terminal-first, pas code-first). L'equivalent serait "quick command" : l'IA propose une commande inline dans le terminal, Tab pour accepter
- Chat sidebar -> **Chat panel** (en place)
- Agent mode -> **Modes CTF/Audit** (approche differente mais adaptee)

**Recommandation** : Le "quick command" (ghost text dans le terminal avec Tab to accept) serait le killer feature terminal-first equivalent a l'inline edit Cursor. Phase 3 feature.

### 2.3 Tool calls en cours

**Cursor** : Spinner minimal, texte "Editing file.ts...", resultat collapsable, status pill (Applied/Failed).

**Exegol IHE actuel** : `ToolCallCard.tsx` avec status dot (pulsing green/static green/red). `ToolCallGroup` pour les groupes Cline-style. Output inline (max 15 lignes).

| Cursor | Exegol IHE | Verdict |
|---|---|---|
| Spinner on active tool | Pulsing green dot | OK |
| Collapsible result | Expand/collapse output | OK |
| Progress text | Tool name + args summary | Pas de progress % |
| Batch progress | ToolCallGroup avec count | OK |
| Duration | Shown on completion | OK |

**Recommandation** : Ajouter un **progress indicator** pour les long-running tools (nmap, gobuster). Le server pourrait envoyer des `tool-progress` SSE events bases sur le ring buffer (nombre de lignes produites).

### 2.4 Diff inline pour file writes

**Cursor** : Diff integre dans l'editeur avec accept/reject par hunk. Keybinds : Ctrl+Shift+Y (accept), Ctrl+Shift+N (reject). Coloration verte/rouge dans le gutter.

**Exegol IHE actuel** : `FileApprovalBanner.tsx` — diff Shiki-highlighted, stats bar (+/-), approve/deny par fichier, batch approve/deny.

**Gap critique** : Pas de review par hunk. Un `file_write` de 200 lignes est tout-ou-rien.

**Recommandation** : Pour un pentest tool, le review par hunk est moins critique que pour du code (les fichiers edites sont surtout des configs et des rapports). Mais ajouter un **"Edit before approve"** serait tres utile — l'utilisateur modifie le contenu propose avant d'accepter.

### 2.5 Context management (@ mentions)

**Cursor** : `@file`, `@folder`, `@codebase`, `@web`, `@docs`, `@git`. Chaque mention injecte du contexte specifique.

**Exegol IHE actuel** : `@terminal:<id>`, `@file:<path>`, `@url`. Dynamique depuis les stores terminal/file.

**Gap** : Pas de `@container` (injecter l'etat d'un container), `@findings` (injecter les findings exegol-history), `@scope` (injecter le scope Caido).

**Recommandation** : Ajouter `@container`, `@findings`, `@scope`, `@creds` comme mentions specialisees pentest.

### 2.6 Message history UX

**Cursor** : Retry (regenere la reponse), Edit (modifie le message et relance), Branch (fork la conversation).

**Exegol IHE actuel** :
- `undoLastExchange()` (remove last user+assistant) en place
- `forkSession()` (copy messages up to a point) en place
- Retry button sur hover en place
- **Edit message** : callback present dans MessageBubble mais **pas d'UI d'edition**

**Recommandation** : Implementer l'edit inline (cliquer sur son message -> textarea -> resend). La fork est deja la, il manque juste l'UI.

### 2.7 Status bar d'agent

**Cursor** : Barre en bas avec steps count, tokens used, cancel button, model name.

**Exegol IHE actuel** : `StatusBar.tsx` (terminals count, findings, tokens) + `ControlBar.tsx` (context indicator colore avec tooltip).

**Gap** : Pas de step counter pendant le streaming. Pas de duree ecoulee temps reel.

**Recommandation** : Pendant le streaming, afficher dans le ControlBar : `Step 3/? - 1.2K tokens - 12s - [Cancel]`.

### 2.8 Micro-interactions addictives

**Cursor** : Ghost text (Tab to accept), smooth animations, sound feedback, inline suggestions.

**Exegol IHE actuel** : Sound system (`sound.ts`), keyboard shortcuts (Y/A/N), auto-scroll smart. Pas de ghost text.

**Recommandation** : Le ghost text terminal (commande suggeree dans le prompt, Tab to accept) serait le pendant pentest du ghost text code. Phase 3.

---

## AXE 3 — UX/UI du chat pense pentest

### 3.1 Affichage des tool calls terminal

**Probleme actuel** : `TerminalCommandCard` affiche max 15 lignes, avec status dot et duree. Pour un pentester, il manque :
- Le **timing par commande** (combien de temps entre l'envoi et le resultat)
- La **severite du resultat** (port ouvert = interessant, erreur = info)
- Le **lien vers le terminal** pour voir l'output complet

**Recommandation** :
```
+-- terminal_write on "nmap-scan" (exegol-lab)          timer 34s  .
|  $ nmap -sV -sC 10.10.10.1
|  -----------------------------------------------
|  PORT    STATE SERVICE  VERSION
|  22/tcp  open  ssh      OpenSSH 8.9
|  80/tcp  open  http     Apache 2.4.52
|  443/tcp open  ssl/http Apache 2.4.52
|  ... 12 more lines
|  [View full output in terminal ->]  [Copy output]
+---------------------------------------------------------------
```
- Status dot colore : vert (exit 0), rouge (exit non-0), pulsing (running)
- Bouton "View in terminal" qui focus le terminal source
- Output collapsable avec smart truncation (montre debut + fin)

### 3.2 Approval banner UX

**Recommandation pour l'approval banner** :

```
+==============================================================+
| AI wants to execute on "exegol-lab"                          |
|                                                              |
|   $ sqlmap -u "http://target/page?id=1" --dbs --batch       |
|                                                              |
|   Warning Audit mode: This is an active scan that may        |
|   trigger IDS/WAF alerts                                     |
|                                                              |
|   [Y] Allow   [A] Always   [E] Edit   [N] Deny    +2 more   |
+==============================================================+
```

Nouveautes par rapport a l'actuel :
1. **[E] Edit** — modifier la commande avant execution (ajouter `--proxy`, changer le target)
2. **Warning contextuel** en mode Audit (detection IDS/WAF basee sur le tool name : sqlmap, nmap -sS, hydra)
3. **Indicateur de queue** : "+2 more" quand plusieurs commands pending
4. **Container visible** : sur quel container la commande va s'executer

### 3.3 Diff file write adapte pentest

Les fichiers typiques en pentest :
- **Rapports markdown** (findings, remediation)
- **Configs** (proxychains.conf, /etc/hosts, Burp configs)
- **Scripts** (Python exploits, bash one-liners)
- **Wordlists** (custom, ajout d'entries)

**Recommandation** : Garder le diff Shiki actuel mais ajouter :
1. **Syntax detection** pour `.conf`, `.ini`, `.toml` (configs pentest)
2. **"Append mode"** visuel quand le diff est juste un ajout en fin de fichier (cas commun : ajouter un host a `/etc/hosts`)
3. **Template shortcuts** : "Save as finding" pour les rapports (extrait le diff dans un template CVSS)

### 3.4 Visualisation du thinking

**Recommandation** :
```
+-- Thinking (2.1K tokens, 8s) -------------------- [Collapse]
|  The target appears to be running Apache 2.4.52 which is
|  vulnerable to CVE-2021-41773. I should:
|  1. Verify the version precisely with a banner grab
|  2. Check if mod_cgi is enabled
|  3. Try the path traversal exploit
|  ...
|  [Search in thinking]
+----------------------------------------------------------
```
- Shimmer pendant le streaming (deja implemente)
- Token count + duree dans le header
- **Search in thinking** pour retrouver un raisonnement dans les longues chaines
- En mode CTF, le thinking devrait etre auto-collapsed (on veut le resultat, pas le raisonnement)
- En mode Audit, le thinking est precieux (justification des actions) -> auto-expanded

### 3.5 Switch de mode mid-conversation

**Risque actuel** : Changer de mode CTF->Audit mid-conversation modifie le system prompt du prochain message, mais l'historique contient des messages "agressifs" du mode CTF. L'IA pourrait etre confuse.

**Recommandation** :
1. Injecter un **system message** dans l'historique au moment du switch : `"[Mode switched from CTF to Audit. All subsequent actions must follow Audit methodology.]"`
2. Le `ControlBar` affiche un **badge de confirmation** : "Switched to Audit mode" (toast ephemere)
3. Les messages avant le switch gardent un **badge visuel** du mode actif au moment de l'envoi

### 3.6 Contexte de mission

**Probleme** : L'IA ne sait pas sur quel container elle travaille a un moment donne. `containerIds` est passe dans le request body, mais si l'utilisateur a 3 containers, l'IA doit deviner lequel est le bon.

**Recommandation** :
1. **Active container indicator** dans le ControlBar (a cote du model picker)
2. L'`activeTerminalId` envoye dans le body determine le container actif
3. Le system prompt dit explicitement : `"You are currently focused on container <name>. Terminal <id> is active."`
4. **Mission context block** persistant (pas dans les messages, dans le system prompt) :
   ```
   MISSION CONTEXT:
   - Target: 10.10.10.1 (HTB - Shoppy)
   - Found: SSH (22), HTTP (80), Node.js
   - Creds: admin:admin (Mattermost), jaeger:Sh0ppyBest@pp! (SSH)
   - Current objective: Privilege escalation
   ```
   Alimente automatiquement par les `exh_add_cred` et `exh_add_host` calls.

### 3.7 Batch tool display

**Probleme** : Le `batch` tool peut lancer 25 tools en parallele. Afficher 25 ToolCallCards cree du chaos visuel.

**Recommandation** :
```
+-- Batch operation (25 tools) -------------- timer 12s  ####..
|  18 completed  5 running  2 failed
|
|  > terminal_write x 8     [4 ok 3 running 1 error]
|  > file_read x 10         [10 ok]
|  > search_grep x 5        [4 ok 1 running]
|  > web_fetch x 2          [0 ok 1 running 1 error]
|
|  [Expand all]  [Show errors only]
+---------------------------------------------------------------
```
- Progress bar en haut
- Groupe par type de tool
- Status counts par groupe
- Expand pour voir le detail
- Filtre "errors only" pour le triage

### 3.8 Distinction visuelle des 3 modes

| Element | CTF (#22d3ee) | Audit (#f59e0b) | Neutral (#9ca3af) |
|---------|-------------|----------------|-------------------|
| ControlBar badge | `[CTF]` cyan bg | `[AUDIT]` orange bg | `[NEUTRAL]` gray bg |
| Message bubble border | Left border cyan 2px | Left border orange 2px | No border |
| Tool call card accent | Cyan status dot | Orange status dot | Gray status dot |
| Thinking block | Auto-collapsed | Auto-expanded | Auto-collapsed |
| Approval banner | Hidden (auto-run) | Prominent + warning | Standard |

### 3.9 Raccourcis clavier pentest

| Shortcut | Action | Context |
|----------|--------|---------|
| `Y` | Approve command | Approval banner visible |
| `A` | Always allow tool | Approval banner visible |
| `N` | Deny command | Approval banner visible |
| `E` | Edit command before run | Approval banner visible |
| `Ctrl+Enter` | Send message | Chat input focused |
| `Ctrl+Shift+Y` | Toggle YOLO mode | Global |
| `Ctrl+Shift+M` | Cycle agent mode | Global |
| `Escape` | Cancel streaming | During AI response |
| `Ctrl+L` | Clear chat | Chat focused |
| `Ctrl+Shift+T` | New terminal on active container | Global |

---

## AXE 4 — Context Management & AI Integration

### 4.1 Les 3 tiers sont-ils bien calibres ?

| Tier | Window | Max Tools | Terminal Lines | Verdict |
|------|--------|-----------|---------------|---------|
| Minimal | <=8K | 5 | 30 | Correct pour des 4K-8K models locaux |
| Medium | 8-32K | 12 | 60 | Trop conservateur pour 32K — pourrait monter a 18 tools |
| Full | >32K | 99 | 100 | 100 lignes terminal insuffisant pour un pentest actif |

**Recommandations** :
- Medium tier : monter a 18 tools et 80 lignes terminal
- Full tier : monter a 200 lignes terminal (un nmap verbeux a besoin de contexte)
- Ajouter un **tier "Extended"** pour les modeles >128K : 300 lignes terminal, mission context complet, historique tools detaille

### 4.2 Pruning a 70% + Compaction a 85%

**Risque** : Un pentest est une mission sequentielle. Pruner les vieux messages supprime le contexte de reconnaissance initial. L'IA oublie que le port 8080 est ouvert si ca a ete decouvert il y a 50 messages.

**Recommandation** :
1. **Never-prune tags** : Les messages contenant des creds, IPs, ports, vulns devraient etre marques `critical: true` et jamais prunes
2. **Compaction with extraction** : Avant de compacter, extraire automatiquement les "findings" (regex sur le contenu des tool results : IP patterns, port patterns, "password:", "flag{") et les stocker dans un `missionState` separe
3. **Mission state injection** : Le `missionState` est injecte dans le system prompt (pas dans les messages), donc il survit a toute compaction
4. **Compaction preview** : Montrer a l'utilisateur ce qui va etre compacte avant de le faire (dans un toast expandable)

### 4.3 Mission context persistant

**Architecture proposee** :

```typescript
interface MissionState {
  targets: Array<{ ip: string; hostname?: string; notes: string }>;
  ports: Array<{ target: string; port: number; service: string; version?: string }>;
  credentials: Array<{ username: string; password: string; service: string; source: string }>;
  vulnerabilities: Array<{ target: string; cve?: string; description: string; severity: string }>;
  flags: string[];
  scope: { includes: string[]; excludes: string[] };
  notes: string[];
}
```

**Alimentation** :
- Auto-extraction depuis les `exh_add_cred`, `exh_add_host` calls (deja structure)
- Parsing regex des tool results (nmap output -> ports, hydra output -> creds)
- Manuel via un tool `mission_update` dedie

**Injection** :
- Serialise en ~200-500 tokens dans le system prompt
- Toujours present, jamais prune ni compacte
- Mis a jour a chaque tour de chat

### 4.4 Terminal : temps reel vs snapshot

**Actuel** : L'IA recoit un snapshot du terminal au moment du `terminal_read` call. Pas de streaming temps reel vers l'IA.

**Recommandation** :
1. **Snapshot est correct** pour l'architecture actuelle (pas de streaming vers l'IA)
2. Ajouter un **auto-context terminal** : les 20 dernieres lignes du terminal actif sont automatiquement incluses dans le system prompt (pas besoin de `terminal_read` explicite)
3. **Terminal change notification** : quand un terminal produit un output significatif (>5 lignes) pendant que l'IA reflechit, injecter un signal dans le stream : `"[Terminal <name> has new output -- consider reading it]"`

### 4.5 Multi-container

**Probleme actuel** : `containerIds` est un array, mais le system prompt ne dit pas clairement quel container est le focus.

**Recommandation** :
1. Le terminal actif (`activeTerminalId`) determine le container actif
2. System prompt explicite : `"Active container: <name> (via terminal <id>). Other containers available: [...]"`
3. Le tool `terminal_write` doit logguer le container cible dans le tool result visible
4. En cas d'ambiguite (user mentionne un container different), l'IA doit confirmer avant d'agir

### 4.6 Les 27 tools — analyse

**Tools existants bien organises par categorie.** Manques identifies :

| Tool manquant | Categorie | Justification |
|---|---|---|
| `terminal_search` | terminal | Grep dans le ring buffer (vs. relire 1000 lignes) |
| `mission_update` | workflow | Ajouter des findings au mission state structure |
| `mission_read` | workflow | Lire le mission state actuel |
| `screenshot` | integration | Screenshot d'un web tool (desktop VNC) |
| `file_download` | file | Extraire un fichier du container vers l'host (pour rapport) |
| `http_request` | web | curl-like direct depuis le container (vs. web_fetch depuis l'host) |

**Tools existants a revoir** :
- `batch` : Le max de 25 est correct mais il manque un **priority ordering** (les tools critiques d'abord)
- `todo_read`/`todo_write` : Redondant avec le mission state propose. Fusionner.

### 4.7 Thinking/reasoning automatique

| Trigger | Effort | Raison |
|---------|--------|--------|
| User message > 200 chars | medium | Question complexe |
| Message contient "why", "explain", "analyze" | medium | Demande de raisonnement |
| Mode "plan" | medium | Deja implemente |
| Mode "deep" | high | Deja implemente |
| Apres 2+ tool errors consecutifs | high | L'IA doit reflechir a une nouvelle approche |
| Demande de privesc/lateral movement | high | Raisonnement multi-step requis |
| Message simple (< 50 chars, pas de "?") | off | Commande directe, pas besoin de reflechir |

---

## AXE 5 — Scaling & Architecture long terme

### 5.1 localStorage — limites reelles

**Mesures** :
- Limite browser : 5-10MB par origin (Chrome: 5MB, Firefox: 5MB, Safari: 5MB)
- Une session de 100 messages avec tool outputs ~ 200-500KB
- Avec 50 sessions max (config actuelle) : 10-25MB -> **depasse la limite**

**Strategie** :

```
Tier 1: Active sessions (localStorage)
  - 10 dernieres sessions
  - Messages complets avec parts et usage
  - ~2-5MB

Tier 2: Archived sessions (IndexedDB)
  - Sessions 11-50
  - Messages complets
  - ~50MB budget (IndexedDB n'a pas de limite stricte)

Tier 3: Exported sessions (filesystem)
  - Export explicite par l'utilisateur
  - JSON/Markdown
  - Pas de limite
```

**Migration path** :
1. Phase 1 : Ajouter `idb-keyval` pour le storage async
2. Phase 2 : Migrer les sessions archivees vers IndexedDB
3. Phase 3 : Lazy-load les vieilles sessions on-demand

### 5.2 Conversation branching

**Architecture Zustand** :

```typescript
interface Message {
  id: string;
  parentId: string | null;  // null = root
  // ... existing fields
}

interface Session {
  // ... existing fields
  messageTree: Record<string, string[]>;  // parentId -> childIds
  activeBranch: string[];                 // Ordered message IDs for current view
}
```

**UX** :
- "Retry" cree un nouveau message assistant avec le meme `parentId` que l'ancien
- "Edit" cree un nouveau message user avec le meme `parentId`
- Branches navigables avec <- -> au-dessus du message forke
- Branch indicator : "Response 2/3 [<- ->]"

### 5.3 Mission sessions

**Structure proposee** :

```typescript
interface Mission {
  id: string;
  name: string;              // "HTB - Shoppy", "Pentest Client X"
  projectId: string;
  createdAt: number;
  missionState: MissionState; // targets, creds, vulns, flags
  sessionIds: string[];       // Chat sessions de cette mission
  containerIds: string[];     // Containers associes
  scope: ScopeConfig;         // IP ranges, domains, exclusions
  agentMode: AgentMode;       // Default mode for this mission
  exportedAt?: number;        // Last export timestamp
}
```

**Lifecycle** :
1. Creer une mission au lancement d'un projet
2. Toutes les sessions appartiennent a une mission
3. Le mission state est partage entre sessions
4. L'export genere le rapport complet

### 5.4 Export formats

| Format | Usage | Contenu |
|--------|-------|---------|
| **Markdown report** | Rapport client | Findings CVSS, remediations, timeline |
| **JSON timeline** | Analyse post-mission | Tous les tool calls avec timestamps |
| **JSONL chat** | Replay/debug | Messages bruts pour re-ingestion |
| **Scope export** | Partage d'engagement | targets + scope + creds (chiffre) |

### 5.5 Multi-session

**Actuel** : `SessionTabs` dans `ChatSidePanel.tsx`. Un seul chat actif, les autres en background.

**Amelioration** :
1. Chaque session a son propre `missionState` snapshot
2. Switch de session ne reset pas les terminals (ils persistent)
3. "Pin" une session pour la garder accessible dans un raccourci

### 5.6 Performance virtualization

**Actuel** : `react-virtuoso` dans ChatPanel — deja gere.

**Ameliorations** :
1. Lazy-render des tool outputs (collapsed par defaut apres 30s)
2. Image thumbnails au lieu de full-size dans le chat
3. Detach des tres longs tool outputs (>50 lignes) vers un viewer separe
4. Compaction visuelle : les messages compactes affichent un resume cliquable

---

## AXE 6 — Plan d'amelioration priorise

### Phase 1 — Quick wins UX (1 semaine)

| # | Feature | Status | Fichiers |
|---|---------|--------|----------|
| 1.1 | Context pills visuels au-dessus du textarea | **DEJA FAIT** (ContextPills.tsx, ContextQuotes.tsx, ImageAttachments.tsx) | — |
| 1.2 | "View in terminal" button sur TerminalCommandCard | **DONE** | ToolCallCard.tsx |
| 1.3 | Edit command before approve (`[E]` key) | **DONE** (backend existait deja, UI ajoutee) | PermissionBanners.tsx, ChatPanel.tsx |
| 1.4 | Step counter pendant streaming (`Step N - Xs - [Cancel]`) | **DONE** | streaming.ts (new), ControlBar.tsx, useChatStreaming.ts |
| 1.5 | Tool output truncation notification | **DONE** | chat/index.ts, useChatStreaming.ts, ToolCallCard.tsx, session.ts |
| 1.6 | Fix `pruneNeeded: false` hardcoded | **DONE** | contextRoute.ts |
| 1.7 | MCP tool namespace prefix | **DEJA FAIT** (mcp/client.ts:138 — `mcp_${id}_${name}`) | — |
| 1.8 | Mode switch system message injection | **DONE** | ControlBar.tsx, MessageBubble.tsx, session.ts, useChatStreaming.ts |

### Phase 2 — Core chat features (2-3 semaines)

| # | Feature | Status | Fichiers |
|---|---------|--------|----------|
| 2.1 | Message edit inline + resend | **DONE** (UserMessageBlock avec edit inline, truncate+resend) | MessageBubble.tsx, ChatPanel.tsx, session.ts |
| 2.2 | Conversation branching (retry = fork) | **DONE** (forkedFrom metadata, retry fork-based) | session.ts, ChatPanel.tsx |
| 2.3 | Approval pause/resume | **DONE** (pause/resume sur les 2 queues, WS schemas) | tool-approval.ts, command-queue.ts, ws.ts |
| 2.4 | Tool x Mode approval matrix | **DONE** (modeOverrides dans registry, shouldRequireApproval) | registry.ts |
| 2.5 | IndexedDB migration pour les sessions archivees | TODO | session.ts (+ idb-keyval) |
| 2.6 | Ring buffer 5000 + `terminal_search` tool | **DONE** (5000 lignes, searchOutput, nouveau tool) | manager.ts, terminal-tools.ts, registry.ts |
| 2.7 | Batch tool progress UI (grouped by type) | **DEJA FAIT** (ToolCallGroup Cline-style) | ToolCallCard.tsx |
| 2.8 | Audit mode warning annotations | **DONE** (DANGEROUS_PATTERNS, ShieldAlert en mode Audit) | PermissionBanners.tsx |

### Phase 3 — Pentest-specific features (1 mois)

| # | Feature | Status | Fichiers |
|---|---------|--------|----------|
| 3.1 | Mission state (auto-extraction + injection prompt) | **DONE** | mission.ts (new), prompt.ts, index.ts |
| 3.2 | `@container`, `@creds`, `@hosts` mentions | **DONE** | chatCommands.tsx |
| 3.3 | Auto-thinking triggers (post-error, complex queries) | **DONE** | reasoning.ts, index.ts |
| 3.4 | Ghost command in terminal (Tab to accept) | **DONE** (v1: ANSI ghost, 3s debounce) | TerminalView.tsx, ws.ts |
| 3.5 | Export rapport Markdown + JSON timeline | SKIPPED (reporte) | — |
| 3.6 | Tool call rate limiting (100/stream) | **DONE** | chat/index.ts |
| 3.7 | Never-prune critical messages (creds, findings) | **DONE** (isPinned + auto-pin) | pruner.ts, session.ts, useChatStreaming.ts |
| 3.8 | Auto-context terminal (fallback to recent) | **DONE** | chat/index.ts |

### Phase 4 — Architecture long terme (roadmap 3-6 mois)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 4.1 | Full IndexedDB storage (sessions, mission state, exports) | 2 sem | Very High |
| 4.2 | Mission object model (mission -> sessions -> findings) | 2 sem | Critical |
| 4.3 | RAG leger sur l'historique de mission (semantic search) | 3 sem | Very High |
| 4.4 | Multi-model orchestration (cheap model for extraction, big model for reasoning) | 2 sem | High |
| 4.5 | Terminal replay (enregistrement + relecture des sessions) | 2 sem | High |
| 4.6 | Plugin system for custom tools (Python scripts, custom integrations) | 3 sem | Very High |

---

## 7. Business Logic Document

### 7.1 Regles metier non negociables

```
RULE-001: Aucune execution sur l'host
  Toute commande passe par `docker exec <container>`.
  `dockerExec()` dans ai/tool/exec.ts est le SEUL point d'execution.
  Violation = faille de securite critique.

RULE-002: Validation container name
  Regex: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
  Pas de caracteres speciaux, pas d'injection.
  Appliquee dans shared/validation.ts, utilisee dans exec.ts.

RULE-003: Protected paths
  /bin, /sbin, /lib*, /usr, /boot, /dev, /proc, /sys, /
  ne peuvent JAMAIS etre supprimes via file_delete.

RULE-004: Approval matrix par mode
  +-------------------+----------+----------+----------+
  | Tool Category     | CTF      | Audit    | Neutral  |
  +-------------------+----------+----------+----------+
  | terminal_read     | auto     | auto     | auto     |
  | terminal_write    | auto-run | ask      | ask      |
  | terminal_create   | auto-run | ask      | ask      |
  | file_read         | auto     | auto     | auto     |
  | file_write/edit   | auto-run | ask+diff | ask+diff |
  | file_delete       | ask      | ask      | ask      |
  | web_search        | ask      | ask      | ask      | <- ALWAYS ASK
  | web_fetch         | ask      | ask      | ask      | <- ALWAYS ASK
  | search_*          | auto     | auto     | auto     |
  | batch             | per-tool | per-tool | per-tool |
  | exh_add_*         | auto-run | ask      | ask      |
  | todo_*            | auto     | auto     | auto     |
  | user_question     | always   | always   | always   |
  +-------------------+----------+----------+----------+

  web_search et web_fetch sont TOUJOURS ask, meme en CTF auto-run.
  Raison: risque d'exfiltration de donnees.

RULE-005: Doom loop hard abort
  Apres 4 tool calls identiques consecutifs -> abort stream.
  Sauf terminal_read/terminal_list (polling exempt).
  Sauf terminal_write/terminal_create (seuil a 8).

RULE-006: Tool output truncation
  MAX_TOOL_OUTPUT = 3000 chars.
  Au-dela: tronque avec "[... truncated X chars]".
  L'IA DOIT etre informee de la troncation.
  L'UI DOIT notifier l'utilisateur si truncation > 50%.

RULE-007: Context compaction preservation
  Les elements suivants DOIVENT survivre a toute compaction:
  - Credentials trouves
  - IPs/ports decouverts
  - Vulnerabilites identifiees
  - Flags captures
  - Scope de mission
  - Instructions utilisateur explicites

RULE-008: Rate limiting
  /api/chat: 5 req / 10s
  Tool calls par stream: 100 max (propose)
  Tool calls par step: 30 max (propose)
  Batch: 25 max (existant)

RULE-009: Session limits
  MAX_PERSISTED_SESSIONS = 50
  MAX_MESSAGES_PER_SESSION = 100
  Au-dela: compaction automatique ou archivage IndexedDB.

RULE-010: No secrets in localStorage
  Les API keys sont dans settings store (localStorage).
  Acceptable car single-user local.
  MAIS: jamais de credentials de mission dans localStorage.
  Les creds de mission vont dans exegol-history (container-side).
```

### 7.2 Machine d'etats du chat system

```
                    +----------+
                    |   IDLE   |<----------------------+
                    +----+-----+                       |
                         | user sends message           |
                         v                             |
                    +----------+                       |
               +--->|STREAMING |                       |
               |    +----+-----+                       |
               |         |                             |
               |    +----+----------+                  |
               |    |               |                  |
               |    v               v                  |
               | +------+   +------------+             |
               | | TEXT  |   | TOOL_CALL  |             |
               | +--+---+   +-----+------+             |
               |    |             |                     |
               |    |      +------+------+              |
               |    |      |             |              |
               |    |      v             v              |
               |    |   +--------+  +-------------+    |
               |    |   |AWAITING|  |TOOL_RUNNING |    |
               |    |   |APPROVAL|  +------+------+    |
               |    |   +---+----+         |           |
               |    |       |              |           |
               |    |   +---+---+          |           |
               |    |   |       |          |           |
               |    |   v       v          |           |
               |    | APPROVED DENIED      |           |
               |    |   |       |          |           |
               |    |   v       |          |           |
               |    | EXECUTE   |          |           |
               |    |   |       |          |           |
               +----+   |       |          |           |
                    +---+-------+----------+           |
                    |                                   |
                    v                                   |
               +----------+                            |
               |TOOL_DONE |---- more tools? --->STREAMING
               +----+-----+                            |
                    | no more tools                     |
                    v                                   |
               +----------+                            |
               | FINISH   |----------------------------+
               +----------+

  Error can occur at any state -> ERROR -> IDLE (with error message)
  User cancel at any state -> CANCELLED -> IDLE (with partial result)

  Special states:
  - PAUSED: approval timeout not reached, user AFK (proposed)
  - DOOM_LOOP: 3+ identical tools -> warning injected -> STREAMING continues
  - DOOM_ABORT: 4+ identical tools -> stream terminated -> IDLE
  - COMPACTING: context >85% -> LLM summarization -> IDLE -> user resends
```

### 7.3 Invariants

```
INV-001: tool.execute() ne peut JAMAIS etre appele sans passer par
         dockerExec() ou un appel HTTP valide (web_fetch SSRF check).

INV-002: Un tool_result ne peut JAMAIS etre envoye au client avant
         l'evenement tool-call correspondant.

INV-003: Le ring buffer ne contient JAMAIS d'escape sequences ANSI.
         stripAnsi() est applique avant insertion.

INV-004: L'ordre des messages envoyes a l'API est toujours
         user -> assistant -> user -> assistant (alternance stricte).
         Les tool results sont des assistant messages.

INV-005: containerIds dans le request body est TOUJOURS non-vide.
         Au moins 1 container doit etre selectionne.

INV-006: Le stream SSE se termine TOUJOURS par un event "done"
         (succes) ou "error" (echec). Jamais de stream abandonne
         sans signal de fin.

INV-007: Les readOnlyTools ne modifient JAMAIS l'etat du container.
         file_read, search_*, terminal_read, terminal_list.

INV-008: Aucun message n'est envoye a l'API sans system prompt.
         buildAdaptivePrompt() est toujours appele.

INV-009: Le mode "plan" utilise EXCLUSIVEMENT readOnlyTools.
         Aucun tool d'ecriture n'est disponible.

INV-010: localStorage persist key est unique par store.
         Pas de collision entre stores Zustand.
```

### 7.4 Decisions de design expliquees

**Pourquoi 3 modes et pas des sub-agents ?**
Les sub-agents necessitent une orchestration complexe (message passing, shared state, conflict resolution). Les 3 modes changent le *comportement* d'un seul agent via le system prompt. Plus simple, plus previsible, et l'utilisateur controle le switch. Un pentester sait quand il passe de la recon a l'exploitation — il n'a pas besoin d'un routeur IA pour decider a sa place.

**Pourquoi le pruning a 70% et pas plus tard ?**
Le pruning est non-destructif (UI garde tout, seul l'envoi API est affecte). A 70%, on a encore 30% de marge pour une reponse longue avec tool calls. Attendre plus longtemps risque un "context overflow" mid-stream qui abort la reponse. 70% est le sweet spot entre contexte riche et marge de securite.

**Pourquoi la compaction a 85% et pas la pruning seule ?**
Le pruning remplace les messages par des placeholders — l'IA perd le contexte. La compaction produit un resume intelligent qui preserve les informations cles. C'est plus couteux (un appel LLM) mais preserve les findings critiques. Les deux mecanismes sont complementaires : prune d'abord (cheap), compact ensuite (expensive).

**Pourquoi `withApproval()` factory et pas un middleware ?**
Un middleware s'applique a tous les tools uniformement. La factory permet un wrapping granulaire par tool : `file_write` calcule un diff, `terminal_write` passe par la command queue, `web_fetch` verifie SSRF. Chaque tool a sa propre logique d'approval.

**Pourquoi localStorage et pas SQLite ?**
SQLite necessite un backend persistent (pas compatible avec Bun serve sans extension native). IndexedDB est la prochaine etape naturelle (async, 50MB+, meme API browser). Le choix localStorage-first a permis un developpement rapide. La migration vers IndexedDB est backwards-compatible.

---

## 8. Component Spec : ChatPanel (cible)

### 8.1 Architecture des sous-composants

```
ChatPanel
|-- ChatHeader
|   |-- SessionTabs (onglets de sessions)
|   +-- SessionActions (new, rename, delete)
|
|-- MessageList (react-virtuoso)
|   |-- SystemMessage (mode switch, compaction notice)
|   |-- UserMessage
|   |   |-- ContextBlocks (terminal, file quotes)
|   |   |-- ImageThumbnails
|   |   +-- MessageText (markdown)
|   |
|   |-- AssistantMessage
|   |   |-- ReasoningBlock (collapsible, shimmer)
|   |   |-- TextBlock (markdown)
|   |   |-- ToolCallCard
|   |   |   |-- TerminalCommandCard (command + output + status)
|   |   |   |-- FileOperationCard (diff view)
|   |   |   +-- GenericToolCard (args + result)
|   |   |-- ToolCallGroup (collapsed batch)
|   |   |   +-- BatchProgressBar
|   |   +-- TokenFooter (hover-only)
|   |
|   +-- BranchNavigator (<- Response 2/3 ->)
|
|-- ApprovalZone (fixed, above input)
|   |-- FileApprovalBanner (diff review)
|   |-- PermissionBanner (command approve)
|   |-- ToolPermissionBanner (generic tool approve)
|   +-- QuestionBanner (user_question response)
|
|-- ContextPills (above textarea)
|   |-- TerminalPill (@terminal:name)
|   |-- FilePill (@file:path)
|   |-- ImagePill (thumbnail + x)
|   +-- MissionPill (@findings, @scope)
|
|-- ChatInput
|   |-- Textarea (auto-resize, Shift+Enter newline)
|   |-- SlashPopover (/ commands)
|   |-- MentionPopover (@ references)
|   |-- ImageDropZone
|   +-- SendButton (+ streaming cancel)
|
|-- ControlBar
|   |-- AgentModeBadge (CTF/Audit/Neutral + color)
|   |-- ModelPicker (provider + model dropdown)
|   |-- ThinkingBadge (off/low/medium/high)
|   |-- ContextMeter (color bar + tooltip)
|   |-- StreamingStatus (Step N - Xs - tokens)
|   +-- BehaviorPopover (YOLO, Follow, Split)
|
+-- ScrollToBottom (floating button)
```

### 8.2 State Zustand : slices necessaires

```typescript
// === SESSION STORE (existant, a etendre) ===
interface SessionStore {
  sessions: Session[];
  activeSessionByProject: Record<string, string>;

  // Existant
  createSession(projectId: string, title?: string): string;
  addMessage(sessionId: string, msg: Message): void;
  updateMessage(sessionId: string, msgId: string, updates: Partial<Message>): void;
  undoLastExchange(sessionId: string): void;
  forkSession(sessionId: string, upToMsgId: string): string;

  // Nouveau
  editMessage(sessionId: string, msgId: string, newContent: string): void;
  // -> Cree une branche : ancien message garde ses enfants, nouveau message devient actif
  getBranches(sessionId: string, msgId: string): Message[];
  switchBranch(sessionId: string, msgId: string, branchIndex: number): void;
  markCritical(sessionId: string, msgId: string): void;
  // -> Message ne sera jamais prune (contient des findings)
}

// === STREAMING STORE (nouveau) ===
interface StreamingStore {
  isStreaming: boolean;
  currentStep: number;
  elapsedMs: number;
  tokensUsed: number;
  abortController: AbortController | null;

  startStream(): AbortController;
  incrementStep(): void;
  updateTokens(count: number): void;
  cancelStream(): void;
  endStream(): void;
}

// === MISSION STORE (nouveau) ===
interface MissionStore {
  activeMission: Mission | null;
  missionState: MissionState;

  createMission(name: string, projectId: string): void;
  updateMissionState(updates: Partial<MissionState>): void;
  addTarget(ip: string, hostname?: string): void;
  addCredential(cred: Credential): void;
  addVulnerability(vuln: Vulnerability): void;
  addFlag(flag: string): void;
  exportMission(format: 'markdown' | 'json' | 'jsonl'): string;
}

// === CONTEXT STORE (existant, inchange) ===
// === CHAT CONTEXT STORE (existant, a etendre) ===
interface ChatContextStore {
  quotes: Quote[];
  images: ImageAttachment[];
  // Nouveau
  missionContext: boolean;  // @findings enabled
  scopeContext: boolean;    // @scope enabled
}

// === APPROVAL STORES (existant, a etendre) ===
interface CommandApprovalStore {
  // Existant
  pending: PendingCommand[];
  mode: ApprovalMode;
  // Nouveau
  editedCommands: Record<string, string>;  // commandId -> edited text
  editCommand(id: string, newCommand: string): void;
}
```

### 8.3 Events SSE : rendu dans l'UI

| SSE Event | Data Shape | UI Rendering |
|-----------|------------|--------------|
| `text-delta` | `{content: string}` | Append to current TextBlock, trigger markdown re-render |
| `reasoning` | `{id, content}` | Append to ReasoningBlock, shimmer animation, auto-scroll |
| `tool-call` | `{id, tool, args, status}` | Create ToolCallCard (running state, pulsing dot) |
| `tool-result` | `{toolCallId, output}` | Update ToolCallCard (completed, expand output) |
| `tool-truncated` | `{toolCallId, original, truncated}` | Show "Output truncated (70%)" badge on card |
| `usage` | `{input, output, reasoning, cache}` | Update TokenFooter, update ContextMeter |
| `done` | `{}` | Stop shimmer, finalize all parts, enable input |
| `error` | `{message, code}` | Show error toast, stop streaming, enable input |
| `mode-switch` | `{from, to}` | Insert SystemMessage with mode badge |
| `compaction` | `{summary, removedCount}` | Insert CompactionMessage with expandable summary |

### 8.4 Keybindings — table complete

| Shortcut | Scope | Action | Notes |
|----------|-------|--------|-------|
| `Enter` | Input focused | Send message | |
| `Shift+Enter` | Input focused | Newline | |
| `ArrowUp` | Input empty | Previous message history | |
| `ArrowDown` | Input, browsing history | Next message history | |
| `Escape` | Streaming | Cancel stream | |
| `Escape` | Popover open | Close popover | |
| `/` | Input empty | Open slash popover | |
| `@` | Input | Open mention popover | |
| `Y` | Approval banner visible | Approve once | |
| `A` | Approval banner visible | Always allow | |
| `N` | Approval banner visible | Deny | |
| `E` | Command approval visible | Edit command | Opens inline editor |
| `Ctrl+Enter` | Edit mode | Send edited message | |
| `Ctrl+L` | Chat focused | Clear chat (new session) | |
| `Ctrl+Shift+Y` | Global | Toggle YOLO mode | |
| `Ctrl+Shift+M` | Global | Cycle agent mode | CTF->Audit->Neutral->CTF |
| `Ctrl+F` | Chat focused | Search in messages | |
| `<-` | Branch indicator | Previous branch | |
| `->` | Branch indicator | Next branch | |
| `Tab` | Ghost command in terminal | Accept suggestion | Phase 3 |
