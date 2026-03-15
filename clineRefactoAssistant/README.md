# Cline Refacto Assistant — Gap Analysis & Roadmap

Deep dive comparison between Cline (github.com/cline/cline) and our assistant sidebar.
Source: `/oldversions/cline/`

---

## P0 — Critiques pour la credibilite

### 1. Tool Grouping (read/search operations)

**Cline:** `messageUtils.ts` > `groupLowStakesTools()` groups consecutive read/search/list operations into a single collapsible row. Summary: "Read 5 files, 2 folders, 1 search". Each item clickable (open file) or expandable.

**Nous:** Chaque file_read/search_grep est un ToolCallCard separe. 10 reads = 10 cards.

**Implementation:**
- `MessageBubble.tsx`: la fonction `groupParts()` existe deja (groupe 3+ tool calls du meme type). Etendre pour grouper les "low-stakes" tools (file_read, search_grep, search_find, terminal_read, terminal_list) meme s'ils sont de types differents.
- `ToolCallCard.tsx`: creer un `LowStakesGroup` composant compact (icone + "Read 5 files" + chevron expand).
- Fichiers Cline a etudier:
  - `webview-ui/src/components/chat/chat-view/messageUtils.ts` (groupLowStakesTools, line 729)
  - `webview-ui/src/components/chat/rows/ToolGroupRenderer.tsx`
  - `webview-ui/src/components/chat/rows/misc/TypewriterText.tsx`

### 2. Inline Diff Viewer (file edits)

**Cline:** `DiffEditRow.tsx` shows unified diffs with +/- coloring, line numbers, DiffStats (+N/-M), clickable file paths, auto-scroll during streaming.

**Nous:** file_write/file_edit montrent du raw text dans un collapsible. Pas de diff colors.

**Implementation:**
- `ToolCallCard.tsx`: pour les tools `file_write` et `file_edit`, parser le output pour extraire le diff.
- Creer un `DiffView` composant avec lignes +/- colorees (vert/rouge), line numbers.
- Alternative: utiliser `react-diff-viewer` ou `diff2html` comme lib.
- Fichiers Cline a etudier:
  - `webview-ui/src/components/chat/rows/DiffEditRow.tsx`

### 3. Command Output avec Status Dot anime

**Cline:** `CommandOutputRow.tsx` montre un dot vert pulsing (running), jaune (pending), gris (completed). Output max 75px (5 lignes), expandable a 200px via `ExpandHandle`.

**Nous:** `TerminalCommandCard` a un status badge (Success/Failed) mais pas de dot anime. Output inline mais pas de expand handle.

**Implementation:**
- `ToolCallCard.tsx` > `TerminalCommandCard`: ajouter un dot anime CSS (`animate-pulse`) pour l'etat running.
- Ajouter un `ExpandHandle` (drag handle pour redimensionner le output).
- Fichiers Cline a etudier:
  - `webview-ui/src/components/chat/rows/CommandOutputRow.tsx`
  - `webview-ui/src/components/chat/rows/misc/ExpandHandle.tsx`

### 4. Thinking Shimmer Animation

**Cline:** `ThinkingRow.tsx` montre "Thinking" avec animation shimmer CSS, collapsible content avec scroll gradients, max 150px.

**Nous:** `ReasoningBlock` dans `MessageBubble.tsx` montre un spinner Loader2 + "Thinking..." en texte.

**Implementation:**
- `MessageBubble.tsx` > `ReasoningBlock`: remplacer le Loader2 par un shimmer CSS.
- Ajouter un gradient overlay en haut/bas du contenu collapsible.
- CSS shimmer: `background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent); animation: shimmer 2s infinite;`
- Fichiers Cline a etudier:
  - `webview-ui/src/components/chat/rows/ThinkingRow.tsx`

### 5. Granular Auto-Approve (par categorie)

**Cline:** `AutoApproveBar.tsx` + `AutoApproveModal.tsx` — barre toujours visible "Auto-approve: Read, Edit, Safe Commands". Modal avec checkboxes par categorie:
- Read project files / Read all files
- Edit project files / Edit all files
- Execute safe commands / Execute all commands
- Use browser
- Use MCP servers

**Nous:** 3 modes binaires: ask / auto-run / yolo. Pas de granularite.

