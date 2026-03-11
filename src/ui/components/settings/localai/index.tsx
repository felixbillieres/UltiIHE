/**
 * Local AI settings panel.
 * Hardware detection, binary install, model catalog with filters, server control, custom endpoints.
 */

import { useState, useEffect } from "react"
import { useLocalAIStore } from "../../../stores/localAI"
import { useSettingsStore } from "../../../stores/settings"
import { Loader2, AlertTriangle } from "lucide-react"
import { HardwareSection } from "./HardwareSection"
import { BinarySection } from "./BinarySection"
import { ServerSection } from "./ServerSection"
import { ModelCatalog } from "./ModelCatalog"
import { CustomEndpoints } from "./CustomEndpoints"

export function LocalAISettings() {
  const {
    hardware,
    binary,
    catalog,
    server,
    downloads,
    loading,
    binaryInstalling,
    fetchAll,
    installBinary,
    downloadModel,
    cancelDownload,
    deleteModel,
    startServer,
    stopServer,
  } = useLocalAIStore()

  const { addProvider, updateProvider, providers, setActiveProvider, setActiveModel } = useSettingsStore()

  const binaryProgress = useLocalAIStore((s) => s.binaryProgress)
  const [startingModel, setStartingModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Auto-register local provider when server starts
  useEffect(() => {
    if (server.running && server.modelId) {
      const existing = providers.find((p) => p.id === "local")
      if (!existing) {
        addProvider({
          id: "local",
          name: "Local AI",
          type: "local",
          apiKey: "local",
          enabled: true,
          models: [server.modelId],
        })
      } else {
        updateProvider("local", {
          enabled: true,
          models: [server.modelId],
        })
      }
    }
  }, [server.running, server.modelId])

  const handleStartServer = async (modelId: string) => {
    setStartingModel(modelId)
    setError(null)
    try {
      await startServer(modelId)
      setActiveProvider("local")
      setActiveModel(modelId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setStartingModel(null)
    }
  }

  const handleStopServer = async () => {
    await stopServer()
    updateProvider("local", { enabled: false })
  }

  if (loading && !hardware) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Custom endpoints — top of page */}
      <CustomEndpoints />

      {/* Hardware info */}
      <HardwareSection hardware={hardware} />

      {/* Binary status */}
      <BinarySection
        binary={binary}
        installing={binaryInstalling}
        progress={binaryProgress}
        onInstall={installBinary}
      />

      {/* Server status */}
      {binary?.installed && (
        <ServerSection
          server={server}
          startingModel={startingModel}
          onStop={handleStopServer}
        />
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-error/10 border border-status-error/20">
          <AlertTriangle className="w-3.5 h-3.5 text-status-error shrink-0" />
          <span className="text-xs text-status-error font-sans">{error}</span>
        </div>
      )}

      {/* Model catalog with filters */}
      {binary?.installed && (
        <ModelCatalog
          catalog={catalog}
          downloads={downloads}
          server={server}
          startingModel={startingModel}
          onDownload={downloadModel}
          onCancel={cancelDownload}
          onDelete={deleteModel}
          onStart={handleStartServer}
        />
      )}
    </div>
  )
}
