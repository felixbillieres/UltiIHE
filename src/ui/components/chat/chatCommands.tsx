import { useMemo } from "react"
import { useTerminalStore } from "../../stores/terminal"
import { useFileStore } from "../../stores/files"
import {
  Brain,
  Terminal,
  Scan,
  Hash,
  FileText,
  MessageSquarePlus,
  Minimize2,
  Undo2,
  Cpu,
  Link,
} from "lucide-react"

export interface SlashCommand {
  id: string
  trigger: string
  title: string
  description: string
  icon: React.ReactNode
  action: (ctx: SlashContext) => void
}

export interface AtOption {
  type: "terminal" | "file"
  id: string
  display: string
  description?: string
  icon: React.ReactNode
  /** For file type: container and path */
  fileMeta?: { container: string; path: string; language: string }
}

export interface SlashContext {
  setInput: (text: string) => void
  cycleThinkingEffort: () => void
  newSession: () => void
  compact: () => void
  undo: () => void
  openModelPicker: () => void
  focusTerminal: () => void
}

export function useSlashCommands(): SlashCommand[] {
  return useMemo(
    () => [
      {
        id: "scan",
        trigger: "scan",
        title: "Scan target",
        description: "Run nmap/nuclei scan on a target",
        icon: <Scan className="w-3.5 h-3.5" />,
        action: (ctx) => ctx.setInput("/scan "),
      },
      {
        id: "think",
        trigger: "think",
        title: "Toggle thinking",
        description: "Cycle thinking effort (off → low → medium → high)",
        icon: <Brain className="w-3.5 h-3.5" />,
        action: (ctx) => {
          ctx.cycleThinkingEffort()
          ctx.setInput("")
        },
      },
      {
        id: "clear",
        trigger: "clear",
        title: "Clear chat",
        description: "Start a new session",
        icon: <Hash className="w-3.5 h-3.5" />,
        action: (ctx) => ctx.setInput(""),
      },
      {
        id: "new",
        trigger: "new",
        title: "New session",
        description: "Create a fresh chat session",
        icon: <MessageSquarePlus className="w-3.5 h-3.5" />,
        action: (ctx) => {
          ctx.newSession()
          ctx.setInput("")
        },
      },
      {
        id: "compact",
        trigger: "compact",
        title: "Compact context",
        description: "Summarize old messages to free tokens",
        icon: <Minimize2 className="w-3.5 h-3.5" />,
        action: (ctx) => {
          ctx.compact()
          ctx.setInput("")
        },
      },
      {
        id: "undo",
        trigger: "undo",
        title: "Undo last exchange",
        description: "Remove last user+assistant message pair",
        icon: <Undo2 className="w-3.5 h-3.5" />,
        action: (ctx) => {
          ctx.undo()
          ctx.setInput("")
        },
      },
      {
        id: "model",
        trigger: "model",
        title: "Change model",
        description: "Open the model picker",
        icon: <Cpu className="w-3.5 h-3.5" />,
        action: (ctx) => {
          ctx.openModelPicker()
          ctx.setInput("")
        },
      },
      {
        id: "terminal",
        trigger: "terminal",
        title: "Focus terminal",
        description: "Switch focus to the active terminal",
        icon: <Terminal className="w-3.5 h-3.5" />,
        action: (ctx) => {
          ctx.focusTerminal()
          ctx.setInput("")
        },
      },
    ],
    [],
  )
}

export function useAtOptions(): AtOption[] {
  const terminals = useTerminalStore((s) => s.terminals)
  const openFiles = useFileStore((s) => s.openFiles)

  return useMemo(() => {
    const terms: AtOption[] = terminals.map((t) => ({
      type: "terminal" as const,
      id: t.id,
      display: t.name,
      description: `Terminal output`,
      icon: <Terminal className="w-3.5 h-3.5 text-text-weaker" />,
    }))

    const files: AtOption[] = openFiles.map((f) => ({
      type: "file" as const,
      id: f.id,
      display: f.filename,
      description: `${f.container}:${f.path}`,
      icon: <FileText className="w-3.5 h-3.5 text-text-weaker" />,
      fileMeta: { container: f.container, path: f.path, language: f.language },
    }))

    const urlOption: AtOption = {
      type: "file" as const,
      id: "__url__",
      display: "url",
      description: "Fetch a URL and attach its content",
      icon: <Link className="w-3.5 h-3.5 text-text-weaker" />,
    }

    return [urlOption, ...terms, ...files]
  }, [terminals, openFiles])
}
