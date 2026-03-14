# Recommandations ph0wn — Exegol IHE

Analyse du feedback utilisateur (PDF Exegol_IHE.pdf, 14 mars 2026).

---

## 1. Options Topbar (remplacer l'IconRail)

**Problème :** L'IconRail vertical à gauche prend de la place et n'est pas le pattern standard. Cursor/VSCode utilisent une topbar horizontale.

**Plan :**
- Créer `src/ui/components/workspace/TopBar.tsx` — barre horizontale en haut avec menus déroulants (File, Edit, View, Settings)
- Le menu **View** reprend tous les toggles actuels de l'IconRail (Files panel, Chat panel, Bottom panel, Swap, Layout presets)
- Le menu **File** : New project, Switch project, Settings
- Supprimer `IconRail.tsx` et ses imports dans `WorkspaceLayout.tsx`
- Les projets passent dans la topbar (dropdown project switcher, comme Cursor "workspace" selector)
- **Impact :** Libère ~48px de largeur, UI plus standard

**Fichiers concernés :**
- Nouveau : `src/ui/components/workspace/TopBar.tsx`
- Modifier : `WorkspaceLayout.tsx` (remplacer IconRail par TopBar)
- Supprimer : `IconRail.tsx`
- Modifier : `layoutPersistence.ts` (adapter si besoin)

---

## 2. Views Topbar (toggle panels)

**Problème :** Les boutons hide/show panels sont enterrés dans l'IconRail.

**Plan :**
- Sous la topbar, une barre fine (24px) avec les icônes de toggle : Primary sidebar (Files), Secondary sidebar (Chat/Agents), Bottom panel, Terminal area
- Exactement comme la "Activity Bar" de Cursor/VSCode
- Cliquables + indicateur visuel (souligné/rempli quand actif)
- Persiste dans `layoutPersistence.ts` comme aujourd'hui

---

## 3. Primary Side Bar — Panel "Environments"

**Problème :** Pas de visibilité sur l'état des containers du projet.

**Plan :**
- Ajouter un tab "Environments" dans `FilesSidePanel.tsx` (à côté de "Files")
- Composant `EnvironmentsPanel.tsx` qui affiche pour chaque container du projet :
  - Nom, image base (exegolbeta/nightly, etc.), status (running/stopped) avec pastille couleur
  - Bouton start/stop inline
  - Bouton "Open Manager" qui ouvre l'ExegolManager modal
- Polling status toutes les 10s via `GET /api/containers`

**Fichiers concernés :**
- Nouveau : `src/ui/components/workspace/EnvironmentsPanel.tsx`
- Modifier : `FilesSidePanel.tsx` (ajouter tab system)

---

## 4. Secondary Side Bar — Rename chat

**Problème :** Pas possible de renommer une session/chat.

**Plan :**
- Dans `ChatSidePanel.tsx` > `SessionSidebar`, double-clic sur un nom de session active un `<input>` inline (même pattern que le rename de tabs dans `WorkspaceTabBar`)
- `useSessionStore.renameSession(id, name)` existe déjà — brancher l'UI
- Quick win, ~30 min de travail

**Fichiers concernés :**
- Modifier : `src/ui/components/workspace/ChatSidePanel.tsx`

---

## 5. Issue: Command echoing / stacking (CRITIQUE)

**Problème :** Les commandes se stackent, parfois pas de Enter, l'IA manipule mal le terminal. Bug #1 de confiance utilisateur.

### A. Injection plus robuste
**Fichier :** `src/terminal/manager.ts` — `writeTyping()`
- Actuellement : écrit la commande en une fois (paste-style) + 30ms delay + `\n`
- **Fix :** Ajouter un flush/drain du PTY output avant d'envoyer le `\n`
- Augmenter le delay entre commande et Enter : 50-100ms au lieu de 30ms
- Vérifier que le terminal n'est pas en mode "paste bracket" (`\x1b[200~`...`\x1b[201~`)

### B. Idle detection plus fiable
**Fichier :** `src/terminal/manager.ts` — prompt detection
- Le prompt regex actuel rate certains cas (zsh thèmes custom, multi-line prompts)
- Augmenter idle timeout de 300ms à 500ms
- Ajouter plus de patterns de prompt
- Après 1s de silence complet post-command, considérer idle

### C. Queue stricte
**Fichier :** `src/terminal/command-queue.ts`
- Vérifier séquentialité du lock per-terminal
- Ajouter watchdog : si terminal `busy` > 60s, libérer automatiquement
- Log visible côté UI quand commande en attente vs en cours

### D. Feedback visuel (UI)
- Indicateur dans le tab terminal : "busy" (spinner), "idle" (check), "waiting" (clock)
- Timer visible pour chaque commande en cours dans l'ops tracker
- Message clair quand une commande est en attente car terminal busy

---

## 6. Feat: Files background autorefresh

**Problème :** Obligé de refresh manuellement pour voir les fichiers. Le refresh ferme les dossiers ouverts.

### A. Auto-refresh en background
**Fichier :** `src/ui/stores/files.ts`
- `setInterval` de 5-10s qui re-fetch les répertoires ouverts (ceux dans `dirCache` qui sont expanded)
- Comparer avec le cache : merger (ajouter nouveaux, retirer supprimés) au lieu de remplacer
- Ne PAS fermer les dossiers ouverts

### B. Préserver l'état d'expansion
- Stocker les chemins expanded dans un `Set<string>` dans le store
- Au refresh, ne pas toucher `expandedPaths`
- Persister `expandedPaths` dans localStorage

