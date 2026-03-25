/**
 * Exegol History panel — credentials, hosts, and env vars from exh.
 * Rendered inside the bottom panel as a tab.
 */

import { useState, useEffect, useCallback } from "react"
import { useExhStore, type ExhTab, type ExhCredential, type ExhHost } from "../../stores/exh"
import {
  KeyRound, Server, Terminal, RefreshCw, Plus, Trash2, Copy, Loader2, AlertCircle, ShieldOff,
} from "lucide-react"
import { toast } from "sonner"

// ── Sub-tab button ───────────────────────────────────────────

function SubTab({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-sans font-medium transition-colors ${
        active ? "bg-accent/10 text-accent" : "text-text-weaker hover:text-text-weak hover:bg-surface-2"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-[9px] px-1 rounded-full ${active ? "bg-accent/20" : "bg-surface-3"}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ── Creds table ──────────────────────────────────────────────

function CredsTable({ creds, container, onRefresh }: {
  creds: ExhCredential[]; container: string; onRefresh: () => void
}) {
  const deleteCred = useExhStore((s) => s.deleteCred)

  const copyToClipboard = (text: string | null, label: string) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`))
  }

  if (creds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-weaker text-xs font-sans">
        No credentials stored. Use <code className="mx-1 px-1 py-0.5 bg-surface-2 rounded text-[10px]">exh add creds</code> or the + button.
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-[11px] font-sans">
        <thead className="sticky top-0 bg-surface-1 z-10">
          <tr className="text-text-weaker text-left">
            <th className="px-2 py-1.5 font-medium w-8">#</th>
            <th className="px-2 py-1.5 font-medium">Username</th>
            <th className="px-2 py-1.5 font-medium">Password</th>
            <th className="px-2 py-1.5 font-medium">Hash</th>
            <th className="px-2 py-1.5 font-medium">Domain</th>
            <th className="px-2 py-1.5 font-medium w-16"></th>
          </tr>
        </thead>
        <tbody>
          {creds.map((cred, idx) => (
            <tr
              key={`${cred.username}-${cred.domain}-${idx}`}
              className="border-t border-border-weak/30 hover:bg-surface-2/50 transition-colors"
            >
              <td className="px-2 py-1 text-text-weaker tabular-nums">{idx + 1}</td>
              <td className="px-2 py-1 text-text-base font-mono">
                {cred.username || <span className="text-text-weaker">-</span>}
              </td>
              <td className="px-2 py-1 font-mono">
                {cred.password ? (
                  <PasswordCell value={cred.password} />
                ) : (
                  <span className="text-text-weaker">-</span>
                )}
              </td>
              <td className="px-2 py-1 font-mono text-text-weak truncate max-w-[140px]" title={cred.hash}>
                {cred.hash || <span className="text-text-weaker">-</span>}
              </td>
              <td className="px-2 py-1 text-accent/80">
                {cred.domain || <span className="text-text-weaker">-</span>}
              </td>
              <td className="px-2 py-1">
                <div className="flex items-center gap-0.5">
                  {cred.username && (
                    <button
                      onClick={() => copyToClipboard(cred.username, "Username")}
                      className="p-0.5 rounded hover:bg-surface-3 text-text-weaker hover:text-text-weak transition-colors"
                      title="Copy username"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                  {cred.password && (
                    <button
                      onClick={() => copyToClipboard(cred.password, "Password")}
                      className="p-0.5 rounded hover:bg-surface-3 text-text-weaker hover:text-green-400 transition-colors"
                      title="Copy password"
                    >
                      <KeyRound className="w-3 h-3" />
                    </button>
                  )}
                  {cred.hash && (
                    <button
                      onClick={() => copyToClipboard(cred.hash, "Hash")}
                      className="p-0.5 rounded hover:bg-surface-3 text-text-weaker hover:text-orange-400 transition-colors"
                      title="Copy hash"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (await deleteCred(container, cred)) {
                        toast.success(`Credential deleted from ${container}`)
                      }
                    }}
                    className="p-0.5 rounded hover:bg-red-500/10 text-text-weaker hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Password cell (click to reveal) ─────────────────────────

function PasswordCell({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <button
      onClick={() => setRevealed(!revealed)}
      className="text-left font-mono hover:text-accent transition-colors"
      title={revealed ? "Click to hide" : "Click to reveal"}
    >
      {revealed ? value : "••••••••"}
    </button>
  )
}

// ── Hosts table ──────────────────────────────────────────────

function HostsTable({ hosts, container }: {
  hosts: ExhHost[]; container: string
}) {
  const deleteHost = useExhStore((s) => s.deleteHost)

  const copyToClipboard = (text: string | null, label: string) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`))
  }

  const roleColor = (role: string | null) => {
    if (!role) return "text-text-weaker"
    switch (role.toUpperCase()) {
      case "DC": return "text-red-400"
      case "MSSQL": return "text-orange-400"
      case "ADCS": return "text-yellow-400"
      case "SCCM": return "text-purple-400"
      default: return "text-blue-400"
    }
  }

  if (hosts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-weaker text-xs font-sans">
        No hosts stored. Use <code className="mx-1 px-1 py-0.5 bg-surface-2 rounded text-[10px]">exh add hosts</code> or the + button.
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-[11px] font-sans">
        <thead className="sticky top-0 bg-surface-1 z-10">
          <tr className="text-text-weaker text-left">
            <th className="px-2 py-1.5 font-medium w-8">#</th>
            <th className="px-2 py-1.5 font-medium">IP</th>
            <th className="px-2 py-1.5 font-medium">Hostname</th>
            <th className="px-2 py-1.5 font-medium">Role</th>
            <th className="px-2 py-1.5 font-medium w-16"></th>
          </tr>
        </thead>
        <tbody>
          {hosts.map((host, idx) => (
            <tr
              key={`${host.ip}-${host.hostname}-${idx}`}
              className="border-t border-border-weak/30 hover:bg-surface-2/50 transition-colors"
            >
              <td className="px-2 py-1 text-text-weaker tabular-nums">{idx + 1}</td>
              <td className="px-2 py-1 text-text-base font-mono">{host.ip || <span className="text-text-weaker">-</span>}</td>
              <td className="px-2 py-1 font-mono text-text-weak">{host.hostname || <span className="text-text-weaker">-</span>}</td>
              <td className="px-2 py-1">
                {host.role ? (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold ${roleColor(host.role)} bg-surface-2`}>
                    {host.role.toUpperCase()}
                  </span>
                ) : (
                  <span className="text-text-weaker">-</span>
                )}
              </td>
              <td className="px-2 py-1">
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => copyToClipboard(host.ip, "IP")}
                    className="p-0.5 rounded hover:bg-surface-3 text-text-weaker hover:text-text-weak transition-colors"
                    title="Copy IP"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={async () => {
                      if (await deleteHost(container, host)) {
                        toast.success("Host deleted")
                      }
                    }}
                    className="p-0.5 rounded hover:bg-red-500/10 text-text-weaker hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Env vars view ────────────────────────────────────────────

function EnvView({ env }: { env: Record<string, string> }) {
  const entries = Object.entries(env)
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-weaker text-xs font-sans">
        No environment variables set. Use <code className="mx-1 px-1 py-0.5 bg-surface-2 rounded text-[10px]">exh set creds/hosts</code> to activate.
      </div>
    )
  }
  return (
    <div className="overflow-auto h-full p-2">
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <span className="text-[11px] font-mono text-accent/80">${key}</span>
            <span className="text-[11px] font-mono text-text-base">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Add modal ────────────────────────────────────────────────

function AddModal({ type, container, onClose }: {
  type: "creds" | "hosts"; container: string; onClose: () => void
}) {
  const addCred = useExhStore((s) => s.addCred)
  const addHost = useExhStore((s) => s.addHost)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const credFields = ["username", "password", "hash", "domain"]
  const hostFields = ["ip", "hostname", "role"]
  const activeFields = type === "creds" ? credFields : hostFields

  const hasRequiredFields = type === "creds"
    ? !!(fields.username || fields.password || fields.hash)
    : !!(fields.ip || fields.hostname)

  const handleSave = async () => {
    if (!hasRequiredFields) return
    setSaving(true)
    const ok = type === "creds"
      ? await addCred(container, fields)
      : await addHost(container, fields)
    setSaving(false)
    if (ok) {
      toast.success(`${type === "creds" ? "Credential" : "Host"} added to ${container}`)
      onClose()
    } else {
      toast.error("Failed to add")
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface-1 border border-border-base rounded-xl shadow-2xl w-80 p-4">
        <h3 className="text-sm font-sans font-semibold text-text-strong mb-3">
          Add {type === "creds" ? "Credential" : "Host"}
        </h3>
        <div className="space-y-2">
          {activeFields.map((field) => (
            <div key={field}>
              <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wider">{field}</label>
              <input
                type={field === "password" ? "password" : "text"}
                value={fields[field] || ""}
                onChange={(e) => setFields({ ...fields, [field]: e.target.value })}
                className="w-full mt-0.5 px-2 py-1.5 text-xs bg-surface-0 border border-border-base rounded-lg text-text-base focus:outline-none focus:border-accent/50 font-mono"
                placeholder={field === "role" ? "DC, WKS, MSSQL, ADCS..." : ""}
                autoFocus={field === activeFields[0]}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || !hasRequiredFields}
            className="flex-1 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-sans font-medium disabled:opacity-40"
          >
            {saving ? "Adding..." : "Add"}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-weak hover:bg-surface-2 rounded-lg transition-colors font-sans"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main panel ───────────────────────────────────────────────

export function ExhPanel({ containerIds }: { containerIds: string[] }) {
  const {
    creds, hosts, env, activeTab, activeContainer, loading, error, available,
    setActiveTab, setActiveContainer, fetchAll, checkAvailable,
  } = useExhStore()

  const [showAdd, setShowAdd] = useState<"creds" | "hosts" | null>(null)
  const container = activeContainer || containerIds[0] || null

  // Auto-select first container on mount
  useEffect(() => {
    if (!activeContainer && containerIds.length > 0) {
      setActiveContainer(containerIds[0])
    }
  }, [activeContainer, containerIds, setActiveContainer])

  // Fetch when container or availability changes
  useEffect(() => {
    if (!container || available !== true) return
    fetchAll(container)
  }, [container, available, fetchAll])

  const handleRefresh = useCallback(() => {
    if (container) fetchAll(container)
  }, [container, fetchAll])

  // No container
  if (!container) {
    return (
      <div className="flex items-center justify-center h-full text-text-weaker text-xs font-sans gap-2">
        <AlertCircle className="w-4 h-4" />
        No container linked to this project
      </div>
    )
  }

  // Not available
  if (available === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-text-weaker text-xs font-sans">
        <ShieldOff className="w-5 h-5" />
        <span>exegol-history not available in this container</span>
        <span className="text-[10px] text-text-weaker/60">
          The AI will still track findings in the chat. Install exh in your Exegol image for structured storage.
        </span>
      </div>
    )
  }

  // Loading initial check
  if (available === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-4 h-4 text-text-weaker animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border-weak/50 shrink-0">
        {/* Container selector / label */}
        {containerIds.length > 1 ? (
          <select
            value={container || ""}
            onChange={(e) => setActiveContainer(e.target.value)}
            className="text-[10px] font-sans font-medium px-1.5 py-0.5 rounded bg-surface-2 border border-border-weak text-text-base focus:outline-none focus:border-accent/50 mr-1"
          >
            {containerIds.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : container && (
          <span className="text-[10px] font-sans text-text-weaker mr-1 px-1.5 py-0.5 rounded bg-surface-2">
            {container}
          </span>
        )}
        <SubTab
          active={activeTab === "creds"}
          onClick={() => setActiveTab("creds")}
          icon={<KeyRound className="w-3 h-3" />}
          label="Creds"
          count={creds.length}
        />
        <SubTab
          active={activeTab === "hosts"}
          onClick={() => setActiveTab("hosts")}
          icon={<Server className="w-3 h-3" />}
          label="Hosts"
          count={hosts.length}
        />
        <SubTab
          active={activeTab === "env"}
          onClick={() => setActiveTab("env")}
          icon={<Terminal className="w-3 h-3" />}
          label="Env"
          count={Object.keys(env).length}
        />

        <div className="flex-1" />

        {/* Actions */}
        {activeTab !== "env" && (
          <button
            onClick={() => setShowAdd(activeTab as "creds" | "hosts")}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans text-accent hover:bg-accent/10 transition-colors"
            title={`Add ${activeTab === "creds" ? "credential" : "host"}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans text-text-weaker hover:text-text-weak hover:bg-surface-2 transition-colors disabled:opacity-40"
          title="Refresh data"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "creds" && (
          <CredsTable creds={creds} container={container} onRefresh={handleRefresh} />
        )}
        {activeTab === "hosts" && (
          <HostsTable hosts={hosts} container={container} />
        )}
        {activeTab === "env" && (
          <EnvView env={env} />
        )}
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-2 py-1 bg-red-500/10 text-red-400 text-[10px] font-sans border-t border-red-500/20">
          {error}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddModal
          type={showAdd}
          container={container}
          onClose={() => setShowAdd(null)}
        />
      )}
    </div>
  )
}
