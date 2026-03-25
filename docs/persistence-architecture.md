# Persistence Architecture — SQLite in-container

## Principe

Chaque container Exegol embarque sa propre base SQLite.
L'app y accède via `docker exec sqlite3`. Zéro donnée d'engagement sur l'host.

```
Container Exegol
└── /.ultiIHE/
    ├── ihe.db              # SQLite — sessions, messages, findings, todos
    └── mcp-servers.json    # Config MCP (existant)

Host (app compilée)
└── settings uniquement    # providers, theme, keybinds, layout — non-sensible
```

## Pourquoi

| Contrainte | Réponse |
|------------|---------|
| App compilée (pas de JSON sur l'host) | SQLite dans le container, accès via `docker exec` |
| Isolation entre engagements | Docker isole physiquement — impossible de cross-leak |
| Purge d'un engagement | `docker rm` = tout part avec, y compris la DB |
| Export / archivage | `docker cp <container>:/.ultiIHE/ihe.db ./archive/` |
| Exegol a déjà sqlite3 | Pas de dépendance supplémentaire |
| Pattern existant | `exh.ts` fait déjà `docker exec` pour les creds/hosts — même approche |

## Schéma SQL

```sql
-- ── Sessions ────────────────────────────────────────────────
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  agent_mode  TEXT DEFAULT 'neutral',   -- ctf | audit | neutral
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ── Messages ────────────────────────────────────────────────
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,            -- user | assistant
  content     TEXT NOT NULL,
  parts       TEXT DEFAULT '[]',        -- JSON: TextPart | ToolCallPart | ReasoningPart
  usage       TEXT,                     -- JSON: MessageUsage (nullable, assistant only)
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

-- ── Findings ────────────────────────────────────────────────
CREATE TABLE findings (
  id          TEXT PRIMARY KEY,
  session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  severity    TEXT NOT NULL,            -- critical | high | medium | low | info
  title       TEXT NOT NULL,
  description TEXT,
  cvss        REAL,
  remediation TEXT,
  evidence    TEXT,                     -- JSON: tool outputs, screenshot refs
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_findings_severity ON findings(severity);

-- ── Todos ───────────────────────────────────────────────────
CREATE TABLE todos (
  id          TEXT PRIMARY KEY,
  session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',   -- pending | in_progress | done
  priority    INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_todos_status ON todos(status);
```

## Couche d'accès : `containerDb.ts`

Tout passe par `dockerExec` + `sqlite3 -json`. Un seul fichier source.

```typescript
import { dockerExec, shellEscape } from "../ai/tool/exec"

const DB_PATH = "/.ultiIHE/ihe.db"

// ── Init (idempotent) ─────────────────────────────────────────

export async function initDb(container: string): Promise<void> {
  await dockerExec(container, `mkdir -p /.ultiIHE && sqlite3 ${DB_PATH} <<'SQL'
CREATE TABLE IF NOT EXISTS sessions (...);
CREATE TABLE IF NOT EXISTS messages (...);
CREATE TABLE IF NOT EXISTS findings (...);
CREATE TABLE IF NOT EXISTS todos (...);
SQL`)
}

// ── Query helper ──────────────────────────────────────────────

async function query<T>(container: string, sql: string): Promise<T[]> {
  const escaped = sql.replace(/'/g, "'\\''")
  const { stdout } = await dockerExec(container,
    `sqlite3 -json ${DB_PATH} '${escaped}'`
  )
  return stdout.trim() ? JSON.parse(stdout) : []
}

async function exec(container: string, sql: string): Promise<void> {
  const escaped = sql.replace(/'/g, "'\\''")
  await dockerExec(container, `sqlite3 ${DB_PATH} '${escaped}'`)
}

// ── Sessions CRUD ─────────────────────────────────────────────

export async function getSessions(container: string) {
  return query<Session>(container,
    "SELECT * FROM sessions ORDER BY updated_at DESC"
  )
}

export async function createSession(container: string, session: Session) {
  await exec(container, `INSERT INTO sessions VALUES(...)`)
}

// ... même pattern pour messages, findings, todos
```

## Flow applicatif

```
1. User sélectionne container "exegol-bank"
   └─> initDb("exegol-bank")         # crée /.ultiIHE/ihe.db si absent
   └─> getSessions("exegol-bank")    # charge les sessions dans le store Zustand

2. Pendant le chat
   └─> chaque message: saveMessage("exegol-bank", msg)   # INSERT dans la DB
   └─> store Zustand = cache mémoire (pas de persist localStorage)

3. User switch vers "exegol-ctf"
   └─> store Zustand vidé (orchestrator.switchProject())
   └─> initDb("exegol-ctf")
   └─> getSessions("exegol-ctf")
   └─> zéro donnée de "exegol-bank" en mémoire

4. User supprime le container
   └─> docker rm exegol-bank
   └─> toutes les sessions/findings/todos sont purgées
```

## Ce qui reste sur l'host (localStorage)

Uniquement les données non-sensibles liées à l'app elle-même :

- **settings** : providers API, modèles, theme, font, keybinds
- **layout** : positions des panels, presets, tailles
- **projects** : mapping nom → containerIds (metadata, pas de contenu)
- **fileConfig** : pinned paths, visible roots

Aucune donnée d'engagement, aucun message, aucun finding.

## Migration depuis localStorage

Pour les utilisateurs existants qui ont des sessions en localStorage :

1. Au switch vers le nouveau système, détecter les sessions existantes
2. Proposer l'export vers la DB du container associé
3. Purger le localStorage après migration confirmée
4. Fallback : les anciennes sessions restent lisibles en read-only jusqu'à purge manuelle

## Sécurité

| Menace | Protection |
|--------|-----------|
| Compromission du host | Aucune donnée d'engagement sur le filesystem host |
| Cross-leak entre engagements | Isolation Docker — containers séparés |
| Purge engagement terminé | `docker rm` = suppression complète |
| Archive pour rapport | `docker cp container:/.ultiIHE/ihe.db ./` |
| Accès concurrent | SQLite WAL mode + un seul writer (l'app) |
| Injection SQL | Paramètres échappés via `shellEscape()` existant |
| Chiffrement at-rest | Possible via SQLCipher si Exegol l'intègre |

## Implémentation — étapes

### Phase 1 : Couche d'accès
- [ ] `src/server/services/containerDb.ts` — init, query, exec helpers
- [ ] Route Hono `POST /api/db/:container/query` (optionnel, ou appels directs)
- [ ] Tests unitaires pour l'escape SQL et le parsing

### Phase 2 : Migration sessions
- [ ] Adapter `session.ts` store : cache mémoire sans `persist: localStorage`
- [ ] Sync bidirectionnelle : store ↔ DB container via WebSocket events
- [ ] Adapter `orchestrator.ts` : charger/décharger la DB au switch projet

### Phase 3 : Findings & Todos
- [ ] Migrer `todo-tools.ts` de in-memory vers DB container
- [ ] Ajouter table findings + tool `finding_add` / `finding_list`
- [ ] UI panel findings dans le workspace

### Phase 4 : Cleanup
- [ ] Retirer `persist: localStorage` du session store
- [ ] Migration helper pour les utilisateurs existants
- [ ] Documenter le workflow export/archive
