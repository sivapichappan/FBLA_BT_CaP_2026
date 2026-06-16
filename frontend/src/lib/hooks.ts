/**
 * Tiny UI hooks shared by overlay-style components (e.g. the mobile menu).
 * Kept dependency-free and reusable.
 */

import { useEffect } from "react";

/** Lock body scroll while `locked` is true (e.g. a full-screen overlay is open). */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

/** Call `onEscape` when Escape is pressed, while `active` is true. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}
