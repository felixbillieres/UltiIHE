# Troubleshooting

## Docker not available

**Symptom**: `[Exegol IHE] WARNING: Docker is not available` at startup.

**Fix**:
- Ensure Docker is installed and the daemon is running: `docker info`
- On Linux, your user needs Docker socket access:
  ```bash
  sudo usermod -aG docker $USER
  # Log out and back in (full session logout)
  ```
- On Fedora, use sudo: `sudo -E $(which bun) run dev:all`

## No containers listed

**Symptom**: The project creation screen shows no Exegol containers.

**Fix**:
- Start an Exegol container first: `exegol start mylab`
- Verify it's running: `docker ps | grep exegol`
- The container must be running (not just created)

## API key errors

**Symptom**: `401 Unauthorized` or `Invalid API key` in chat.

**Fix**:
- Go to Settings > Providers and verify your key
- Some providers need specific env vars (e.g., `ANTHROPIC_API_KEY`). Check `.env.example`
- Keys set in `.env` take precedence over UI-configured keys

## Empty AI responses

**Symptom**: The AI returns an empty message.

**Possible causes**:
- Model does not support tool use (some smaller models). Try a different model.
- Rate limiting from the provider. Wait and retry.
- Context window exceeded. The app will auto-compact, but very long sessions may need a manual `/compact`.

## WebSocket disconnects

**Symptom**: Terminals freeze, "Disconnected" status.

**Fix**:
- The WebSocket auto-reconnects with exponential backoff (up to 5 retries)
- If the server crashed, restart with `bun run dev:all`
- Check the server console for errors

## Terminal output not showing

**Symptom**: Terminal is created but shows no output.

**Fix**:
- The terminal uses `bun-pty` for PTY management. Verify bun version >= 1.0.
- Check that the container is running: `docker ps`
- Try creating a new terminal

## Build failures

**Symptom**: `bun run build` fails.

**Fix**:
- Run `bunx tsc --noEmit` first to catch type errors
- Ensure all dependencies are installed: `bun install`
- Clear Vite cache: `rm -rf node_modules/.vite`

## Port already in use

**Symptom**: `EADDRINUSE: address already in use :3001`

**Fix**:
```bash
# Find what's using the port
lsof -i :3001
# Kill it
kill -9 <PID>
```

## Performance issues

- **Large terminal output**: The ring buffer is capped at 1000 lines per terminal. Excessive output from tools like `nmap -v` is truncated.
- **Many terminals**: Each terminal is a PTY process. Close terminals you're not using.
- **Context overflow**: Watch the token counter in the status bar. Use `/compact` to summarize and free context.
