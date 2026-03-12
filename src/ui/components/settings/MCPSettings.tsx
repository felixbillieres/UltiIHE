import { useState, useEffect } from "react"
import { useMCPStore, type MCPServerConfig, type MCPTransportType } from "../../stores/mcp"
import { Section } from "./SettingsSection"
import { Plus, Trash2, RefreshCw, Terminal, Globe, Wifi, WifiOff, ChevronDown } from "lucide-react"

export function MCPSettings() {
  const { servers, loading, fetchServers, addServer, removeServer, reconnectServer } = useMCPStore()
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  return (
    <div className="space-y-6">
      <Section title="MCP Servers">
        {loading && servers.length === 0 && (
          <p className="text-xs text-text-weaker font-sans">Loading...</p>
        )}

        {servers.length === 0 && !loading && (
          <p className="text-xs text-text-weaker font-sans">
            No MCP servers configured. Add a server to expose its tools to the AI.
          </p>
        )}

        <div className="space-y-2">
          {servers.map((sv) => (
            <MCPServerCard
              key={sv.config.id}
              server={sv}
              onRemove={() => removeServer(sv.config.id)}
              onReconnect={() => reconnectServer(sv.config.id)}
            />
          ))}
        </div>

        <button
          onClick={() => setShowAdd(true)}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans bg-surface-0 border border-border-weak hover:border-border-base text-text-weak hover:text-text-base transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add server
        </button>
      </Section>

      {showAdd && (
        <AddServerDialog
          onClose={() => setShowAdd(false)}
          onAdd={async (config) => {
            await addServer(config)
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

function MCPServerCard({
  server,
  onRemove,
  onReconnect,
}: {
  server: { config: MCPServerConfig; status: string; error?: string; tools: { name: string; description: string }[] }
  onRemove: () => void
  onReconnect: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const statusColors: Record<string, string> = {
    connected: "text-status-success",
    connecting: "text-status-warning",
    error: "text-status-error",
    disconnected: "text-text-weaker",
  }

  return (
    <div className="rounded-lg border border-border-weak bg-surface-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${server.status === "connected" ? "bg-status-success" : server.status === "error" ? "bg-status-error" : "bg-text-weaker"}`} />
        <span className="text-xs text-text-base font-sans font-medium flex-1 truncate">{server.config.name}</span>
        <span className={`text-[10px] font-sans ${statusColors[server.status] || "text-text-weaker"}`}>
          {server.status}
        </span>
        {server.tools.length > 0 && (
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-surface-2 rounded transition-colors">
            <ChevronDown className={`w-3 h-3 text-text-weaker transition-transform ${expanded ? "" : "-rotate-90"}`} />
          </button>
        )}
        <button onClick={onReconnect} className="p-1 hover:bg-surface-2 rounded transition-colors" title="Reconnect">
          <RefreshCw className="w-3 h-3 text-text-weaker" />
        </button>
        <button onClick={onRemove} className="p-1 hover:bg-surface-2 rounded transition-colors" title="Remove">
          <Trash2 className="w-3 h-3 text-status-error/60" />
        </button>
      </div>

      {server.error && (
        <div className="px-3 py-1.5 text-[10px] text-status-error font-sans border-t border-border-weak bg-status-error/5">
          {server.error}
        </div>
      )}

      {expanded && server.tools.length > 0 && (
        <div className="border-t border-border-weak px-3 py-2 space-y-1">
          <span className="text-[10px] text-text-weaker font-sans">{server.tools.length} tool(s)</span>
          {server.tools.map((tool) => (
            <div key={tool.name} className="text-[11px] font-sans">
              <span className="text-text-base font-mono">{tool.name}</span>
              {tool.description && (
                <span className="text-text-weaker ml-1.5">{tool.description.slice(0, 80)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="px-3 py-1 border-t border-border-weak/50 text-[10px] text-text-weaker font-sans flex gap-2">
        <span className="font-mono">{server.config.transport}</span>
        {server.config.command && <span className="truncate">{server.config.command} {(server.config.args || []).join(" ")}</span>}
        {server.config.url && <span className="truncate">{server.config.url}</span>}
      </div>
    </div>
  )
}

function AddServerDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (config: MCPServerConfig) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [transport, setTransport] = useState<MCPTransportType>("stdio")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [url, setUrl] = useState("")
  const [envText, setEnvText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) return
    if (transport === "stdio" && !command.trim()) return
    if ((transport === "sse" || transport === "streamable-http") && !url.trim()) return

    setSubmitting(true)

    const env: Record<string, string> = {}
    for (const line of envText.split("\n")) {
      const eq = line.indexOf("=")
      if (eq > 0) {
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      }
    }

    await onAdd({
      id: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: name.trim(),
      transport,
      ...(transport === "stdio" ? {
        command: command.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        env: Object.keys(env).length > 0 ? env : undefined,
      } : {
        url: url.trim(),
      }),
    })
    setSubmitting(false)
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-surface-0 p-4 space-y-3">
      <h4 className="text-xs font-medium text-text-strong font-sans">Add MCP Server</h4>

      {/* Name */}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Server name"
        className="w-full text-xs bg-surface-1 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-sans"
      />

      {/* Transport */}
      <div className="flex gap-2">
        {(["stdio", "sse", "streamable-http"] as MCPTransportType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTransport(t)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-sans transition-colors ${
              transport === t
                ? "bg-accent/8 text-accent border border-accent/30"
                : "bg-surface-1 text-text-weak border border-border-weak"
            }`}
          >
            {t === "stdio" ? <Terminal className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
            {t}
          </button>
        ))}
      </div>

      {/* Transport-specific fields */}
      {transport === "stdio" ? (
        <>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Command (e.g. npx, uvx, node)"
            className="w-full text-xs bg-surface-1 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-mono"
          />
          <input
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="Arguments (space-separated)"
            className="w-full text-xs bg-surface-1 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-mono"
          />
          <textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            placeholder="Environment variables (KEY=value, one per line)"
            rows={2}
            className="w-full text-xs bg-surface-1 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-mono resize-none"
          />
        </>
      ) : (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Server URL"
          className="w-full text-xs bg-surface-1 border border-border-base rounded-lg px-2.5 py-1.5 text-text-base focus:outline-none focus:border-accent/50 font-mono"
        />
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs font-sans text-text-weak hover:text-text-base transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg text-xs font-sans bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {submitting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  )
}
