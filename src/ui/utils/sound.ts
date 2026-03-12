import { useSettingsStore } from "../stores/settings"

export type SoundEvent = "message-done" | "permission" | "error"

export interface SoundOption {
  id: string
  label: string
  // Frequency pairs: [freq, duration] for each tone in the sequence
  tones: Array<{ freq: number; duration: number; type?: OscillatorType }>
}

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: "gentle",
    label: "Gentle",
    tones: [{ freq: 880, duration: 0.1, type: "sine" }, { freq: 1100, duration: 0.15, type: "sine" }],
  },
  {
    id: "ping",
    label: "Ping",
    tones: [{ freq: 1200, duration: 0.08, type: "sine" }],
  },
  {
    id: "chime",
    label: "Chime",
    tones: [
      { freq: 523, duration: 0.1, type: "sine" },
      { freq: 659, duration: 0.1, type: "sine" },
      { freq: 784, duration: 0.15, type: "sine" },
    ],
  },
  {
    id: "blip",
    label: "Blip",
    tones: [{ freq: 600, duration: 0.05, type: "square" }, { freq: 800, duration: 0.05, type: "square" }],
  },
  {
    id: "soft",
    label: "Soft",
    tones: [{ freq: 440, duration: 0.2, type: "triangle" }],
  },
]

// Event-specific sound tweaks
const EVENT_MODIFIERS: Record<SoundEvent, { freqMultiplier: number; volume: number }> = {
  "message-done": { freqMultiplier: 1, volume: 0.3 },
  permission: { freqMultiplier: 0.8, volume: 0.4 },
  error: { freqMultiplier: 0.6, volume: 0.35 },
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function playTones(tones: SoundOption["tones"], volume = 0.3, freqMult = 1) {
  try {
    const ctx = getAudioContext()
    if (ctx.state === "suspended") ctx.resume()

    let time = ctx.currentTime
    for (const tone of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type || "sine"
      osc.frequency.value = tone.freq * freqMult
      gain.gain.setValueAtTime(volume, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + tone.duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(time)
      osc.stop(time + tone.duration)
      time += tone.duration * 0.8 // slight overlap
    }
  } catch {
    // Audio not available
  }
}

export function playSound(event: SoundEvent) {
  const settings = useSettingsStore.getState()
  if (!settings.soundEnabled) return

  const soundId = settings.soundId
  const option = SOUND_OPTIONS.find((s) => s.id === soundId) || SOUND_OPTIONS[0]
  const mod = EVENT_MODIFIERS[event]

  playTones(option.tones, mod.volume, mod.freqMultiplier)
}

/** Preview a sound option directly */
export function previewSound(soundId: string) {
  const option = SOUND_OPTIONS.find((s) => s.id === soundId) || SOUND_OPTIONS[0]
  playTones(option.tones, 0.3, 1)
}
