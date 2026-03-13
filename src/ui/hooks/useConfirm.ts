import { useState, useCallback } from "react"

interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
}

const CLOSED: ConfirmState = {
  open: false,
  title: "",
  message: "",
  confirmLabel: "Delete",
  onConfirm: () => {},
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(CLOSED)

  const confirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        setState({
          open: true,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel ?? "Delete",
          onConfirm: () => {
            setState(CLOSED)
            resolve(true)
          },
        })
      }),
    [],
  )

  const cancel = useCallback(() => {
    setState((s) => {
      // Don't resolve the promise — the action is simply abandoned
      return CLOSED
    })
  }, [])

  return {
    dialogProps: {
      open: state.open,
      title: state.title,
      message: state.message,
      confirmLabel: state.confirmLabel,
      onConfirm: state.onConfirm,
      onCancel: cancel,
    },
    confirm,
  }
}
