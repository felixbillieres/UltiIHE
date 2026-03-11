import { Toaster, toast } from "sonner"

/**
 * Toast provider — mount at App root.
 * Uses sonner for clean, minimal notifications.
 */
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        className: "font-sans",
        style: {
          background: "var(--surface-2)",
          border: "1px solid var(--border-weak)",
          color: "var(--text-base)",
          fontSize: "12px",
        },
      }}
      theme="dark"
      richColors
      closeButton
    />
  )
}

/** Show a toast notification */
export { toast }

/** Convenience wrappers */
export const showToast = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast(message),
  promise: <T,>(
    promise: Promise<T>,
    opts: { loading: string; success: string; error: string },
  ) => toast.promise(promise, opts),
}
