import { useState } from "react"
import {
  useExegolStore,
  type ExegolImage,
} from "../../stores/exegol"
import {
  Trash2,
  RefreshCw,
  Download,
} from "lucide-react"
import { ActionBtn } from "./exegolFormComponents"

export function ImageSection({ images }: { images: ExegolImage[] }) {
  const actionLoading = useExegolStore((s) => s.actionLoading)
  const installImage = useExegolStore((s) => s.installImage)
  const updateImage = useExegolStore((s) => s.updateImage)
  const uninstallImage = useExegolStore((s) => s.uninstallImage)
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null)

  if (images.length === 0) {
    return (
      <div className="p-4 text-center py-8 text-xs text-text-weaker font-sans">
        No images found.
      </div>
    )
  }

  return (
    <div className="p-4">
      <p className="text-xs text-text-weaker font-sans mb-3">
        Exegol images available on this system. Install images to create containers from them.
      </p>

      <div className="border border-border-weak rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_1fr_120px] gap-2 px-3 py-1.5 bg-surface-2 text-[10px] text-text-weaker uppercase tracking-wide font-sans font-medium">
          <span>Image</span>
          <span>Size</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {images.map((img) => {
          const statusLower = img.status.toLowerCase()
          const isInstalled = !statusLower.includes("not installed")
          const hasUpdate = statusLower.includes("update available")
          const isConfirming = confirmUninstall === img.name
          const isUninstalling = actionLoading === `${img.name}-uninstall`
          const isInstalling = actionLoading === `${img.name}-install`
          const isUpdating = actionLoading === `${img.name}-update`

          return (
            <div
              key={img.name}
              className="grid grid-cols-[1fr_80px_1fr_120px] gap-2 px-3 py-2 border-t border-border-weak items-center group hover:bg-surface-2/50 transition-colors"
            >
              <span className="text-xs text-text-strong font-mono">
                {img.name}
              </span>
              <span className="text-xs text-text-weak">
                {img.size || "-"}
              </span>
              <span
                className={`text-xs ${
                  hasUpdate
                    ? "text-amber-400"
                    : isInstalled
                      ? "text-status-success"
                      : "text-text-weaker"
                }`}
              >
                {img.status}
              </span>

              <div className="flex items-center gap-1 justify-end">
                {isConfirming ? (
                  <>
                    <span className="text-[10px] text-status-error mr-1 font-sans">
                      Uninstall?
                    </span>
                    <button
                      onClick={() => {
                        uninstallImage(img.name, true)
                        setConfirmUninstall(null)
                      }}
                      className="px-1.5 py-0.5 text-[10px] bg-status-error/20 text-status-error rounded hover:bg-status-error/30 font-sans"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmUninstall(null)}
                      className="px-1.5 py-0.5 text-[10px] text-text-weaker hover:text-text-weak font-sans"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <>
                    {!isInstalled && (
                      <ActionBtn
                        onClick={() => installImage(img.name)}
                        loading={isInstalling}
                        title="Install image"
                        className="text-status-success hover:bg-status-success/10"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </ActionBtn>
                    )}
                    {hasUpdate && (
                      <ActionBtn
                        onClick={() => updateImage(img.name)}
                        loading={isUpdating}
                        title="Update image"
                        className="text-amber-400 hover:bg-amber-400/10"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </ActionBtn>
                    )}
                    {isInstalled && (
                      <ActionBtn
                        onClick={() => setConfirmUninstall(img.name)}
                        loading={isUninstalling}
                        title="Uninstall image"
                        className="text-status-error hover:bg-status-error/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </ActionBtn>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
