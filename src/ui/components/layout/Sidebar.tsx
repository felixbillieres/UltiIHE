import { FileTree } from "./FileTree"

interface Props {
  projectId: string
}

export function Sidebar({ projectId }: Props) {
  return (
    <div className="h-full flex flex-col bg-surface-0">
      {/* Header */}
      <div className="flex items-center px-3 py-2.5 border-b border-border-weak shrink-0">
        <span className="text-xs text-text-strong font-sans font-medium">
          Files
        </span>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </div>
  )
}
