/**
 * StatusBar — 22px horizontal bar at the very bottom.
 * Click actions: terminals → focus terminal, findings → open bottom panel, ctx → toast info.
 */

import { useState } from "react"
import { type Project } from "../../stores/project"
import { useTerminalStore } from "../../stores/terminal"
import { useExhStore } from "../../stores/exh"
import { useContextStore } from "../../stores/context"
import { useCommandApprovalStore } from "../../stores/commandApproval"
import { AboutDialog } from "../settings/AboutDialog"
import { toast } from "sonner"

interface StatusBarProps {
  project: Project
  containerCount: number
  onToggleBottomPanel?: () => void
}

export function StatusBar({ project, containerCount, onToggleBottomPanel }: StatusBarProps) {
  const [showAbout, setShowAbout] = useState(false)
  const terminals = useTerminalStore((s) => s.terminals)
  const followAssistant = useTerminalStore((s) => s.followAssistant)
  const aiTerminalMode = useTerminalStore((s) => s.aiTerminalMode)
  const creds = useExhStore((s) => s.creds)
  const hosts = useExhStore((s) => s.hosts)
  const contextInfo = useContextStore((s) => s.info)
  const approvalMode = useCommandApprovalStore((s) => s.mode)

  const projectTerminals = terminals.filter((t) => t.projectId === project.id)
  const contextPercent = contextInfo?.percentUsed ?? 0

  return (
    <div className="shrink-0 h-[22px] bg-surface-1 border-t border-border-weak flex items-center px-2 text-xs text-text-weaker select-none">
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {/* Left items */}
      <div className="flex items-center gap-3">
        {/* Version */}
        <span
          className="text-text-weaker cursor-pointer hover:text-text-weak"
          onClick={() => setShowAbout(true)}
          title="About Exegol IHE"
        >
          v0.1.0
        </span>
        {/* Container */}
        <span className="flex items-center gap-1">
          {containerCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-status-success inline-block" />}
          <span className="tabular-nums">{containerCount}</span>
          <span>container{containerCount !== 1 ? "s" : ""}</span>
        </span>

        {/* Terminal count — click to focus terminal */}
        <span
          className="tabular-nums cursor-pointer hover:text-text-weak"
          onClick={() => {
            const term = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement
            term?.focus()
          }}
        >
          {projectTerminals.length} terminal{projectTerminals.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right items */}
      <div className="flex items-center gap-3">
        {/* exh findings — click to open bottom panel */}
        {(creds.length > 0 || hosts.length > 0) && (
          <span
            className="tabular-nums cursor-pointer hover:text-text-weak"
            onClick={onToggleBottomPanel}
          >
            {creds.length} cred{creds.length !== 1 ? "s" : ""} / {hosts.length} host{hosts.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Mode indicators */}
        {followAssistant && (
          <span className="text-accent text-[10px] font-medium uppercase">follow</span>
        )}
        {aiTerminalMode === "split" && (
          <span className="text-text-weaker text-[10px] font-medium uppercase">split</span>
        )}
        {approvalMode === "auto-run" && (
          <span className="text-status-warning text-[10px] font-medium uppercase">yolo</span>
        )}
        {approvalMode === "allow-all-session" && (
          <span className="text-status-warning text-[10px] font-medium uppercase">yolo-session</span>
        )}

        {/* Context usage — click for details */}
        <span
          className={`tabular-nums cursor-pointer hover:text-text-weak ${contextPercent > 80 ? "text-status-warning" : ""}`}
          onClick={() => {
            const info = useContextStore.getState().info
            if (info) {
              toast(`Context: ${info.total?.toLocaleString() || 0} / ${info.limit?.toLocaleString() || 0} tokens (${info.percentUsed}%)`, { duration: 3000 })
            }
          }}
        >
          ctx {contextPercent}%
        </span>
      </div>
    </div>
  )
}
