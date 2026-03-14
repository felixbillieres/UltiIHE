/**
 * Orchestrator — coordinates store resets when switching projects.
 *
 * Instead of scattering store.switchProject() / store.clearAll() calls
 * across components, call switchProject() from here to ensure every
 * per-project store is properly scoped or cleared.
 */

import { useProjectStore } from "./project"
import { useTerminalStore } from "./terminal"
import { useWorkspaceStore } from "./workspace"
import { useFileStore } from "./files"
import { useChatContextStore } from "./chatContext"
import { useCommandApprovalStore } from "./commandApproval"
import { useToolApprovalStore } from "./toolApproval"
import { useContextStore } from "./context"
import { useOpsStore } from "./operations"

export function switchProject(projectId: string) {
  useProjectStore.getState().setActiveProject(projectId)
  useTerminalStore.getState().switchProject(projectId)
  useWorkspaceStore.getState().switchProject(projectId)
  useFileStore.getState().switchProject(projectId)
  useChatContextStore.getState().clearAll()
  useCommandApprovalStore.getState().clearAll()
  useToolApprovalStore.getState().clearAll()
  useContextStore.getState().clear()
  useOpsStore.getState().clearCompleted()
}
