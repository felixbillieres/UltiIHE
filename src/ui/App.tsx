import { useEffect } from "react"
import { Routes, Route } from "react-router-dom"
import { StartPanel } from "./components/start/StartPanel"
import { Workspace } from "./components/workspace/Workspace"
import { useSettingsStore, THEMES } from "./stores/settings"
import { ToastProvider } from "./components/toast/ToastProvider"

/** Apply theme CSS variables to :root whenever the active theme or color scheme changes. */
function useThemeApplier() {
  const activeTheme = useSettingsStore((s) => s.activeTheme)
  const colorScheme = useSettingsStore((s) => s.colorScheme)

  useEffect(() => {
    const theme = THEMES.find((t) => t.id === activeTheme) ?? THEMES[0]
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(`--${key}`, value)
    }
  }, [activeTheme])

  // Color scheme: dark/light/system with system auto-detect
  useEffect(() => {
    const root = document.documentElement

    function applyScheme(isDark: boolean) {
      root.classList.toggle("dark", isDark)
      root.classList.toggle("light", !isDark)
      root.style.colorScheme = isDark ? "dark" : "light"
      // Persist for preload script
      localStorage.setItem("ultiIHE-color-scheme", colorScheme)
    }

    if (colorScheme === "dark") {
      applyScheme(true)
      return
    }
    if (colorScheme === "light") {
      applyScheme(false)
      return
    }

    // system: listen to prefers-color-scheme
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    applyScheme(mq.matches)
    const handler = (e: MediaQueryListEvent) => applyScheme(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [colorScheme])
}

export function App() {
  useThemeApplier()

  return (
    <div className="h-screen w-screen bg-surface-0 text-text-base font-mono overflow-hidden">
      <Routes>
        <Route path="/" element={<StartPanel />} />
        <Route path="/project/:projectId" element={<Workspace />} />
      </Routes>
      <ToastProvider />
    </div>
  )
}
