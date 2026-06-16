/**
 * Full-screen mobile navigation overlay (the hamburger menu). Rendered only
 * below `lg` — the desktop nav in Header handles >=1024px. Slides in from the
 * right via motion/react, which the app-level <MotionConfig reducedMotion="user">
 * automatically stills for prefers-reduced-motion users.
 *
 * Accessible by construction: role="dialog" aria-modal, Escape + backdrop close,
 * body-scroll lock while open, focus moves to the first link on open, a minimal
 * Tab focus-trap, and the menu closes itself on route change so tapping a link
 * navigates *and* dismisses.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBodyScrollLock, useEscape } from "../lib/hooks";
import { PRIMARY_LINKS, ownerLink } from "./navLinks";
import { ThemeToggle } from "./ThemeToggle";

export function MobileMenu({
  id,
  isOpen,
  onClose,
}: {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(isOpen);
  useEscape(isOpen, onClose);

  // Close on navigation. pathname-only dependency: opening the menu doesn't
  // change the path, so this fires only on a real route change (link tapped).
  useEffect(() => {
    if (isOpen) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Move focus into the panel when it opens (WCAG 2.4.3).
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const owner = ownerLink(user?.role);
  const links = owner ? [...PRIMARY_LINKS, owner] : PRIMARY_LINKS;

  // Minimal Tab focus-trap so keyboard focus stays inside the open dialog.
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Scrim. Inline rgba because Tailwind opacity modifiers don't compile
              on our CSS-variable colors (e.g. `bg-ink/40` is silently dropped). */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(31, 27, 22, 0.45)" }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onKeyDown={trapTab}
            className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col overflow-y-auto bg-surface px-6 pb-8 pt-5 shadow-lift"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-lg font-semibold text-ink">
                Menu
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-ink-soft hover:border-accent-600 hover:text-ink"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav aria-label="Primary" className="flex flex-col">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `rounded-md px-2 py-3 font-serif text-lg ${
                      isActive ? "text-ink" : "text-ink-soft hover:text-ink"
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>

            <div className="my-3 border-t border-border" />

            <div className="flex items-center justify-between gap-3">
              <ThemeToggle />
              {user ? (
                <div className="flex items-center gap-3">
                  <Link
                    to="/profile"
                    onClick={onClose}
                    className="font-mono text-xs text-ink-soft hover:text-accent-700"
                    aria-label="My profile"
                  >
                    @{user.username}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      onClose();
                    }}
                    className="rounded-md border border-border px-3 py-2 font-serif text-sm text-ink-soft hover:border-accent-600 hover:text-ink"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link
                    to="/login"
                    onClick={onClose}
                    className="font-serif text-ink-soft hover:text-ink"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    onClick={onClose}
                    className="rounded-md bg-accent-700 px-3 py-2 font-serif text-sm text-cream hover:bg-accent-600"
                  >
                    Join
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
