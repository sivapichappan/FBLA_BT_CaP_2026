/**
 * The glass-box popover (§9.4), rebuilt for the classifier pipeline: shows
 * exactly WHICH gate decided this business's verdict — the owner record, the
 * chain registry, a cached audit, or the live Gemini audit — and the
 * plain-English reason. The filter is interrogable, not a black box; this is
 * the panel to open when a judge asks "how does it know?"
 */

import { useState } from "react";
import { businessApi } from "../lib/api";
import type { ClassifierVerdict } from "../types";

/** Human labels for the four pipeline gates, in the order they run. */
const STEP_LABELS: Record<string, string> = {
  owner_record: "Owner record",
  chain_registry: "Chain registry",
  verdict_cache: "Recent audit",
  gemini: "Gemini audit",
};

const SOURCE_LABELS: Record<string, string> = {
  "known-registry": "Known chain list",
  gemini: "AI audit",
  "local-owner": "Owner-listed",
  "unverified-offline": "Unverified (offline)",
};

export function VerdictBreakdown({ businessRef }: { businessRef: string }) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<ClassifierVerdict | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !verdict) {
      setState("loading");
      try {
        setVerdict(await businessApi.signals(businessRef));
        setState("idle");
      } catch {
        setState("error");
      }
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="font-mono text-xs text-accent-700 underline-offset-2 hover:underline"
      >
        {open ? "▾ hide the reasoning" : "▸ why this verdict?"}
      </button>

      {open && (
        <div
          className="mt-2 rounded-lg border border-border bg-surface p-4"
          role="region"
          aria-label="Small-business verification"
        >
          {state === "loading" && (
            <p className="font-serif text-sm text-ink-soft">Checking…</p>
          )}
          {state === "error" && (
            <p className="font-serif text-sm text-ink-soft">
              Verification details unavailable right now.
            </p>
          )}

          {verdict && (
            <>
              {/* Headline: the verdict + which gate produced it */}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display font-semibold text-ink">
                  {verdict.is_small
                    ? "Verified as a small business"
                    : "Reads as a chain"}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                    verdict.is_small
                      ? "border-verified text-verified"
                      : "border-chain text-chain"
                  }`}
                >
                  {SOURCE_LABELS[verdict.source] ?? verdict.source}
                </span>
              </div>
              <p className="mt-1 font-serif text-sm text-ink-soft">
                {verdict.reason}
              </p>

              {/* The pipeline trail: every gate, in order, with its outcome */}
              <ol className="mt-3 space-y-1.5 border-t border-border pt-3">
                {verdict.checks.map((c, i) => {
                  const decided = ["matched", "hit", "answered"].includes(
                    c.outcome,
                  );
                  return (
                    <li key={c.step} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold ${
                          decided
                            ? "bg-accent-700 text-cream"
                            : "border border-border text-ink-soft"
                        }`}
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] uppercase tracking-wide text-ink">
                          {STEP_LABELS[c.step] ?? c.step}
                        </span>
                        <span className="ml-2 font-serif text-xs text-ink-soft">
                          {c.detail}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <p className="mt-3 font-serif text-xs italic text-ink-soft">
                Known chains are filtered free and instantly; everything else
                gets one AI audit, and the answer is remembered. When we can't
                verify, the business is shown — never hidden.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
