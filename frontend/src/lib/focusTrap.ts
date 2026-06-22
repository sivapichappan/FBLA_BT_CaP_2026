/**
 * Accessible focus trap: keep Tab / Shift+Tab cycling within a container (a modal
 * or menu panel) so keyboard focus never escapes behind the overlay. Wire it to
 * the container's onKeyDown: `onKeyDown={(e) => trapFocus(e, panelRef.current)}`.
 */
import type { KeyboardEvent } from "react";

export function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== "Tab" || !container) return;
  const focusables = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
