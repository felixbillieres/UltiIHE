# Getting Started

## Requirements

- **Bun** >= 1.0 — [bun.sh](https://bun.sh)
- **Docker** with at least one Exegol container — [exegol.readthedocs.io](https://exegol.readthedocs.io/)
- An AI provider API key (Anthropic, OpenAI, Google, Groq, etc.)

## Installation

```bash
git clone https://github.com/felixbillieres/UltiIHE.git
cd UltiIHE
bun install
```

## Configuration

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. (Optional) Add API keys to `.env`, or configure them later in the UI.

## Running

```bash
# Start backend + frontend together
bun run dev:all
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- WebSocket: ws://localhost:3001/ws

On Fedora (Docker needs sudo):
```bash
sudo -E $(which bun) run dev:all
```

## First Launch

1. Open http://localhost:5173
2. Go to **Settings > Providers** and add at least one API key
3. Select a model in the chat control bar
4. Create a project — choose an Exegol container
5. Open a terminal (click **+** in the tab bar)
6. Start chatting — the AI can see your terminal output and propose commands

## Agent Modes

Use the mode toggle in the chat control bar:

| Mode | Purpose | Default approval |
|------|---------|-----------------|
| **CTF** | Flag hunting, aggressive, brute-force OK | Auto-run |
| **Audit** | Structured pentest, CVSS logging, scope-aware | Ask |
| **Neutral** | General assistant | Ask |

## Approval System

When the AI wants to run a command or write a file, you'll see an approval banner:

- **Commands**: Approve, deny, or edit before execution
- **File writes**: Cursor-style diff view, approve/deny per file
- **Tools**: web_search, web_fetch, etc. require approval in "ask" mode

You can switch to "auto-run" mode to skip approvals (use with caution).

## Project Structure

Each project is scoped to one or more Exegol containers. Projects store:
- Chat sessions and history
- Terminal layout
- File browser state
- Agent mode preference

All data is stored in browser localStorage (no external database).

## MCP Servers

Exegol IHE supports Model Context Protocol servers to extend AI capabilities. See [docs/mcp-security.md](./mcp-security.md) for the security model.

Config is stored in `.exegol-ihe/mcp-servers.json` at the project root.