**Implementation:**
- `ControlBar.tsx`: remplacer le popover YOLO/follow/split par un `AutoApproveBar` avec categories.
- `stores/commandApproval.ts`: etendre le mode pour stocker des permissions par categorie.
- `ai/tool/index.ts`: categoriser les tools (read-only, write, execute, dangerous).
- Fichiers Cline a etudier:
  - `webview-ui/src/components/chat/auto-approve/AutoApproveBar.tsx`
  - `webview-ui/src/components/chat/auto-approve/AutoApproveModal.tsx`

### 6. Message Interruption (feedback pendant execution)

**Cline:** L'utilisateur peut envoyer un message PENDANT que l'IA travaille pour donner du feedback. Le message interrompt le flow et l'IA s'adapte.

**Nous:** Impossible. L'utilisateur doit attendre la fin du streaming ou cliquer Stop. Pas de feedback en cours de route.

**Implementation:**
- `ChatPanel.tsx`: autoriser l'envoi meme quand `streaming === true`.
- Backend `chat/index.ts`: detecter un nouveau message user pendant le stream, abort le stream en cours, re-envoyer avec le feedback ajoute.
- C'est le changement le plus complexe — il faut un mecanisme d'interruption propre.
- Fichiers Cline a etudier:
  - `webview-ui/src/components/chat/chat-view/hooks/useMessageHandlers.ts` (lines 98-117)

---

## P1 — UX significatif

### 7. Virtualized Message List

**Cline:** `react-virtuoso` dans `MessagesArea.tsx`. Seuls les messages visibles sont dans le DOM. `increaseViewportBy: { top: 3000, bottom: MAX_SAFE_INTEGER }`.

**Nous:** Tous les messages sont dans le DOM. Conversations longues = lent.

**Implementation:**
- Installer `react-virtuoso` ou `@tanstack/react-virtual`.
- `ChatPanel.tsx`: remplacer le `.map()` par un `<Virtuoso>` avec `itemContent`.
- Complexite: les messages ont des hauteurs variables (tool calls, diffs, etc.).
- Fichiers Cline: `webview-ui/src/components/chat/chat-view/components/layout/MessagesArea.tsx`

### 8. Quote-on-Selection (bouton flottant)

**Cline:** `QuoteButton.tsx` — bouton flottant qui apparait quand on selectionne du texte dans une reponse IA. Copie le texte selectionne comme contexte quote dans l'input.

**Nous:** Click sur un message user pour quoter. Pas de quote depuis les reponses IA.

**Implementation:**
- Creer `QuoteButton.tsx`: ecouter `mouseup` sur le container messages, detecter selection, positionner un bouton flottant.
- Au clic: `setInput(prev => "> " + selectedText + "\n\n" + prev)`.
- Fichiers Cline: `webview-ui/src/components/chat/QuoteButton.tsx`

### 9. Token Breakdown dans Context Indicator

**Cline:** `ContextWindowSummary.tsx` — accordion avec: Context Window (used/total/remaining), Token Usage (prompt/completion/cache writes/reads), Auto Condense Threshold.

**Nous:** Tooltip avec used/limit/free/promptTier/tools. Pas de breakdown prompt vs completion.

**Implementation:**
- `ControlBar.tsx` > `ContextIndicator`: etendre le tooltip avec les donnees du `X-Context-Info` header.
- Backend: renvoyer plus de details dans le header (prompt tokens, completion tokens, cache stats).
- Fichiers Cline: `webview-ui/src/components/chat/context-window/ContextWindowSummary.tsx`

### 10. Welcome Section

**Cline:** `WelcomeSection.tsx` avec logo, model status, carousel d'infos, historique recent, suggestions de taches.

**Nous:** "Ready to assist" + icone Bot. Minimal.

**Implementation:**
- `ChatPanel.tsx`: remplacer l'empty state par un composant `WelcomeSection` avec:
  - Logo Exegol + nom du projet
  - Container actif + status
  - 3-4 suggested tasks ("Scan network", "Enumerate services", "Check credentials")
  - Sessions recentes (derniere 3)
- Fichiers Cline: `webview-ui/src/components/chat/welcome/WelcomeSection.tsx`

### 11. Task Header

**Cline:** `TaskHeader.tsx` — en haut du chat: description de la tache collapsible, badge cout ($0.12), boutons (copy, delete, new task), context window, focus chain.

**Nous:** Pas de header de tache. Le premier message user sert de contexte.

