import { useEffect, useRef, useCallback } from "react"
import { useFileStore, type OpenFile } from "../../stores/files"
import { X, Save, Loader2, AlertCircle } from "lucide-react"

export function FileEditor() {
  const { openFiles, activeFileId, closeFile, setActiveFile, saveFile } =
    useFileStore()

  const activeFile = openFiles.find((f) => f.id === activeFileId) || null

  if (openFiles.length === 0) return null

  return (
    <div className="h-full flex flex-col bg-surface-0 border-b border-border-weak">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border-weak bg-surface-1 shrink-0 overflow-x-auto">
        {openFiles.map((file) => (
          <FileTab
            key={file.id}
            file={file}
            active={file.id === activeFileId}
            onActivate={() => setActiveFile(file.id)}
            onClose={() => closeFile(file.id)}
            onSave={() => saveFile(file.id)}
          />
        ))}
      </div>

      {/* Editor content */}
      {activeFile && <EditorPane file={activeFile} />}
    </div>
  )
}

function FileTab({
  file,
  active,
  onActivate,
  onClose,
  onSave,
}: {
  file: OpenFile
  active: boolean
  onActivate: () => void
  onClose: () => void
  onSave: () => void
}) {
  const saving = useFileStore((s) => s.savingFiles.has(file.id))

  return (
    <div
      onClick={onActivate}
      className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-border-weak shrink-0 transition-colors ${
        active
          ? "bg-surface-0 text-text-strong border-b-2 border-b-accent"
          : "bg-surface-1 text-text-weak hover:bg-surface-2 hover:text-text-base border-b-2 border-b-transparent"
      }`}
    >
      {file.loading ? (
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
      ) : file.error ? (
        <AlertCircle className="w-3 h-3 text-status-error shrink-0" />
      ) : file.isDirty ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSave()
          }}
          className="w-3 h-3 rounded-full bg-accent/60 hover:bg-accent shrink-0 transition-colors"
          title="Save (Ctrl+S)"
        />
      ) : null}
      <span className="font-sans truncate max-w-[140px]">{file.filename}</span>
      {saving && <Loader2 className="w-3 h-3 animate-spin text-accent shrink-0" />}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-3 transition-all shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function EditorPane({ file }: { file: OpenFile }) {
  const { updateContent, saveFile } = useFileStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSave = useCallback(() => {
    saveFile(file.id)
  }, [file.id, saveFile])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleSave])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [file.id])

  if (file.loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-weaker">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (file.error) {
    return (
      <div className="flex-1 flex items-center justify-center text-status-error text-sm font-sans p-4">
        <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
        {file.error}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <textarea
        ref={textareaRef}
        value={file.content}
        onChange={(e) => updateContent(file.id, e.target.value)}
        spellCheck={false}
        className="flex-1 w-full bg-surface-0 text-text-strong font-mono text-xs leading-relaxed p-4 resize-none focus:outline-none"
        style={{ tabSize: 2 }}
      />
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border-weak bg-surface-1 text-[10px] text-text-weaker font-sans shrink-0">
        <span>{file.path}</span>
        <div className="flex items-center gap-3">
          <span>{file.language}</span>
          {file.isDirty && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1 text-accent hover:text-accent-hover transition-colors"
            >
              <Save className="w-3 h-3" />
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
