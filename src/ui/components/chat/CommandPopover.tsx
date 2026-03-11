import { useRef, useEffect } from "react"

interface PopoverItem {
  key: string
  icon: React.ReactNode
  title: string
  description?: string
  selected: boolean
  onClick: () => void
}

export function CommandPopover({ items }: { items: PopoverItem[] }) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [items.find((i) => i.selected)?.key])

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-[240px] overflow-y-auto bg-surface-2 border border-border-base rounded-lg shadow-xl py-1">
      {items.map((item) => (
        <button
          key={item.key}
          ref={item.selected ? selectedRef : undefined}
          onClick={item.onClick}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            item.selected
              ? "bg-accent/10 text-accent"
              : "text-text-base hover:bg-surface-3"
          }`}
        >
          <span className="shrink-0 w-5 h-5 flex items-center justify-center">
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-sans font-medium">{item.title}</span>
            {item.description && (
              <span className="ml-2 text-[10px] text-text-weaker font-sans">
                {item.description}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
