// Re-export split stores and their types
export { useFileEditorStore, type OpenFile } from "./fileEditor"
export { useFilesystemStore, type FileEntry } from "./filesystemCache"
export { useFileConfigStore, type PinnedPath } from "./fileConfig"

// ── Legacy combined hook ────────────────────────────────────────
// Components that import useFileStore get a unified view across all three stores.
// This avoids breaking any existing consumer code.

import { useFileEditorStore } from "./fileEditor"
import { useFilesystemStore } from "./filesystemCache"
import { useFileConfigStore } from "./fileConfig"
import { useMemo } from "react"

type CombinedFileStore =
  ReturnType<typeof useFileEditorStore.getState> &
  ReturnType<typeof useFilesystemStore.getState> &
  ReturnType<typeof useFileConfigStore.getState>

/**
 * Legacy combined store hook -- selects from all three underlying stores.
 * New code should import the specific store it needs directly.
 *
 * Supports both:
 *   useFileStore(s => s.xxx)  -- with selector
 *   useFileStore()            -- returns full combined state
 */
export function useFileStore(): CombinedFileStore
export function useFileStore<T>(selector: (state: CombinedFileStore) => T): T
export function useFileStore<T>(selector?: (state: CombinedFileStore) => T): T | CombinedFileStore {
  const editorState = useFileEditorStore()
  const fsState = useFilesystemStore()
  const configState = useFileConfigStore()

  // Merge all three states into one object for the selector
  const combined = useMemo(
    () => ({ ...editorState, ...fsState, ...configState }) as CombinedFileStore,
    [editorState, fsState, configState],
  )

  return selector ? selector(combined) : combined
}

// Attach getState() for imperative access (e.g., useFileStore.getState().xxx)
useFileStore.getState = (): CombinedFileStore => ({
  ...useFileEditorStore.getState(),
  ...useFilesystemStore.getState(),
  ...useFileConfigStore.getState(),
} as CombinedFileStore)

useFileStore.setState = () => {
  throw new Error(
    "useFileStore.setState() is not supported on the combined store. " +
    "Use useFileEditorStore, useFilesystemStore, or useFileConfigStore directly.",
  )
}
