/**
 * Light/dark theme state, same pattern as location.ts: one module-level value,
 * persisted to localStorage, broadcast through a window event so every
 * subscriber (header toggle, map) re-renders together.
 *
 * Precedence: an explicit user choice (persisted) beats the OS preference
 * (prefers-color-scheme), which is the default. The actual colors live in
 * tokens.css under [data-theme="dark"] — this module only flips the attribute.
 * index.html runs a tiny inline copy of this logic before first paint so dark
 * users never see a light flash.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "locallens_theme";
const EVENT = "locallens-theme-changed";

export type Theme = "light" | "dark";

/** The OS-level preference — the default when the user hasn't chosen. */
function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function loadSaved(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null;
  }
}

let current: Theme = loadSaved() ?? systemTheme();

/** Write the attribute tokens.css keys off of (set on <html>, not <body>,
 *  so the tokens apply before React mounts anything). */
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function getTheme(): Theme {
  return current;
}

/** Explicit user choice — persists and wins over the OS preference. */
export function setTheme(theme: Theme) {
  current = theme;
  apply(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — the choice still holds for this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
  const [theme, setState] = useState<Theme>(current);

  useEffect(() => {
    const onChange = () => setState(current);
    window.addEventListener(EVENT, onChange);

    // No saved choice: follow the OS if it changes while the app is open.
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (!loadSaved()) {
        current = systemTheme();
        apply(current);
        window.dispatchEvent(new Event(EVENT));
      }
    };
    media?.addEventListener("change", onSystem);

    return () => {
      window.removeEventListener(EVENT, onChange);
      media?.removeEventListener("change", onSystem);
    };
  }, []);

  return theme;
}
