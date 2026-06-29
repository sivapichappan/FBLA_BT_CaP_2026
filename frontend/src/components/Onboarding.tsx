/**
 * First-run "how to use LocalLens" walkthrough — a small, accessible modal that
 * appears once for a new visitor and can be re-opened any time via the header's
 * "How it works" control.
 *
 * State: self-managed. It opens on first load (when the localStorage flag is
 * unset) and on a custom window event so any button can re-launch it without
 * prop-drilling. Dismissing (skip OR finish) sets the flag so it never nags.
 *
 * Accessible by construction (matches the app's other overlays): role="dialog"
 * aria-modal, labelled by its heading, Escape + backdrop close, body-scroll lock,
 * a Tab focus-trap, focus moved into the dialog on open, and focus RESTORED to
 * the launching control on close. Entrance animation is stilled automatically
 * for prefers-reduced-motion via the app-level <MotionConfig reducedMotion>.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { trapFocus } from "../lib/focusTrap";
import { useBodyScrollLock, useEscape } from "../lib/hooks";

const STORAGE_KEY = "localens.onboarding.v1";
const OPEN_EVENT = "localens:onboarding";

/** Re-open the walkthrough from anywhere (e.g. a "How it works" button). */
export function openOnboarding() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function seen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // private mode etc. — just show it
  }
}

type Step = { icon: ReactNode; title: string; body: string };

// Each icon is a small hand-drawn glyph (decorative — the heading names the
// step, so the SVGs are aria-hidden).
const STEPS: Step[] = [
  {
    title: "Welcome to LocalLens",
    body: "Discover and support independent local businesses near you — the real ones, never the big chains.",
    icon: (
      <svg
        viewBox="0 0 48 48"
        width="44"
        height="44"
        aria-hidden="true"
        fill="none"
      >
        <polygon points="12,18 36,18 32,10 16,10" fill="#2e5c8a" />
        <rect
          x="13"
          y="18"
          width="22"
          height="20"
          rx="2"
          stroke="#21436b"
          strokeWidth="2"
        />
        <rect x="20" y="26" width="8" height="12" fill="#4f6b4a" />
      </svg>
    ),
  },
  {
    title: "Find your spot",
    body: "Search the map and filter by category, price, open-now, or wheelchair access — or just describe the vibe you're after.",
    icon: (
      <svg
        viewBox="0 0 48 48"
        width="44"
        height="44"
        aria-hidden="true"
        fill="none"
      >
        <circle cx="22" cy="22" r="11" stroke="#21436b" strokeWidth="2.4" />
        <line
          x1="30"
          y1="30"
          x2="38"
          y2="38"
          stroke="#21436b"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="22" cy="22" r="3.4" fill="#4f6b4a" />
      </svg>
    ),
  },
  {
    title: "Earn trusted reviews",
    body: "Check in with a verified visit (GPS) so your reviews count for more — and collect Passport stamps as you go.",
    icon: (
      <svg
        viewBox="0 0 48 48"
        width="44"
        height="44"
        aria-hidden="true"
        fill="none"
      >
        <path
          d="M24,40 C14,28 17,15 24,15 C31,15 34,28 24,40 Z"
          fill="#4f6b4a"
        />
        <circle cx="24" cy="24" r="5.5" fill="#ffffff" />
        <polyline
          points="21,24 23.5,26.5 27.5,21.5"
          stroke="#4f6b4a"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Track your impact",
    body: "Redeem local deals, save favorites, and watch your money-kept-local add up in your Passport & Impact report.",
    icon: (
      <svg
        viewBox="0 0 48 48"
        width="44"
        height="44"
        aria-hidden="true"
        fill="none"
      >
        <rect x="10" y="30" width="6" height="8" rx="1.5" fill="#2e5c8a" />
        <rect x="20" y="24" width="6" height="14" rx="1.5" fill="#2e5c8a" />
        <rect x="30" y="18" width="6" height="20" rx="1.5" fill="#2e5c8a" />
        <path
          d="M0,3.5 C0,1 -2,-2 -5,-2 C-9,-2 -9,3 -5,6 C-3,8 0,10 0,10 C0,10 3,8 5,6 C9,3 9,-2 5,-2 C2,-2 0,1 0,3.5 Z"
          transform="translate(33,12) scale(0.95)"
          fill="#4f6b4a"
        />
      </svg>
    ),
  },
];

export function Onboarding() {
  const [open, setOpen] = useState(() => !seen());
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);
  useEscape(open, dismiss);

  // Re-open on the custom event (the header "How it works" control).
  useEffect(() => {
    const onShow = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onShow);
    return () => window.removeEventListener(OPEN_EVENT, onShow);
  }, []);

  // On open: remember what was focused, move focus to the primary button.
  // On close: hand focus back to that control (WCAG 2.4.3).
  useEffect(() => {
    if (open) {
      restoreTo.current = document.activeElement as HTMLElement | null;
      const raf = requestAnimationFrame(() => nextRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    restoreTo.current?.focus?.();
  }, [open]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore — flag is best-effort */
    }
    setOpen(false);
  }

  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(31, 27, 22, 0.5)" }}
            onClick={dismiss}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            onKeyDown={(e) => trapFocus(e, panelRef.current)}
            className="relative w-full max-w-md rounded-2xl bg-surface p-7 shadow-lift"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{
              type: "tween",
              duration: 0.22,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {/* Close */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-cream hover:text-ink"
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

            {/* Step number */}
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              Step {step + 1} of {STEPS.length}
            </p>

            {/* Icon */}
            <div className="mt-3 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-cream">
              {s.icon}
            </div>

            <h2
              id="onboarding-title"
              className="mt-4 font-display text-2xl font-semibold text-ink"
            >
              {s.title}
            </h2>
            <p className="mt-2 font-serif text-ink-soft">{s.body}</p>

            {/* Progress dots */}
            <div className="mt-6 flex items-center gap-2" aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i === step ? "w-6 bg-accent-700" : "w-2 bg-border"
                  }`}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="font-serif text-sm text-ink-soft hover:text-ink"
              >
                Skip
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((n) => Math.max(0, n - 1))}
                    className="rounded-md border border-border px-4 py-2 font-serif text-sm text-ink hover:border-accent-600"
                  >
                    Back
                  </button>
                )}
                <button
                  ref={nextRef}
                  type="button"
                  onClick={() => (last ? dismiss() : setStep((n) => n + 1))}
                  className="rounded-md bg-accent-700 px-5 py-2 font-serif text-sm font-medium text-cream hover:bg-accent-600"
                >
                  {last ? "Start exploring" : "Next"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
