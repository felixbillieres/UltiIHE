/**
 * Local AI settings panel.
 * Hardware detection, binary install, model catalog with filters, server control, custom endpoints.
 */

import { useEffect } from "react"
import { useLocalAIStore } from "../../../stores/localAI"
import { useSettingsStore } from "../../../stores/settings"
import { Loader2, AlertTriangle, X } from "lucide-react"
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
    serverStarting,
    serverError,
    fetchAll,
    installBinary,
    downloadModel,
    cancelDownload,
    deleteModel,
    startServer,
    stopServer,
    clearServerError,
  } = useLocalAIStore()

  const { addProvider, updateProvider, providers, setActiveProvider, setActiveModel } = useSettingsStore()

  const binaryProgress = useLocalAIStore((s) => s.binaryProgress)

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
    clearServerError()
    try {
      await startServer(modelId)
      setActiveProvider("local")
      setActiveModel(modelId)
    } catch {
      // Error is already in store
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
          startingModel={serverStarting}
          onStop={handleStopServer}
        />
      )}

      {/* Server error */}
      {serverError && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-status-error/10 border border-status-error/20">
          <AlertTriangle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-status-error font-sans font-medium mb-0.5">Server failed to start</p>
            <p className="text-[10px] text-status-error/80 font-sans">{serverError}</p>
          </div>
          <button onClick={clearServerError} className="p-0.5 rounded hover:bg-status-error/10 transition-colors shrink-0">
            <X className="w-3 h-3 text-status-error" />
          </button>
        </div>
      )}

      {/* Model catalog with filters */}
      {binary?.installed && (
        <ModelCatalog
          catalog={catalog}
          downloads={downloads}
          server={server}
          startingModel={serverStarting}
          onDownload={downloadModel}
          onCancel={cancelDownload}
          onDelete={deleteModel}
          onStart={handleStartServer}
        />
      )}
    </div>
  )
}
