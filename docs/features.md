# Exegol IHE — Feature Roadmap

## Integrations

### Caido (Pentest Proxy)
- Panel "Proxy" dans la sidebar affichant le trafic Caido en temps réel
- L'IA peut lire/analyser les requêtes interceptées via MCP ou GraphQL
- Replay de requêtes modifiées depuis le chat
- Scope Caido synchronisé avec le scope manager
- API: GraphQL sur `localhost:8080/graphql`
- MCP server existant: [caido-mcp-server](https://github.com/c0tton-fluff/caido-mcp-server) (18 tools)
- SDK: `@caido/sdk-client` pour accès TypeScript natif

## Killer Features Pentest (non-IA)

### P0 — Must Have

#### Auto-parsing des outputs
- Détecter les outputs nmap, nuclei, ffuf, netexec, etc. dans les terminaux
- Parser en données structurées (hosts, services, vulns)
- Parsers prioritaires: nmap XML, masscan XML, nuclei JSONL, ffuf JSON, gobuster stdout, nikto XML, testssl JSON, sqlmap, netexec, impacket, certipy, BloodHound JSON, linpeas/winpeas
- Auto-import quand un outil écrit un fichier (`nmap -oX scan.xml`)

#### Scope Manager
- UI pour définir cibles in/out-of-scope (CIDR, domaines, URLs, ports)
- Hard gate avant chaque commande — warning rouge si hors scope
- Scope badge sur tous les hosts dans le network map et findings
- L'IA vérifie le scope avant de proposer des commandes
- Import depuis CSV/texte client

#### Credential / Loot Vault
- Table auto-alimentée: username, password/hash, type (plaintext/NTLM/Kerberos/SSH key/token), source, host, service, timestamp, validité
- Auto-capture depuis outputs netexec, secretsdump, hydra, responder, john/hashcat
- Hash tracking: cracked vs pending, export format hashcat/john
- L'IA peut réutiliser les creds du vault pour les commandes authentifiées
- Loot section: fichiers capturés, PoC, stockés dans `/workspace/.exegol-ihe/loot/`

### P1 — High Impact

#### Timeline d'activité automatique
- Log chaque commande avec timestamp, terminal, container, output tronqué
- Vue chronologique filtrable par terminal, time range, event type
- Annotations sur chaque entrée
- Export markdown/HTML pour rapports
- Quasi gratuit — on capture déjà tout le terminal I/O

#### Network Map visuel
- Graphe interactif hosts/services depuis données nmap/masscan
- Nodes colorés par OS, taille par nombre de ports ouverts
- Arbre expandable: IP → ports → services → versions → vulns connues
- Groupement par subnet/VLAN/domaine
- Library: cytoscape.js ou d3-force

#### Findings enrichis + CVSS calculator
- Calculateur CVSS v3.1/v4.0 interactif (vecteurs cliquables)
- Templates de findings pré-écrits (OWASP Top 10, AD classiques, réseau)
- Evidence: terminal output, screenshots, requêtes HTTP attachées
- CWE/CVE auto-suggest
- Déduplication: même vuln sur N hosts = 1 finding avec N affected hosts
- Workflow: Draft → Review → Final

#### Command Templates / Playbooks
- `/nmap-full` → `nmap -sC -sV -p- -oX /workspace/nmap_{target}.xml {target}`
- Placeholders auto-remplis (`{target}`, `{port}`, `{user}`)
- Playbooks ordonnés: séquences de commandes chainées (output N → input N+1)
- 50+ templates built-in, custom templates par user
- Stockage: JSON/YAML dans `/workspace/.exegol-ihe/templates/`

#### Report generation
- One-click: findings + timeline + screenshots → rapport
- Formats: Markdown, HTML, DOCX (pandoc dans Exegol)
- Templates customisables: exec summary, technical findings, methodology, appendices
- Sections auto-populated depuis les données structurées

### P2 — Nice to Have

#### Screenshot management
- Hotkey capture terminal (text ou image rendue)
- Galerie grid avec thumbnails
- Tagging par finding/host/methodology step
- Auto-naming: `{target}_{tool}_{timestamp}.png`
- Import galleries gowitness/EyeWitness

#### Methodology checklists
- Templates: OWASP WSTG, PTES, AD, Wi-Fi, API testing
- Auto-check quand un outil correspondant est exécuté
- Progress bar dans la sidebar
- Custom checklists par type d'engagement

#### Per-host / Per-service notes
- Notes markdown attachées à tout objet (host, service, finding, cred)
- Quick-note depuis terminal: sélection → "Add note to {host}"
- Full-text search across all notes

#### Engagement metadata
- Détails: client, type (internal/external/web/AD), dates, RoE, contacts urgence
- Status dashboard: jours restants, findings par sévérité, scope coverage, progress méthodologie

#### Data import/export
- Import: Nmap XML, Nessus .nessus, Burp XML, Nuclei JSONL, masscan XML, BloodHound JSON
- Export: Markdown, DOCX, CSV findings, JSON complet, format Dradis
- Clipboard: copier un finding en markdown formaté pour Jira/ServiceNow

## Features Exegol-native

- **Multi-container**: vue unifiée sur N containers (interne + externe)
- **Image awareness**: détecter exegol-full/light/ad/web → adapter suggestions d'outils
- **my-resources**: exposer le dossier partagé dans le file browser
- **Container lifecycle**: start/stop/restart containers depuis l'UI
- **Resource monitoring**: CPU/RAM du container, warning quand un outil sature
- **Volume management**: monter volumes additionnels (VPN configs, wordlists)

## UX Features (inspirées d'OpenCode)

- **Quick actions contextuelles**: sélection IP dans terminal → popup "Add to scope / Nmap this / Add credential / Create finding / Open in network map"
- **Command palette** (Cmd+K): switch terminals, open findings, search hosts, run templates
- **File diffing**: unified/split diff view
- **Session management**: fork, archive, share, token usage display
- **Keybinds customisables**: 6 groupes (General, Session, Navigation, Model/Agent, Terminal, Prompt)
- **Sound notifications**: optionnel, sur completion de commande longue
- **Layout presets**: Default, Split, Terminal, Zen — quick switch
- **Status bar**: findings count, terminals actifs, tokens used, Caido status

## Business / Monetization

### Exegol Cloud (proxy API)
- Provider `"exegol"` built-in pointant vers `api.exegol.io/v1`
- Modèle crédits: X requêtes fast (Sonnet) + illimité modèles cheap
- Pricing: ~50€/mois positionnement pro (cf. Burp Pro 450€/an)
- BYOK par défaut (gratuit), Exegol Cloud en option
- Stack: Cloudflare Workers/Fly.io + Stripe + JWT
