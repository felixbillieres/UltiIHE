# MCP Security Model

## Overview

Exegol IHE supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers to extend AI tool capabilities. MCP servers can be connected via three transports: **stdio**, **SSE**, and **StreamableHTTP**.

## Trust Model

**MCP servers are fully trusted code.** When you add an MCP server, you are granting it:

- **Stdio transport**: Arbitrary code execution on the **host machine** (not inside Exegol containers). The configured `command` is spawned as a child process with your user's permissions.
- **SSE/HTTP transport**: Network access to whatever endpoint the URL points to.

### What this means

| Transport | Runs where | Risk level | Example |
|-----------|-----------|------------|---------|
| stdio | Host (your machine) | **High** | `npx -y @modelcontextprotocol/server-filesystem /tmp` |
| SSE | Remote server | Medium | `https://mcp.example.com/sse` |
| StreamableHTTP | Remote server | Medium | `https://mcp.example.com/mcp` |

## Security Rules

1. **Only connect MCP servers you trust.** A malicious stdio server config like `{"command": "rm", "args": ["-rf", "/"]}` would execute on your host.

2. **MCP configs are stored locally** in `.ultiIHE/mcp-servers.json` at the project root. Protect this file — anyone who can write to it can execute code on your machine at next startup (auto-reconnect).

3. **Tool arguments from the AI are not re-validated** before being sent to MCP servers. The AI SDK passes tool call arguments directly to `client.callTool()`. MCP servers must validate their own inputs.

4. **There is no MCP server sandboxing.** Unlike AI tools (which run inside Docker containers via `docker exec`), MCP servers run outside the container boundary.

## Recommendations

- Review the `command` and `args` fields before adding any stdio MCP server
- Prefer HTTP-based MCP servers over stdio when possible
- Do not share `.ultiIHE/mcp-servers.json` files from untrusted sources
- If running in a shared environment, restrict file permissions: `chmod 600 .ultiIHE/mcp-servers.json`

## Future Improvements

- Pre-execution Zod validation of tool arguments against discovered schemas
- Optional: run stdio MCP servers inside Exegol containers
- MCP server allowlist/blocklist