### C. File watcher via terminal events
- Quand l'IA écrit un fichier (tool `file_write`), émettre un event WebSocket `file:changed` avec le chemin
- Le store écoute et re-fetch uniquement le dossier parent
- Pas besoin de inotify — juste les changements initiés par l'IA

---

## 7. Feat: zsh features (Tab completion, etc.)

**Problème :** Tab ne fait pas d'autocomplétion dans le terminal IHE.

**Analyse :** Le PTY est un vrai `docker exec -it container zsh`. Le Tab DEVRAIT fonctionner nativement car xterm.js transmet les keystrokes au PTY.

**Plan :**
- Vérifier dans `manager.ts` que le spawn utilise bien `-it` pour les terminaux utilisateur
- Vérifier dans `TerminalView.tsx` que Tab n'est pas intercepté par un event handler
- Tester : `stty -a` dans le terminal pour vérifier les settings tty
- Si le mode paste de l'injection AI corrompt le state tty, ajouter un reset (`stty sane`) après chaque injection

**Fichiers concernés :**
- `src/terminal/manager.ts` (vérifier spawn args)
- `src/ui/components/terminal/TerminalView.tsx` (vérifier key handlers)

---

## 8. Issue: Ctrl+R = terminaux disparaissent

**Problème :** Ctrl+R dans le navigateur fait un hard refresh → perte des terminaux (pas persistés).

### Court terme
- Intercepter Ctrl+R dans `WorkspaceLayout.tsx` quand le focus est sur un terminal
- Envoyer le keystroke au PTY (reverse-i-search de zsh) au lieu de laisser le browser refresh

### Long terme
- Persister l'état des terminaux dans le session store
- Au reload, reconnecter aux PTY existants via `docker exec` attach (si encore vivants)
- Ajouter un `beforeunload` handler qui avertit l'utilisateur si des terminaux sont actifs

**Fichiers concernés :**
- `src/ui/components/workspace/WorkspaceLayout.tsx` (Ctrl+R intercept)
- `src/ui/components/terminal/TerminalView.tsx` (key handler)
- `src/terminal/manager.ts` (reconnect logic)

---

## 9. Trop d'infos / trop de couleurs / lisibilité

**Problème :** Comparé à Cursor, l'UI est surchargée. "Trop d'info trop de couleurs, c'est moins facile à lire."

**Plan :**
- **Réduire la palette :** 2-3 couleurs d'accent max. Vert (terminaux), bleu (fichiers), violet (IA). Le reste en gris.
- **Simplifier les badges :** Cacher les capability badges (vision, tools, etc.) derrière le popover — comme déjà fait pour YOLO/follow/split
- **Minimum font size 10px :** Plus de `text-[8px]` ou `text-[9px]`, illisible
- **Espacement plus généreux :** Plus de padding, margins. L'UI est trop dense
- **Icons monochromes :** Pas de couleurs sur les icônes sauf état actif. Tout en `text-text-weaker` par défaut
- **Prendre modèle sur le screenshot Cursor (p.4) :** Sidebar sobre, éditeur central clean, chat à droite avec couleurs minimales

**Fichiers concernés :**
- CSS variables dans les thèmes (`src/ui/stores/catalogs/themes.ts`)
- Tous les composants qui utilisent des couleurs hardcodées
- `ControlBar.tsx` (simplifier badges)
- `WorkspaceTabBar.tsx` (réduire densité)
- `ChatPanel.tsx` (sobriété)

---

## 10. Confiance dans le terminal AI

**Problème FONDAMENTAL :** "Le terminal que l'IA manipule semble bricolé [...] on a pas trop envie de l'utiliser par manque de confiance."

**Plan :**
- Fix #5 (command echoing) est la priorité absolue
- **Indicateur de santé terminal :** Petit dot dans le tab
  - Vert = idle, prompt détecté
  - Orange = busy, commande en cours (avec timer)
  - Rouge = stuck (busy > 60s, probable freeze)
- **Retry mechanism :** Si commande stuck, proposer bouton "Force Enter" ou "Send Ctrl+C"
- **Audit trail visible :** Dans le chat, montrer quand une commande a été envoyée, terminée, et son exit code
- **Mode "safe" par défaut :** Pas de YOLO au démarrage, chaque commande prévisualisée

**Fichiers concernés :**
- `src/terminal/manager.ts` (santé, watchdog)
- `src/ui/components/workspace/WorkspaceTabBar.tsx` (indicateur tab)
- `src/ui/components/chat/ChatPanel.tsx` (audit trail)
- `src/ui/stores/commandApproval.ts` (default mode)

---

## Priorités

| Priorité | Item | Impact | Effort |
|---|---|---|---|
| **P0** | #5 Command echoing fix | Confiance = tout. Sans ça, personne utilise l'outil | Élevé |
| **P0** | #9 Simplifier UI/couleurs | Première impression. Trop chargé = rejet | Moyen |
| **P1** | #8 Ctrl+R fix | Bug bloquant qui détruit le travail en cours | Faible |
| **P1** | #6 Files autorefresh | UX basique attendue par tous | Moyen |
| **P1** | #10 Indicateurs de santé terminal | Renforce la confiance | Moyen |
| **P2** | #1+#2 Topbar (remplacer IconRail) | Refactor UI majeur mais pas urgent | Élevé |
| **P2** | #7 zsh Tab completion | Important mais probablement déjà fonctionnel | Faible |
| **P2** | #3 Panel Environments | Nice to have, pas bloquant | Moyen |
| **P3** | #4 Rename chat | Quick win | Faible |
