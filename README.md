# Exegol IHE — Interactive Hacking Environment

AI-native pentest IDE built around [Exegol](https://exegol.readthedocs.io/) containers. Terminals are first-class citizens — the AI copilot sees, understands, and interacts with your shells in real time.

## Prerequisites

- [Bun](https://bun.sh) (runtime & package manager)
- [Docker](https://docs.docker.com/get-docker/) with at least one Exegol container running
- An AI provider API key (Anthropic, OpenAI, Google, etc.)

### Docker permissions

The server needs access to Docker to manage Exegol containers.

**Option A — Docker group (Debian/Ubuntu):**
```bash
sudo usermod -aG docker $USER
# Then log out and log back in (full session logout, not just reboot)
```

**Option B — sudo (Fedora, recommended by Exegol docs):**

On Fedora the docker group approach often fails. Use sudo instead:
```bash
# Add exegol alias
echo "alias exegol='sudo -E \$HOME/.local/bin/exegol'" >> ~/.bashrc  # or ~/.zshrc

# Run the app with sudo (use full bun path since sudo resets PATH)
sudo -E $(which bun) run dev:all
```

## Quick Start

```bash
# Clone
git clone https://github.com/felixbillieres/UltiIHE.git
cd UltiIHE

# Install dependencies
bun install

# Start both the backend server and frontend dev server
bun run dev:all
# On Fedora (if Docker needs sudo):
# sudo -E $(which bun) run dev:all
```

The app opens at **http://localhost:5173**. The backend API runs on port **3001**.

On first launch, go to **Settings > Providers** to add an API key, then select your model in the chat bar.

## What It Does

- **Terminal multiplexer** — split, rename, group terminals running inside Exegol containers
- **AI copilot** — the AI reads terminal output, proposes commands, and can inject them with your approval
- **Multi-provider** — 13+ cloud providers (Anthropic, OpenAI, Google, Groq, etc.) + local models via llama.cpp
- **Web tools** — launch Desktop (noVNC), Caido, BloodHound directly in the UI, per-container
- **File browser** — browse and edit files inside containers with a built-in Monaco editor
- **Per-project sessions** — each project maps to an Exegol container with its own chat history

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Frontend dev server (Vite) |
| `bun run dev:server` | Backend server with hot reload |
| `bun run dev:all` | Both concurrently |
| `bun run build` | Production frontend build |
| `bun run typecheck` | TypeScript type checking |

## Stack

TypeScript · React 18 · Hono · Vercel AI SDK · xterm.js · Zustand · Tailwind CSS · Bun
