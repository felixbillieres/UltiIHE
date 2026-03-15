import { useState, useRef, useMemo } from "react"
import { useSessionStore } from "../stores/session"
import { useSettingsStore } from "../stores/settings"
import { useChatContextStore } from "../stores/chatContext"
import { useSlashCommands, useAtOptions, type SlashCommand, type AtOption } from "../components/chat/chatCommands"
import { toast } from "sonner"

export function useChatInput(projectId: string, opts: {
  streaming: boolean
  handleSend: (overrideInput?: string) => Promise<void>
  textareaRef: React.RefObject<HTMLTextAreaElement>
  searchOpen: boolean
  setSearchOpen: (v: boolean) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  autoCompact: (sessionId: string, provider: any) => void
}) {
  const {
    streaming,
    handleSend,
    textareaRef,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    autoCompact,
  } = opts

  const activeSessionId = useSessionStore((s) => s.activeSessionIdByProject[projectId] ?? null)
  const getActiveProvider = useSettingsStore((s) => s.getActiveProvider)
  const addImage = useChatContextStore((s) => s.addImage)

  const [input, setInput] = useState("")
  const [draggingOver, setDraggingOver] = useState(false)
  const [showModelPickerFromSlash, setShowModelPickerFromSlash] = useState(false)

  // Slash & @ popover state
  const [popover, setPopover] = useState<"slash" | "at" | null>(null)
  const [popoverIndex, setPopoverIndex] = useState(0)
  const [popoverFilter, setPopoverFilter] = useState("")
  const slashCommands = useSlashCommands()
  const atOptions = useAtOptions()

  // Message history (ArrowUp/Down)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const draftRef = useRef("")

  const filteredSlash = useMemo(
    () =>
      slashCommands.filter(
        (c) =>
          !popoverFilter ||
          c.trigger.toLowerCase().includes(popoverFilter.toLowerCase()) ||
          c.title.toLowerCase().includes(popoverFilter.toLowerCase()),
      ),
    [slashCommands, popoverFilter],
  )

  const filteredAt = useMemo(
    () =>
      atOptions.filter(
        (o) =>
          !popoverFilter ||
          o.display.toLowerCase().includes(popoverFilter.toLowerCase()),
      ),
    [atOptions, popoverFilter],
  )

  // ── Image paste/drop handlers ─────────────────────────────────
  const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

  function processFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!ALLOWED_IMAGE_MIMES.has(file.type)) continue
      const reader = new FileReader()
      reader.onload = () => {
        addImage({
          filename: file.name,
          mime: file.type,
          dataUrl: reader.result as string,
          size: file.size,
        })
      }
      reader.readAsDataURL(file)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter((f) => ALLOWED_IMAGE_MIMES.has(f.type))
      if (imageFiles.length > 0) {
        e.preventDefault()
        processFiles(imageFiles)
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)

    // Handle drag from file manager panel (container images)
    const exegolData = e.dataTransfer?.getData("application/x-exegol-file")
    if (exegolData) {
      try {
        const { container, path, name } = JSON.parse(exegolData) as { container: string; path: string; name: string }
        // Fetch image from container via API and convert to data URL
        fetch(`/api/files/${container}/read?path=${encodeURIComponent(path)}&base64=true`)
          .then((r) => r.json())
          .then((data) => {
            if (data.base64 && data.mime) {
              addImage({
                filename: name,
                mime: data.mime,
                dataUrl: `data:${data.mime};base64,${data.base64}`,
                size: data.size || 0,
              })
            }
          })
          .catch(() => {})
      } catch {}
      return
    }

    // Handle native file drops (from OS file manager)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      processFiles(files)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
  }

  // ── Input change handler ─────────────────────────────────────

  function handleInputChange(value: string) {
    setInput(value)

    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      setPopover("slash")
      setPopoverFilter(slashMatch[1])
      setPopoverIndex(0)
      return
    }

    const atMatch = value.match(/@(\S*)$/)
    if (atMatch) {
      setPopover("at")
      setPopoverFilter(atMatch[1])
      setPopoverIndex(0)
      return
    }

    if (popover) setPopover(null)
  }

  // ── Slash command select ─────────────────────────────────────

  function handleSlashSelect(cmd: SlashCommand) {
    setPopover(null)
    cmd.action({
      setInput,
      cycleThinkingEffort: useSettingsStore.getState().cycleThinkingEffort,
      newSession: () => useSessionStore.getState().startNewChat(projectId),
      compact: () => {
        const provider = getActiveProvider()
        if (activeSessionId) autoCompact(activeSessionId, provider)
      },
      undo: () => {
        if (activeSessionId) {
          const ok = useSessionStore.getState().undoLastExchange(activeSessionId)
          if (ok) toast.success("Undone last exchange")
          else toast.error("Nothing to undo")
        }
      },
      openModelPicker: () => setShowModelPickerFromSlash(true),
      focusTerminal: () => {
        const term = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement
        term?.focus()
      },
    })
    textareaRef.current?.focus()
  }

  // ── @ mention select ─────────────────────────────────────────

  function handleAtSelect(option: AtOption) {
    setPopover(null)
    if (option.type === "terminal") {
      setInput(input.replace(/@\S*$/, `@${option.display} `))
    } else if (option.id === "__url__") {
      // @url: prompt user for URL, then fetch content
      const url = prompt("Enter URL to fetch:")
      setInput(input.replace(/@\S*$/, ""))
      if (url) {
        toast("Fetching URL...", { duration: 2000 })
        fetch("/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.content) {
              const lines = data.content.split("\n")
              useChatContextStore.getState().addQuote({
                source: "file",
                container: "web",
                filePath: url,
                fileName: new URL(url).hostname + new URL(url).pathname.slice(0, 30),
                language: data.contentType?.includes("json") ? "json" : data.contentType?.includes("html") ? "html" : "text",
                text: data.content,
                lineCount: lines.length,
              })
              toast.success("URL content attached")
            } else {
              toast.error(data.error || "Failed to fetch URL")
            }
          })
          .catch(() => toast.error("Failed to fetch URL"))
      }
    } else if (option.type === "file" && option.fileMeta) {
      // Fetch file content and add as context quote
      const meta = option.fileMeta
      setInput(input.replace(/@\S*$/, ""))
      fetch(`/api/files/${meta.container}/read?path=${encodeURIComponent(meta.path)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.content) {
            const lines = data.content.split("\n")
            useChatContextStore.getState().addQuote({
              source: "file",
              container: meta.container,
              filePath: meta.path,
              fileName: meta.path.split("/").pop() || meta.path,
              language: meta.language,
              text: data.content,
              lineCount: lines.length,
            })
          }
        })
        .catch(() => {})
    }
    textareaRef.current?.focus()
  }

  // ── Keyboard handler ─────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (popover) {
      const items = popover === "slash" ? filteredSlash : filteredAt
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setPopoverIndex((i) => Math.min(i + 1, items.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setPopoverIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        if (items.length > 0) {
          if (popover === "slash") {
            handleSlashSelect(items[popoverIndex] as SlashCommand)
          } else {
            handleAtSelect(items[popoverIndex] as AtOption)
          }
        }
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setPopover(null)
        return
      }
    }

    // Message history navigation (ArrowUp/Down when no popover)
    if (e.key === "ArrowUp" && historyRef.current.length > 0) {
      const ta = textareaRef.current
      const cursorAtStart = !ta || ta.selectionStart === 0
      if (cursorAtStart) {
        e.preventDefault()
        if (historyIndexRef.current === -1) {
          draftRef.current = input
          historyIndexRef.current = historyRef.current.length - 1
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--
        }
        setInput(historyRef.current[historyIndexRef.current])
        return
      }
    }
    if (e.key === "ArrowDown" && historyIndexRef.current !== -1) {
      const ta = textareaRef.current
      const cursorAtEnd = !ta || ta.selectionStart === ta.value.length
      if (cursorAtEnd) {
        e.preventDefault()
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++
          setInput(historyRef.current[historyIndexRef.current])
        } else {
          historyIndexRef.current = -1
          setInput(draftRef.current)
        }
        return
      }
    }

    // Escape: clear input or close search
    if (e.key === "Escape") {
      if (searchOpen) {
        setSearchOpen(false)
        setSearchQuery("")
        textareaRef.current?.focus()
        return
      }
      if (input) {
        e.preventDefault()
        setInput("")
        return
      }
    }

    // Ctrl+Shift+Backspace: undo last exchange
    if (e.key === "Backspace" && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      if (activeSessionId) {
        const ok = useSessionStore.getState().undoLastExchange(activeSessionId)
        if (ok) toast.success("Undone last exchange")
        else toast.error("Nothing to undo")
      }
      return
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return {
    input,
    setInput,
    popover,
    popoverIndex,
    filteredSlash,
    filteredAt,
    handleInputChange,
    handleSlashSelect,
    handleAtSelect,
    handleKeyDown,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    draggingOver,
    showModelPickerFromSlash,
    setShowModelPickerFromSlash,
    historyRef,
    historyIndexRef,
    draftRef,
  }
}
