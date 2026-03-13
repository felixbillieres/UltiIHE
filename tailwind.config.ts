import type { Config } from "tailwindcss"

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        border: {
          base: "var(--border-base)",
          weak: "var(--border-weak)",
        },
        text: {
          strong: "var(--text-strong)",
          base: "var(--text-base)",
          weak: "var(--text-weak)",
          weaker: "var(--text-weaker)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
        },
        severity: {
          critical: "#df4e4e",
          high: "#f1863f",
          medium: "#facc15",
          low: "#42c170",
          info: "#72bef4",
        },
        status: {
          success: "#42c170",
          warning: "#facc15",
          error: "#df4e4e",
          info: "#72bef4",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "IBM Plex Mono",
          "Fira Code",
          "ui-monospace",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config
