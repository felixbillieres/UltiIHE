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
          critical: "#ef4444",
          high: "#f97316",
          medium: "#eab308",
          low: "#22c55e",
          info: "#3b82f6",
        },
        status: {
          success: "#22c55e",
          warning: "#eab308",
          error: "#ef4444",
          info: "#3b82f6",
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
