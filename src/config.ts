/**
 * Centralized configuration constants.
 * All magic numbers and hardcoded values go here.
 */

// ── Docker / Exec ────────────────────────────────────────────
export const DOCKER_EXEC_TIMEOUT = 30_000 // 30s
export const DOCKER_EXEC_MAX_OUTPUT = 50 * 1024 // 50KB

// ── Chat / AI ────────────────────────────────────────────────
export const MAX_TOOL_OUTPUT = 3_000 // chars
export const MAX_MESSAGES_PER_REQUEST = 500
export const MAX_IMAGES_PER_REQUEST = 20

// ── Terminal context lines per prompt tier ────────────────────
export const TERMINAL_LINES_MINIMAL = 30
export const TERMINAL_LINES_MEDIUM = 60
export const TERMINAL_LINES_FULL = 100

// ── File operations ──────────────────────────────────────────
export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
export const MAX_TRANSFER_SIZE = 10 * 1024 * 1024 // 10MB

// ── URL fetch (SSRF protection) ──────────────────────────────
export const URL_FETCH_TIMEOUT = 10_000 // 10s
export const URL_FETCH_MAX_BYTES = 100_000 // 100KB

// ── Persistence ──────────────────────────────────────────────
export const MAX_PERSISTED_SESSIONS = 50
export const MAX_MESSAGES_PER_SESSION = 100

// ── Paths ────────────────────────────────────────────────────
export const MCP_CONFIG_PATH = ".ultiIHE/mcp-servers.json"
export const ENGAGEMENT_DIR = ".ultiIHE/engagement"
