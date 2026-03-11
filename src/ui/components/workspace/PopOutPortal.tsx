import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

interface Props {
  /** Unique window name (reuses window if same name) */
  windowName: string
  /** Window title */
  title: string
  /** Initial window dimensions */
  width?: number
  height?: number
  /** Called when the pop-out window is closed (by user or programmatically) */
  onClose: () => void
  children: ReactNode
}

/**
 * Opens a new browser window and renders React children into it via createPortal.
 * Handles style injection (Tailwind, xterm.css, fonts, theme) and cleanup.
 *
 * Since window.open('') from the same origin shares the JS context,
 * all Zustand stores and the WebSocket singleton work automatically.
 */
export function PopOutPortal({
  windowName,
  title,
  width = 800,
  height = 600,
  onClose,
  children,
}: Props) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const windowRef = useRef<Window | null>(null)
  const closedByUs = useRef(false)

  useEffect(() => {
    // Center on screen
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${Math.round(left)}`,
      `top=${Math.round(top)}`,
      `menubar=no`,
      `toolbar=no`,
      `location=no`,
      `status=no`,
      `resizable=yes`,
      `scrollbars=no`,
    ].join(",")

    const popup = window.open("", windowName, features)
    if (!popup) {
      console.warn("[PopOut] Popup blocked by browser")
      onClose()
      return
    }

    windowRef.current = popup
    closedByUs.current = false

    // ─── Build the popup document via DOM manipulation ──────
    const doc = popup.document

    // Clear everything
    doc.head.innerHTML = ""
    doc.body.innerHTML = ""

    // <base> so relative URLs (CSS, fonts, images) resolve against our origin
    const base = doc.createElement("base")
    base.href = window.location.origin + "/"
    doc.head.appendChild(base)

    // Title
    doc.title = `${title} — Exegol IHE`

    // ─── Inject CSS custom properties directly on <html> element ───
    // This is the most reliable method — inline styles on documentElement
    // override anything and ensure all var() references resolve correctly.
    injectCssVarsInline(doc.documentElement)

    // Critical layout + utility styles
    const layoutStyle = doc.createElement("style")
    layoutStyle.textContent = `
      html, body {
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: var(--surface-0);
        color: var(--text-base);
        font-family: var(--font-sans);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      #popout-root {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      * { border-color: var(--border-weak); }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      .scrollbar-none::-webkit-scrollbar { display: none; }
    `
    doc.head.appendChild(layoutStyle)

    // Dark mode
    doc.documentElement.classList.add("dark")
    doc.documentElement.style.colorScheme = "dark"

    // ─── Inject styles from parent window ───────────────────
    injectStyles(doc)

    // ─── Create mount container ─────────────────────────────
    const mountDiv = doc.createElement("div")
    mountDiv.id = "popout-root"
    doc.body.appendChild(mountDiv)

    // Defer portal setup to next frame so styles are processed
    requestAnimationFrame(() => {
      if (!popup.closed) {
        setContainer(mountDiv)
      }
    })

    // ─── Handle window close ────────────────────────────────
    const pollInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollInterval)
        if (!closedByUs.current) {
          onClose()
        }
      }
    }, 500)

    return () => {
      clearInterval(pollInterval)
      closedByUs.current = true
      if (!popup.closed) {
        popup.close()
      }
      windowRef.current = null
      setContainer(null)
    }
  }, [windowName]) // Only re-run if windowName changes

  if (!container) return null
  return createPortal(children, container)
}

/**
 * Set CSS custom properties directly as inline styles on the popup's <html>.
 * This is the most reliable method — inline styles always win in specificity
 * and don't depend on stylesheet copying working correctly.
 */
function injectCssVarsInline(el: HTMLElement) {
  const computed = getComputedStyle(document.documentElement)

  // All CSS variables from our theme (index.html + tailwind.config)
  const vars = [
    "--surface-0", "--surface-1", "--surface-2", "--surface-3",
    "--border-base", "--border-weak",
    "--text-strong", "--text-base", "--text-weak", "--text-weaker",
    "--accent", "--accent-hover",
    "--font-sans", "--font-mono",
  ]

  for (const v of vars) {
    const val = computed.getPropertyValue(v).trim()
    if (val) {
      el.style.setProperty(v, val)
    }
  }

  // Also grab any extra custom properties from stylesheet :root rules
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSStyleRule && rule.selectorText === ":root") {
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]
            if (prop.startsWith("--") && !vars.includes(prop)) {
              el.style.setProperty(prop, rule.style.getPropertyValue(prop))
            }
          }
        }
      }
    } catch {
      // CORS — skip
    }
  }
}

/**
 * Copy all stylesheets from the parent window into the pop-out document.
 */
function injectStyles(doc: Document) {
  // 1. Copy <link rel="stylesheet"> tags (xterm.css, etc.)
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const clone = doc.createElement("link")
    clone.rel = "stylesheet"
    const href = (link as HTMLLinkElement).href
    clone.href = href.startsWith("http")
      ? href
      : new URL(href, window.location.origin).href
    doc.head.appendChild(clone)
  })

  // 2. Copy <style> tags (Vite HMR injected styles — Tailwind, component CSS)
  // Strip sourceMappingURL comments to avoid about:blank resolution errors
  document.querySelectorAll("style").forEach((style) => {
    const clone = doc.createElement("style")
    clone.textContent = (style.textContent || "").replace(
      /\/\*[#@]\s*sourceMappingURL=.*?\*\//g,
      "",
    )
    for (const attr of style.attributes) {
      if (attr.name !== "type") {
        clone.setAttribute(attr.name, attr.value)
      }
    }
    doc.head.appendChild(clone)
  })

  // 3. Fonts
  const fontStyle = doc.createElement("style")
  fontStyle.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  `
  doc.head.appendChild(fontStyle)
}
