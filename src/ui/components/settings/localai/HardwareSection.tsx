import { Cpu, HardDrive, Monitor, Zap } from "lucide-react"
import { useLocalAIStore } from "../../../stores/localAI"
import { Section } from "./Section"

export function HardwareSection({ hardware }: { hardware: ReturnType<typeof useLocalAIStore.getState>["hardware"] }) {
  if (!hardware) return null

  const gpu = hardware.gpus[0]

  return (
    <Section title="Hardware">
      <div className="grid grid-cols-2 gap-2">
        <InfoCard
          icon={<Monitor className="w-3.5 h-3.5" />}
          label="Platform"
          value={`${hardware.platform} ${hardware.arch}`}
        />
        <InfoCard
          icon={<Cpu className="w-3.5 h-3.5" />}
          label="CPU"
          value={`${hardware.cpuCores} cores`}
        />
        <InfoCard
          icon={<HardDrive className="w-3.5 h-3.5" />}
          label="RAM"
          value={`${Math.round(hardware.totalRAM_MB / 1024)} GB (${Math.round(hardware.freeRAM_MB / 1024)} GB free)`}
        />
        {gpu ? (
          <InfoCard
            icon={<Zap className="w-3.5 h-3.5 text-status-success" />}
            label={gpu.backend.toUpperCase()}
            value={`${gpu.name} — ${Math.round(gpu.vramMB / 1024)} GB VRAM`}
          />
        ) : (
          <InfoCard
            icon={<Zap className="w-3.5 h-3.5 text-text-weaker" />}
            label="GPU"
            value="No GPU detected (CPU mode)"
          />
        )}
      </div>
    </Section>
  )
}

export function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-0 border border-border-weak">
      <div className="mt-0.5 text-text-weaker">{icon}</div>
      <div>
        <div className="text-[10px] text-text-weaker font-sans uppercase tracking-wide">{label}</div>
        <div className="text-xs text-text-base font-sans">{value}</div>
      </div>
    </div>
  )
}