**Implementation:**
- `ChatPanel.tsx`: ajouter un header au-dessus des messages montrant le titre de la session + cout total + context usage.
- Fichiers Cline: `webview-ui/src/components/chat/task-header/TaskHeader.tsx`

### 12. Focus Chain (To-Do List)

**Cline:** `FocusChain.tsx` — to-do list extraite par l'IA, avec progress bar, persiste across compactions. Chaque item a un checkbox.

**Nous:** `todo_read`/`todo_write` tools existent mais pas de UI dediee. Les todos sont dans le store mais pas affiches de maniere prominente.

**Implementation:**
- Creer un `FocusChain.tsx` qui affiche les todos du store au-dessus de l'input ou dans le task header.
- Fichiers Cline: `webview-ui/src/components/chat/FocusChain.tsx`

### 13. Auto-Approve Bar

**Cline:** Barre toujours visible au-dessus de l'input: "Auto-approve: Read, Edit, Safe Commands" ou "None". Cliquable pour ouvrir le modal.

**Nous:** Le mode est dans le popover SlidersHorizontal. Pas toujours visible.

**Implementation:**
- `ChatPanel.tsx`: ajouter une barre fine (24px) entre les messages et l'input montrant le mode actuel.
- Fichiers Cline: `webview-ui/src/components/chat/auto-approve/AutoApproveBar.tsx`

---

## P2 — Polish

### 14. TypewriterText Animation
Animation texte qui s'ecrit caractere par caractere pour les operations actives.
- Fichiers Cline: `webview-ui/src/components/chat/rows/misc/TypewriterText.tsx`

### 15. @git Mentions
Browse git commit history comme contexte dans l'input.
- Fichiers Cline: `webview-ui/src/components/chat/context-menu/ContextMenu.tsx`

### 16. @url Mentions
Fetch URL content comme contexte. On a deja `@url` via `useAtOptions` — verifier si fonctionnel.

### 17. Plan/Act Mode Toggle
Bouton dans l'input area pour switcher entre mode planification et execution.

### 18. File Attachments
Support fichiers arbitraires, pas juste images.

### 19. HTML-to-Markdown Copy
Copy depuis le chat convertit en Markdown propre (pas du HTML).
- Fichiers Cline: `webview-ui/src/components/chat/chat-view/ChatView.tsx` (lines 90-174)

### 20. "Proceed While Running" Button
Bouton pendant qu'une commande tourne pour continuer sans attendre.

### 21. Centralized Button Config
18 etats mappes a des configs de boutons. Remplace la logique dispersee.
- Fichiers Cline: `webview-ui/src/components/chat/chat-view/buttonConfig.ts`

### 22. Expand Handle Widget
Drag handle pour redimensionner le contenu long des tool outputs.
- Fichiers Cline: `webview-ui/src/components/chat/rows/misc/ExpandHandle.tsx`

### 23. Structured Compaction Template
7 sections: Goal, Key Concepts, Files, Problem Solving, Pending Tasks, Task Evolution, Next Step.
- Fichiers Cline: `src/core/context/context-management/contextManagement.ts`

### 24. Subagent Status Display
Token counts, couts, resultats par sous-agent avec expand.
- Fichiers Cline: `webview-ui/src/components/chat/rows/SubagentStatusRow.tsx`

---

## Nos forces (ce que Cline n'a PAS)

| Feature | Description |
|---|---|
| Terminal multiplexer | Split/tabs/pop-out, follow AI, split grid 2x2 |
| Exegol-history | Creds/hosts management integre |
| Container filesystem | Browser + Monaco editor dans le container |
| Screenshot capture | Capture terminaux vers le container |
| Multi-provider (17+) | + local AI via llama.cpp |
| Multi-container | Plusieurs containers par projet |
| Exegol-native | Sandbox container securise |

---

## Ordre d'implementation recommande

1. **Tool grouping** (#1) — impact visuel immediat, reduit le bruit
2. **Thinking shimmer** (#4) — CSS only, 10 min
3. **Welcome section** (#10) — premiere impression
4. **Auto-approve bar** (#13) — toujours visible, confiance
5. **Granular auto-approve** (#5) — granularite des permissions
6. **Inline diff** (#2) — qualite percue des file edits
7. **Token breakdown** (#9) — transparence
8. **Quote-on-selection** (#8) — UX interaction
9. **Virtualized list** (#7) — performance longues sessions
10. **Message interruption** (#6) — le plus complexe, faire en dernier
