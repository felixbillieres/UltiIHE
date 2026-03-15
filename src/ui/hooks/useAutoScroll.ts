import { useRef, useEffect, useCallback, useState } from "react"

/**
 * Smart auto-scroll hook.
 *
 * Adapted from Cline's useScrollBehavior.ts:
 * - Auto-scrolls to bottom during streaming (aggressive multi-pass like Cline)
 * - On new user message, scrolls so the message is at the TOP (clean context)
 * - Detects manual scroll UP (wheel) to disable auto-scroll (Cline line 308-316)
 * - Re-enables when user scrolls back to bottom (Cline's atBottomStateChange)
 * - Shows "scroll to bottom" button when paused
 *
 * Key Cline insight: use multiple scroll passes on content update (40ms, 70ms)
 * to handle slow renders and layout shifts.
 */
export function useAutoScroll(streaming: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const userScrolledRef = useRef(false)
  const lastStreamingRef = useRef(false)

  // Cline pattern: threshold for "at bottom" detection (Virtuoso uses 10px)
  const AT_BOTTOM_THRESHOLD = 40

  // Reset on new streaming session start
  useEffect(() => {
    if (streaming && !lastStreamingRef.current) {
      // New streaming started — re-enable auto-scroll
      userScrolledRef.current = false
      setShowScrollButton(false)
    }
    lastStreamingRef.current = streaming
  }, [streaming])

  // Detect manual scroll — Cline pattern: only disable on wheel UP
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent) {
      // Cline: only disable auto-scroll when user scrolls UP (deltaY < 0)
      if (e.deltaY < 0 && streaming) {
        userScrolledRef.current = true
        setShowScrollButton(true)
      }
    }

    function handleScroll() {
      const el = containerRef.current
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD
      if (atBottom) {
        // Cline's atBottomStateChange: re-enable auto-scroll when at bottom
        userScrolledRef.current = false
        setShowScrollButton(false)
      } else if (!streaming) {
        // Not streaming + not at bottom = show button for convenience
        // But don't force-show during streaming (only wheel UP triggers that)
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

  /**
   * Called by parent on every content update (text-delta, tool-call, etc).
   *
   * Cline pattern (useScrollBehavior.ts lines 279-294): aggressive multi-pass
   * scrollToBottom with delays to handle slow renders:
   *   scrollToBottomSmooth()         // immediately
   *   setTimeout(scrollToBottomAuto, 40)  // after 40ms
   *   setTimeout(scrollToBottomAuto, 70)  // after 70ms
   */
  const onContentUpdate = useCallback(() => {
    if (userScrolledRef.current) return
    const el = containerRef.current
    if (!el) return
    // Immediate scroll
    el.scrollTop = el.scrollHeight
    // Cline-style delayed re-scroll to catch layout shifts after render
    setTimeout(() => {
      if (!userScrolledRef.current && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight
      }
    }, 50)
  }, [])

  /**
   * Scroll so the last user message is at the top of the viewport.
   * Creates the Cursor-style "clean context" effect.
   *
   * After positioning, briefly delay then ensure we're still scrolled properly
   * (Cline uses similar multi-pass approach for scroll-to-message).
   */
  const scrollToLastUserMessage = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const userMessages = el.querySelectorAll("[data-user-message]")
    const last = userMessages[userMessages.length - 1] as HTMLElement | null
    if (last) {
      const offset = last.offsetTop - el.offsetTop
      el.scrollTop = offset - 4
      // Multi-pass: ensure scroll position after layout settles
      setTimeout(() => {
        if (containerRef.current && !userScrolledRef.current) {
          const msgs = containerRef.current.querySelectorAll("[data-user-message]")
          const lastMsg = msgs[msgs.length - 1] as HTMLElement | null
          if (lastMsg) {
            containerRef.current.scrollTop = lastMsg.offsetTop - containerRef.current.offsetTop - 4
          }
        }
      }, 50)
      userScrolledRef.current = false
      setShowScrollButton(false)
    } else {
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
