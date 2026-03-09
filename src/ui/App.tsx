import { Routes, Route } from "react-router-dom"
import { StartPanel } from "./components/start/StartPanel"
import { Workspace } from "./components/workspace/Workspace"

export function App() {
  return (
    <div className="h-screen w-screen bg-surface-0 text-text-base font-mono overflow-hidden">
      <Routes>
        <Route path="/" element={<StartPanel />} />
        <Route path="/project/:projectId" element={<Workspace />} />
      </Routes>
    </div>
  )
}
