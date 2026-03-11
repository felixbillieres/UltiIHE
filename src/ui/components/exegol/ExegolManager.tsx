import { useState, useEffect } from "react"
import { useExegolStore } from "../../stores/exegol"
import { type Project } from "../../stores/project"
import {
  Box,
  RefreshCw,
  Loader2,
  X,
  AlertTriangle,
  Info,
} from "lucide-react"
import { ContainerSection } from "./ContainerSection"
import { ImageSection } from "./ImageSection"
import { CreateContainerModal } from "./CreateContainerModal"

interface Props {
  project: Project
  onClose: () => void
  canClose: boolean
}

export function ExegolManager({ project, onClose, canClose }: Props) {
  const {
    containers,
    images,
    version,
    loading,
    error,
    fetchInfo,
  } = useExegolStore()

  const [tab, setTab] = useState<"containers" | "images">("containers")
  const [detailName, setDetailName] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  return (
    <div className="w-full max-w-3xl bg-surface-1 border border-border-base rounded-xl shadow-2xl mx-4 max-h-[85vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-accent" />
          <h3 className="text-sm text-text-strong font-sans font-medium">
            Exegol Manager
          </h3>
          {version && (
            <span className="text-[10px] text-text-weaker font-mono bg-surface-2 px-1.5 py-0.5 rounded">
              {version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchInfo()}
            disabled={loading}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-text-weaker ${loading ? "animate-spin" : ""}`}
            />
          </button>
          {canClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-surface-3 transition-colors"
            >
              <X className="w-4 h-4 text-text-weaker" />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mb-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-status-error/10 border border-status-error/20">
          <AlertTriangle className="w-3.5 h-3.5 text-status-error shrink-0 mt-0.5" />
          <pre className="text-xs text-status-error whitespace-pre-wrap break-words font-sans flex-1 min-w-0">
            {error}
          </pre>
          <button
            onClick={() => useExegolStore.setState({ error: null })}
            className="p-0.5 rounded hover:bg-status-error/20 shrink-0"
          >
            <X className="w-3 h-3 text-status-error" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 px-5 border-b border-border-weak shrink-0">
        <TabButton
          active={tab === "containers"}
          onClick={() => setTab("containers")}
          label={`Containers (${containers.length})`}
        />
        <TabButton
          active={tab === "images"}
          onClick={() => setTab("images")}
          label={`Images (${images.length})`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && containers.length === 0 && images.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-text-weaker animate-spin" />
            <span className="ml-2 text-xs text-text-weaker font-sans">
              Loading exegol info...
            </span>
          </div>
        ) : tab === "containers" ? (
          <ContainerSection
            project={project}
            containers={containers}
            onViewDetail={setDetailName}
            onCreateClick={() => setShowCreate(true)}
          />
        ) : (
          <ImageSection images={images} />
        )}
      </div>

      {/* Detail drawer */}
      {detailName && (
        <ContainerDetailDrawer
          name={detailName}
          onClose={() => setDetailName(null)}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateContainerModal
          images={images}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-sans font-medium transition-colors border-b-2 ${
        active
          ? "text-text-strong border-accent"
          : "text-text-weaker hover:text-text-weak border-transparent"
      }`}
    >
      {label}
    </button>
  )
}

function ContainerDetailDrawer({
  name,
  onClose,
}: {
  name: string
  onClose: () => void
}) {
  const { containerDetail, detailLoading, fetchContainerDetail } =
    useExegolStore()

  useEffect(() => {
    fetchContainerDetail(name)
  }, [name, fetchContainerDetail])

  return (
    <div className="border-t border-border-weak bg-surface-0 max-h-[40vh] overflow-y-auto shrink-0">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border-weak sticky top-0 bg-surface-0">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs text-text-strong font-sans font-medium">
            {name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-3 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-text-weaker" />
        </button>
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 text-text-weaker animate-spin" />
        </div>
      ) : containerDetail ? (
        <div className="p-4 space-y-1.5">
          {Object.entries(containerDetail.fields).map(([key, value]) => (
            <div key={key} className="flex gap-3">
              <span className="text-[10px] text-text-weaker font-sans w-32 shrink-0 text-right pt-0.5">
                {key}
              </span>
              <span className="text-xs text-text-base font-mono whitespace-pre-wrap break-all">
                {value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-xs text-text-weaker font-sans text-center">
          Failed to load details.
        </div>
      )}
    </div>
  )
}
