import { useEffect } from "react"
import { Routes, Route } from "react-router-dom"
import { StartPanel } from "./components/start/StartPanel"
import { Workspace } from "./components/workspace/Workspace"
import { useSettingsStore, THEMES } from "./stores/settings"
import { ToastProvider } from "./components/toast/ToastProvider"

/** Apply theme CSS variables to :root whenever the active theme changes. */
function useThemeApplier() {
  const activeTheme = useSettingsStore((s) => s.activeTheme)

  useEffect(() => {
    const theme = THEMES.find((t) => t.id === activeTheme) ?? THEMES[0]
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(`--${key}`, value)
    }
  }, [activeTheme])
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
