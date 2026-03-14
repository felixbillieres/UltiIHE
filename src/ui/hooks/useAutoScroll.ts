import { useRef, useEffect, useCallback, useState } from "react"

/**
 * Smart auto-scroll hook.
 *
 * - Auto-scrolls to bottom during streaming
 * - On new user message, scrolls so the message is at the TOP (clean context)
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

  /**
   * Scroll so the last user message is at the top of the viewport.
   * Creates the Cursor-style "clean context" effect.
   */
  const scrollToLastUserMessage = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    // Find the last sticky user message element
    const userMessages = el.querySelectorAll("[data-user-message]")
    const last = userMessages[userMessages.length - 1] as HTMLElement | null
    if (last) {
      // Scroll so user message is at top with small offset
      const offset = last.offsetTop - el.offsetTop
      el.scrollTop = offset - 4
      userScrolledRef.current = false
      setShowScrollButton(false)
    } else {
      // Fallback: scroll to bottom
      el.scrollTop = el.scrollHeight
    }
  }, [])

  return {
    containerRef,
    showScrollButton,
    scrollToBottom,
    scrollToLastUserMessage,
    onContentUpdate,
  }
}
