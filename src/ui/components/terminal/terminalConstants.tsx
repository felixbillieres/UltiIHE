import { Radar, Network, Monitor } from "lucide-react"

export const TOOL_ICONS: Record<string, React.ReactNode> = {
  Monitor: <Monitor className="w-3 h-3 shrink-0" />,
  Radar: <Radar className="w-3 h-3 shrink-0" />,
  Network: <Network className="w-3 h-3 shrink-0" />,
}

export const TOOL_ICONS_SM: Record<string, React.ReactNode> = {
  Monitor: <Monitor className="w-3.5 h-3.5" />,
  Radar: <Radar className="w-3.5 h-3.5" />,
  Network: <Network className="w-3.5 h-3.5" />,
}

/** Short container badge shown when project has multiple containers */
export function ContainerBadge({ container }: { container: string }) {
  return (
    <span className="px-1 py-px rounded text-[9px] font-mono bg-accent/10 text-accent/70 truncate max-w-[60px] shrink-0">
      {container}
    </span>
  )
}
