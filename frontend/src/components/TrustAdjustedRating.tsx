/**
 * The glass-box trust-adjusted rating: a single number that re-weights the raw
 * average so verified visits count more than anonymous reviews — with an
 * on-demand "why" that states every rule (no black box). Hidden until there are
 * a couple of reviews to adjust.
 */

import { useState } from "react";
import type { TrustRating } from "../types";

export function TrustAdjustedRating({ trust }: { trust?: TrustRating }) {
  const [open, setOpen] = useState(false);
  if (!trust || trust.adjusted_rating == null || trust.review_count < 2)
    return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-accent-700">
            Trust-adjusted rating
          </p>
          <p className="font-serif text-ink-soft">
            <span className="font-display text-2xl font-semibold text-ink">
              {trust.adjusted_rating.toFixed(1)}
            </span>{" "}
            — verified reviews count for more
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 font-mono text-xs text-accent-700 hover:underline"
        >
          {open ? "Hide" : "Why?"}
        </button>
      </div>
      {open && (
        <ul className="mt-2 space-y-1 font-serif text-sm text-ink-soft">
          <li>
            Raw average {trust.raw_rating?.toFixed(1)} ·{" "}
            {Math.round(trust.verified_share * 100)}% of reviews are from
            verified visits.
          </li>
          {trust.factors.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
