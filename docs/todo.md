# UltiIHE - TODO / Architecture Notes

## Layout Redesign (meeting notes)

### Agent Side Bar (right)
- Tout le volet agentic (chat, tool approvals, command previews)
- Selecteur de session : onglets dans le panel ou panel sessions en liste

### Primary Side Bar (left)
- Volet modulable avec sections :
  - **Files** : file tree en haut, en grand
  - **Search** : chercher dans fichiers ET terminaux, configurable
  - **Environments** : Exegol manager simplifié (containers list, état, association projet, création)

### Workspace (center)
- Onglets unifiés : fichier | terminal | app web (Caido, BH-CE, ...)
- Quick wins UX (non prioritaire) : onglets en liste, filtrer, couleur, pin, close batch

### Bottom Panel
- Credentials (exegol history)
- Screenshots
- Plus tard : Vulnerabilities (intégration Milou/Sysreptor/Ghostwriter)

### Probe
- Modale top-level (Command Palette style)

### Settings
- Modale, PAS un onglet (déjà le cas)

## Questions ouvertes
- Agent Side Bar = panel séparé de Primary Side Bar ? (probablement oui : gauche = tools, droite = chat)
- Sessions : onglets simultanés ou juste liste pour switch ?
- Probe : fuzzy finder global ou outil pentest spécifique ?
