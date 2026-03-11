import { useEffect, useCallback, useRef, useState } from "react"
import { useFileStore } from "../../stores/files"
import { Loader2, AlertCircle, Save, Plus } from "lucide-react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { ProbeModal, type ProbeContext } from "../probe/ProbeModal"
import { ProbeHistory } from "../probe/ProbeHistory"

// ─── Language mapping (file store → Monaco) ─────────────────

const LANG_MAP: Record<string, string> = {
  bash: "shell",
  plaintext: "plaintext",
}

function toMonacoLang(lang: string): string {
  return LANG_MAP[lang] || lang
}

// ─── Selection anchor ────────────────────────────────────────

interface SelectionAnchor {
  text: string
  lineCount: number
  startLine: number
  x: number
  y: number
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
  const containerRef = useRef<HTMLDivElement>(null)

  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null)
  const [probeOpen, setProbeOpen] = useState(false)
  const probeOpenRef = useRef(false)

  // Keep ref in sync so the mouseup handler can read it
  useEffect(() => {
    probeOpenRef.current = probeOpen
  }, [probeOpen])

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

  // Mount editor + mouseup-based selection (like terminal)
  const handleEditorMount: OnMount = (ed) => {
    editorRef.current = ed
    ed.focus()

    const editorDom = ed.getDomNode()
    if (!editorDom) return

    const handleMouseUp = (e: MouseEvent) => {
      requestAnimationFrame(() => {
        if (!editorRef.current) return
        const selection = editorRef.current.getSelection()
        if (!selection || selection.isEmpty()) {
          if (!probeOpenRef.current) setAnchor(null)
          return
        }

        const selectedText = editorRef.current.getModel()?.getValueInRange(selection)
        if (!selectedText || !selectedText.trim()) {
          if (!probeOpenRef.current) setAnchor(null)
          return
        }

        const containerRect = containerRef.current?.getBoundingClientRect()
        if (!containerRect) return

        const lines = selectedText.split("\n")
        setAnchor({
          text: selectedText,
          lineCount: lines.length,
          startLine: selection.startLineNumber,
          x: Math.min(e.clientX - containerRect.left, containerRect.width - 240),
          y: e.clientY - containerRect.top + 4,
        })
      })
    }

    editorDom.addEventListener("mouseup", handleMouseUp)

    const selectionDisposable = ed.onDidChangeCursorSelection(() => {
      const selection = ed.getSelection()
      if (!selection || selection.isEmpty()) {
        const sel = ed.getModel()?.getValueInRange(selection!)
        if (!sel || !sel.trim()) {
          if (!probeOpenRef.current) setAnchor(null)
        }
      }
    })

    const cleanup = () => {
      editorDom.removeEventListener("mouseup", handleMouseUp)
      selectionDisposable.dispose()
    }
    ;(ed as any)._ultiCleanup = cleanup
  }

  useEffect(() => {
    return () => {
      const ed = editorRef.current as any
      if (ed?._ultiCleanup) ed._ultiCleanup()
    }
  }, [])

  const openProbe = () => {
    setProbeOpen(true)
  }

  const closeProbe = () => {
    setProbeOpen(false)
    setAnchor(null)
    editorRef.current?.setSelection({
      startLineNumber: 0,
      startColumn: 0,
      endLineNumber: 0,
      endColumn: 0,
    })
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

  // Build probe context
  const probeCtx: ProbeContext | null =
    anchor && file
      ? {
          source: "file",
          sourceId: file.id,
          sourceName: file.filename,
          pageKey: `file:${file.id}`,
          selection: {
            text: anchor.text,
            lineCount: anchor.lineCount,
            startLine: anchor.startLine,
            language: file.language,
            container: file.container,
            filePath: file.path,
          },
          quoteData: {
            source: "file",
            container: file.container,
            filePath: file.path,
            fileName: file.filename,
            language: file.language,
            text: anchor.text,
            lineCount: anchor.lineCount,
            startLine: anchor.startLine,
          },
        }
      : null

  const cw = containerRef.current?.offsetWidth || 400
  const ch = containerRef.current?.offsetHeight || 400

  return (
    <div ref={containerRef} className="h-full flex flex-col relative overflow-hidden">
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={toMonacoLang(file.language)}
          value={file.content}
          onChange={(value) => updateContent(file.id, value ?? "")}
          onMount={handleEditorMount}
          theme="ultiIHE-dark"
          beforeMount={(monaco) => {
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

      {/* Floating "+" button — clamped to container */}
      {anchor && !probeOpen && (() => {
        const btnTop = Math.max(4, Math.min(anchor.y, ch - 32))
        return (
          <button
            onClick={openProbe}
            className="absolute z-20 w-6 h-6 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-lg transition-all hover:scale-110"
            style={{ left: anchor.x, top: btnTop }}
            title="Probe selection"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )
      })()}

      {/* Probe modal */}
      {anchor && probeOpen && probeCtx && (
        <ProbeModal
          ctx={probeCtx}
          x={anchor.x}
          y={anchor.y}
          containerWidth={cw}
          containerHeight={ch}
          onClose={closeProbe}
        />
      )}

      {/* Probe history button */}
      <ProbeHistory
        pageKey={`file:${file.id}`}
        containerWidth={cw}
        containerHeight={ch}
      />

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
