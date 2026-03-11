import { useRef, useEffect, useCallback, useState } from "react"

/**
 * Smart auto-scroll hook.
 *
 * - Auto-scrolls to bottom during streaming
 * - Pauses on manual scroll up (wheel/touch)
 * - Shows "scroll to bottom" indicator when paused
 * - Resumes on click or when new message starts
 */
export function useAutoScroll(streaming: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const userScrolledRef = useRef(false)
  const lastStreamingRef = useRef(false)

  // Reset on new streaming session start
  useEffect(() => {
    if (streaming && !lastStreamingRef.current) {
      // New streaming started — re-enable auto-scroll
      userScrolledRef.current = false
      setShowScrollButton(false)
    }
    lastStreamingRef.current = streaming
  }, [streaming])

  // Detect manual scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleWheel() {
      if (!streaming) return
      const el = containerRef.current
      if (!el) return
      // If not at bottom, user scrolled up
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      if (!atBottom) {
        userScrolledRef.current = true
        setShowScrollButton(true)
      }
    }

    function handleScroll() {
      const el = containerRef.current
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      if (atBottom) {
        userScrolledRef.current = false
        setShowScrollButton(false)
      } else if (streaming) {
        setShowScrollButton(true)
      }
    }

    container.addEventListener("wheel", handleWheel, { passive: true })
    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      container.removeEventListener("wheel", handleWheel)
      container.removeEventListener("scroll", handleScroll)
    }
  }, [streaming])

  // Auto-scroll on content change during streaming
  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    userScrolledRef.current = false
    setShowScrollButton(false)
  }, [])

  // Called by parent when content updates (text-delta, new parts)
  const onContentUpdate = useCallback(() => {
    if (userScrolledRef.current) return
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  return {
    containerRef,
    showScrollButton,
    scrollToBottom,
    onContentUpdate,
  }
}
