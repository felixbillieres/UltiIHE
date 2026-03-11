import { useMemo } from "react"
import { useTerminalStore } from "../../stores/terminal"
import { AGENTS, type AgentId } from "../../stores/settings"
import {
  Bot,
  Brain,
  Terminal,
  Scan,
  Swords,
  ClipboardList,
  Hash,
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
  type: "agent" | "terminal"
  id: string
  display: string
  description?: string
  icon: React.ReactNode
}

export interface SlashContext {
  setInput: (text: string) => void
  setAgent: (agent: AgentId) => void
  cycleThinkingEffort: () => void
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
        id: "recon",
        trigger: "recon",
        title: "Recon mode",
        description: "Switch to recon agent for reconnaissance",
        icon: <Scan className="w-3.5 h-3.5 text-cyan-400" />,
        action: (ctx) => {
          ctx.setAgent("recon")
          ctx.setInput("")
        },
      },
      {
        id: "exploit",
        trigger: "exploit",
        title: "Exploit mode",
        description: "Switch to exploit agent",
        icon: <Swords className="w-3.5 h-3.5 text-red-400" />,
        action: (ctx) => {
          ctx.setAgent("exploit")
          ctx.setInput("")
        },
      },
      {
        id: "report",
        trigger: "report",
        title: "Report mode",
        description: "Switch to report agent (read-only)",
        icon: <ClipboardList className="w-3.5 h-3.5 text-purple-400" />,
        action: (ctx) => {
          ctx.setAgent("report")
          ctx.setInput("")
        },
      },
      {
        id: "build",
        trigger: "build",
        title: "Build mode",
        description: "Switch to primary build agent",
        icon: <Bot className="w-3.5 h-3.5 text-accent" />,
        action: (ctx) => {
          ctx.setAgent("build")
          ctx.setInput("")
        },
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
    ],
    [],
  )
}

export function useAtOptions(): AtOption[] {
  const terminals = useTerminalStore((s) => s.terminals)

  return useMemo(() => {
    const agents: AtOption[] = AGENTS.map((a) => ({
      type: "agent" as const,
      id: a.id,
      display: a.name,
      description: a.description,
      icon: (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: a.color }}
        />
      ),
    }))

    const terms: AtOption[] = terminals.map((t) => ({
      type: "terminal" as const,
      id: t.id,
      display: t.name,
      description: `Terminal output`,
      icon: <Terminal className="w-3.5 h-3.5 text-text-weaker" />,
    }))

    return [...agents, ...terms]
  }, [terminals])
}
