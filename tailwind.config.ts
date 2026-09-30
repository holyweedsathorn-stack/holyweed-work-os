import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-public-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        surfaceHover: "var(--surface-hover)",
        ink: "var(--ink)",
        inkSecondary: "var(--ink-secondary)",
        inkMuted: "var(--ink-muted)",
        line: "var(--line)",
        lineStrong: "var(--line-strong)",
        accent: "var(--accent)",
        accent2: "var(--accent2)",
        sathorn: "var(--sathorn)",
        sukhumvit: "var(--sukhumvit)",
        good: "var(--good)",
        warning: "var(--warning)",
        critical: "var(--critical)",
      },
      borderRadius: {
        card: "14px",
        sm2: "9px",
      },
    },
  },
  plugins: [],
};
export default config;
