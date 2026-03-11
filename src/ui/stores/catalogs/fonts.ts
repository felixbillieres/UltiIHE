export const MONO_FONTS = [
  "IBM Plex Mono",
  "Cascadia Code",
  "Fira Code",
  "Hack",
  "JetBrains Mono",
  "Source Code Pro",
  "Ubuntu Mono",
  "Inconsolata",
  "Roboto Mono",
  "Space Mono",
  "Victor Mono",
  "Iosevka",
  "Fantasque Sans Mono",
] as const

export type MonoFont = (typeof MONO_FONTS)[number]
