import { useEffect, useCallback, useRef } from "react"
import { useFileStore } from "../../stores/files"
import { Loader2, AlertCircle, Save } from "lucide-react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { editor } from "monaco-editor"

// ─── Language mapping (file store → Monaco) ─────────────────

const LANG_MAP: Record<string, string> = {
  bash: "shell",
  plaintext: "plaintext",
}

function toMonacoLang(lang: string): string {
  return LANG_MAP[lang] || lang
}

// ─── Component ──────────────────────────────────────────────

interface FileEditorPaneProps {
  fileId: string
}

export function FileEditorPane({ fileId }: FileEditorPaneProps) {
  const file = useFileStore((s) => s.openFiles.find((f) => f.id === fileId))
  const updateContent = useFileStore((s) => s.updateContent)
  const saveFile = useFileStore((s) => s.saveFile)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleSave = useCallback(() => {
    if (fileId) saveFile(fileId)
  }, [fileId, saveFile])

  // Ctrl+S save
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

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.focus()
  }

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-weaker text-sm font-sans">
        File not found
      </div>
    )
  }

  if (file.loading) {
    return (
      <div className="h-full flex items-center justify-center text-text-weaker">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (file.error) {
    return (
      <div className="h-full flex items-center justify-center text-status-error text-sm font-sans p-4">
        <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
        {file.error}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={toMonacoLang(file.language)}
          value={file.content}
          onChange={(value) => updateContent(file.id, value ?? "")}
          onMount={handleEditorMount}
          theme="ultiIHE-dark"
          beforeMount={(monaco) => {
            // Define custom dark theme matching the app
            monaco.editor.defineTheme("ultiIHE-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [
                { token: "comment", foreground: "6A9955", fontStyle: "italic" },
                { token: "keyword", foreground: "C586C0" },
                { token: "string", foreground: "CE9178" },
                { token: "number", foreground: "B5CEA8" },
                { token: "type", foreground: "4EC9B0" },
                { token: "function", foreground: "DCDCAA" },
                { token: "variable", foreground: "9CDCFE" },
                { token: "constant", foreground: "4FC1FF" },
              ],
              colors: {
                "editor.background": "#0a0a0a",
                "editor.foreground": "#D4D4D4",
                "editor.lineHighlightBackground": "#ffffff08",
                "editor.selectionBackground": "#264f78",
                "editorCursor.foreground": "#22d3ee",
                "editor.inactiveSelectionBackground": "#3a3d41",
                "editorLineNumber.foreground": "#555555",
                "editorLineNumber.activeForeground": "#999999",
                "editorGutter.background": "#0a0a0a",
                "editorWidget.background": "#1a1a1a",
                "editorWidget.border": "#333333",
                "input.background": "#1a1a1a",
                "input.border": "#333333",
                "scrollbarSlider.background": "#ffffff15",
                "scrollbarSlider.hoverBackground": "#ffffff25",
                "scrollbarSlider.activeBackground": "#ffffff35",
              },
            })
          }}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            renderLineHighlight: "line",
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            tabSize: 2,
            wordWrap: "off",
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            overviewRulerLanes: 0,
            folding: true,
            glyphMargin: false,
            bracketPairColorization: { enabled: true },
            guides: {
              indentation: true,
              bracketPairs: true,
            },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
          loading={
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-text-weaker" />
            </div>
          }
        />
      </div>
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border-weak bg-surface-1 text-[10px] text-text-weaker font-sans shrink-0">
        <span className="truncate">{file.path}</span>
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
