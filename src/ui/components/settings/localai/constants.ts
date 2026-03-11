// ─── Tag colors ─────────────────────────────────────────────

export const TAG_STYLES: Record<string, string> = {
  general: "bg-blue-500/15 text-blue-400",
  coding: "bg-green-500/15 text-green-400",
  reasoning: "bg-purple-500/15 text-purple-400",
  uncensored: "bg-red-500/15 text-red-400",
  fast: "bg-yellow-500/15 text-yellow-400",
}

// ─── Minimum specs per tier ─────────────────────────────────

export const TIER_SPECS: Record<string, { vram: string; ram: string; note: string }> = {
  "Small (1-4B)": { vram: "2-4 GB VRAM", ram: "8 GB RAM", note: "Runs on any modern machine" },
  "Medium (7-9B)": { vram: "6-8 GB VRAM", ram: "16 GB RAM", note: "GTX 1070+ / RTX 2060+ / M1+" },
  "Large (13-14B)": { vram: "10-12 GB VRAM", ram: "32 GB RAM", note: "RTX 3080+ / RTX 4070+ / M1 Pro+" },
  "XL (27-32B)": { vram: "18-24 GB VRAM", ram: "64 GB RAM", note: "RTX 3090 / RTX 4090 / M2 Max+" },
  "XXL (47B+)": { vram: "28-48 GB VRAM", ram: "64+ GB RAM", note: "Multi-GPU / M2 Ultra / CPU offloading" },
}
