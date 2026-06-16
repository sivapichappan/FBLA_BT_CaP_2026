/**
 * The AI concierge — a floating chat panel available on every page (§10).
 * Sends the user's message + location to /ai/chat and renders the reply plus
 * clickable business cards. Session id persists across turns so the
 * conversation has continuity. aria-live announces new replies.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiApi, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocation } from "../lib/location";
import type { Business } from "../types";
import { LocalBadge, StarRating } from "./ui";

interface Turn {
  role: "user" | "assistant";
  text: string;
  businesses?: Business[];
  /** Which engine answered: Gemini ("llm") or the deterministic fallback. */
  mode?: "llm" | "deterministic";
}

const SUGGESTIONS = [
  "Cheap lunch near me",
  "Best coffee open now",
  "Independent bookstores",
];

export function ConciergeWidget() {
  const { user } = useAuth();
  const coords = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the latest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, busy]);

  // Accessibility: focus the input when the panel opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await aiApi.chat(message, sessionId, coords.lat, coords.lng);
      setSessionId(res.session_id);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: res.reply,
          businesses: res.businesses,
          mode: res.mode,
        },
      ]);
    } catch (err) {
      const text =
        err instanceof ApiError && err.status === 401
          ? "Please sign in to chat with the concierge."
          : "Sorry — I hit a snag. Try that again.";
      setTurns((t) => [...t, { role: "assistant", text }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close concierge chat" : "Open concierge chat"}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-700 text-2xl text-cream shadow-warm transition-transform hover:scale-105"
      >
        {open ? "×" : "✦"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="LocalLens concierge"
          className="fixed bottom-24 right-5 z-40 flex h-[28rem] max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-warm"
        >
          <header className="border-b border-border bg-cream px-4 py-3">
            <p className="font-display font-semibold text-ink">Concierge</p>
            <p className="font-mono text-[11px] text-ink-soft">
              real local picks · no made-up places
            </p>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-3"
            aria-live="polite"
          >
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="font-serif text-sm text-ink-soft">
                  Ask me for local recommendations
                  {user ? "" : " (sign in first)"} — or try:
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full rounded-md border border-border bg-cream px-3 py-2 text-left font-serif text-sm text-ink hover:border-accent-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i}>
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 font-serif text-sm ${
                    t.role === "user"
                      ? "ml-auto bg-accent-700 text-cream"
                      : "bg-cream text-ink"
                  }`}
                >
                  {t.text}
                  {/* Engine chip: proves the silent fallback live (§10/§13). */}
                  {t.role === "assistant" && t.mode && (
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                      {t.mode === "llm" ? "✦ AI reply" : "⚙ offline mode"}
                    </span>
                  )}
                </div>
                {/* Clickable business cards under assistant replies */}
                {t.businesses?.map((b) => (
                  <button
                    key={b.ref}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/business/${encodeURIComponent(b.ref)}`);
                    }}
                    className="mt-2 flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left hover:border-accent-600"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-sm font-medium text-ink">
                        {b.name}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <StarRating rating={b.average_rating} size={11} />
                        <span className="font-mono text-[11px] text-ink-soft">
                          {b.distance_km !== null ? `${b.distance_km} km` : ""}
                        </span>
                      </span>
                    </span>
                    <LocalBadge badge={b.local_badge} />
                  </button>
                ))}
              </div>
            ))}

            {busy && (
              <p className="font-serif text-sm text-ink-soft">Thinking…</p>
            )}
          </div>

          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="concierge-input" className="sr-only">
              Message the concierge
            </label>
            <input
              id="concierge-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder={user ? "cheap tacos open now…" : "Sign in to chat"}
              disabled={!user || busy}
              className="min-w-0 flex-1 rounded-md border border-border bg-cream px-3 py-2 font-serif text-sm disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!user || busy || !input.trim()}
              className="rounded-md bg-accent-700 px-3 py-2 font-serif text-sm text-cream disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
