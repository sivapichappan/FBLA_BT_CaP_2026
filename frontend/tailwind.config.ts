import type { Config } from "tailwindcss";

/**
 * Tailwind theme. Colors and fonts are wired to the CSS custom properties in
 * `src/styles/tokens.css` (the single source of truth for the design system,
 * BUILD_SPEC §14), so utilities like `bg-cream` / `text-accent-700` stay in sync
 * with the tokens and can be themed in one place.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "var(--cream)",
        surface: "var(--surface)",
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)" },
        accent: { 600: "var(--accent-600)", 700: "var(--accent-700)" },
        verified: "var(--verified)",
        chain: "var(--chain)",
        border: "var(--border)",
      },
      fontFamily: {
        // Space Grotesk headlines vs IBM Plex Sans body (via tokens.css
        // variables). The `serif` key is the historical name for the body slot;
        // both now fall back to a sans stack. Mono stays system (codes/IDs).
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        serif: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        warm: "var(--shadow)",
        lift: "var(--shadow-lift)", // deeper warm shadow for card hover-lift
      },
    },
  },
  plugins: [],
} satisfies Config;
