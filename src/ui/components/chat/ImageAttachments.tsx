import { useState } from "react"
import { type ImageAttachment } from "../../stores/chatContext"
import { X, ZoomIn } from "lucide-react"

export function ImageAttachments({
  images,
  onRemove,
}: {
  images: ImageAttachment[]
  onRemove: (id: string) => void
}) {
  const [lightbox, setLightbox] = useState<ImageAttachment | null>(null)

  if (images.length === 0) return null

  return (
    <>
      <div className="px-3 pt-2 flex gap-2 flex-wrap">
        {images.map((img) => (
          <div
            key={img.id}
            className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border-weak bg-surface-0 cursor-pointer"
            onClick={() => setLightbox(img)}
          >
            <img
              src={img.dataUrl}
              alt={img.filename}
              className="w-full h-full object-cover"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="w-4 h-4 text-white" />
            </div>
            {/* Remove button */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(img.id) }}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-surface-0/80 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5 text-text-weak" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-surface-0/80 px-1 py-0.5">
              <span className="text-[8px] text-text-weak font-sans truncate block">
                {img.filename}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox modal */}
      {lightbox && (
        <ImageLightbox image={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}

function ImageLightbox({
  image,
  onClose,
}: {
  image: ImageAttachment
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={image.dataUrl}
          alt={image.filename}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/70 font-sans">
            {image.filename}
          </span>
          <span className="text-[10px] text-white/40 font-sans">
            {(image.size / 1024).toFixed(1)} KB
          </span>
        </div>
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 p-1.5 rounded-full bg-surface-2 border border-border-weak hover:bg-surface-3 transition-colors"
        >
          <X className="w-4 h-4 text-text-weak" />
        </button>
      </div>
    </div>
  )
}
