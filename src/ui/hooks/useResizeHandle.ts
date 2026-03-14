import { useCallback, useRef, useEffect } from "react"

export function useResizeHandle(
  direction: "horizontal" | "vertical",
  onResize: (delta: number) => void,
  onDragStateChange?: (dragging: boolean) => void,
) {
  const cleanupRef = useRef<(() => void) | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanupRef.current?.() }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onDragStateChange?.(true)
    const startPos = direction === "horizontal" ? e.clientX : e.clientY

    function onMove(ev: MouseEvent) {
      const currentPos = direction === "horizontal" ? ev.clientX : ev.clientY
      onResize(currentPos - startPos)
    }
    function onUp() {
      onDragStateChange?.(false)
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      cleanupRef.current = null
    }

    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    cleanupRef.current = onUp
  }, [direction, onResize, onDragStateChange])

  return onMouseDown
}
