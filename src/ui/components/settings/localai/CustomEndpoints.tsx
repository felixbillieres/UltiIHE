import { useState } from "react"
import { Trash2, Play, Globe, Plus } from "lucide-react"
import { useSettingsStore } from "../../../stores/settings"
import { Section } from "./Section"

export function CustomEndpoints() {
  const { providers, addProvider, removeProvider, setActiveProvider, setActiveModel } = useSettingsStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")

  const customProviders = providers.filter((p) => p.type === "custom")

  const handleAdd = () => {
    if (!name.trim() || !url.trim() || !model.trim()) return

    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`
    addProvider({
      id,
      name: name.trim(),
      type: "custom",
      apiKey: apiKey.trim() || "none",
      baseUrl: url.trim(),
      enabled: true,
      models: [model.trim()],
    })

    setName("")
    setUrl("")
    setApiKey("")
    setModel("")
    setAdding(false)
  }

  const handleUse = (provider: typeof customProviders[0]) => {
    setActiveProvider(provider.id)
    setActiveModel(provider.models[0])
  }

  return (
    <Section title="Custom Endpoints">
      <p className="text-[10px] text-text-weaker font-sans mb-3 px-1">
        Connect to any OpenAI-compatible API — homelab server, Mac Mini cluster, Ollama, vLLM, text-generation-webui, etc.
      </p>

      {/* Existing custom endpoints */}
      {customProviders.length > 0 && (
        <div className="space-y-1 mb-3">
          {customProviders.map((cp) => (
            <div
              key={cp.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-0 border border-border-weak"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-3.5 h-3.5 text-accent shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs text-text-base font-sans font-medium truncate">{cp.name}</div>
                  <div className="text-[10px] text-text-weaker font-mono truncate">{cp.baseUrl}</div>
                  <div className="text-[10px] text-text-weaker font-sans">
                    Model: <span className="font-mono">{cp.models[0]}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleUse(cp)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-accent/15 text-accent rounded-md hover:bg-accent/25 transition-colors font-sans font-medium"
                >
                  <Play className="w-2.5 h-2.5" />
                  Use
                </button>
                <button
                  onClick={() => removeProvider(cp.id)}
                  className="p-1 rounded hover:bg-surface-2 transition-colors"
                  title="Remove endpoint"
                >
                  <Trash2 className="w-3 h-3 text-text-weaker hover:text-status-error" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div className="space-y-2 p-3 rounded-lg bg-surface-0 border border-border-weak">
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My homelab server"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-sans placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">Base URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:8080"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-mono placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">Model name</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="llama3.1:8b or any model ID"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-mono placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-weaker font-sans uppercase tracking-wide block mb-1">
              API Key <span className="normal-case">(optional)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-... (leave empty if not required)"
              className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border-weak rounded-md text-text-base font-mono placeholder:text-text-weaker/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!name.trim() || !url.trim() || !model.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-accent text-white rounded-md hover:bg-accent-hover transition-colors font-sans font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3" />
              Add Endpoint
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-2 text-text-base rounded-md hover:bg-surface-3 transition-colors font-sans"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-[10px] bg-surface-0 border border-border-weak border-dashed text-text-weak rounded-lg hover:border-accent hover:text-accent transition-colors font-sans w-full justify-center"
        >
          <Plus className="w-3 h-3" />
          Add Custom Endpoint
        </button>
      )}
    </Section>
  )
}
