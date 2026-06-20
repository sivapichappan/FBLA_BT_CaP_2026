/**
 * The two-tier rating + the headline "Verified reviews only" toggle (the demo's
 * signature moment): flip it and the number visibly swaps from the gamed raw
 * average to the honest verified-only average. The number animates so the change
 * is impossible to miss.
 *
 * Renders nothing when the business has no reviews; the toggle itself only shows
 * once there's at least one verified review to compare against.
 */

import { AnimatePresence, motion } from "motion/react";
import { StarRating } from "./ui";

interface Props {
  rawRating: number;
  rawCount: number;
  verifiedRating: number | null;
  verifiedCount: number;
  verifiedOnly: boolean;
  onToggle: (verifiedOnly: boolean) => void;
}

export function VerifiedRating({
  rawRating,
  rawCount,
  verifiedRating,
  verifiedCount,
  verifiedOnly,
  onToggle,
}: Props) {
  if (rawCount === 0) return null;

  const hasVerified = verifiedCount > 0;
  const showingVerified = verifiedOnly && hasVerified;
  const rating = showingVerified ? (verifiedRating ?? 0) : rawRating;
  const count = showingVerified ? verifiedCount : rawCount;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5">
          <StarRating rating={rating} size={18} />
          {/* The number swaps with a small slide so the 4.5 → 3.9 change reads. */}
          <span className="relative inline-flex font-serif text-ink-soft">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={showingVerified ? "verified" : "raw"}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.22 }}
              >
                {rating.toFixed(1)} · {count}{" "}
                {showingVerified ? "verified " : ""}
                review{count === 1 ? "" : "s"}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>

        {hasVerified && (
          <div
            role="group"
            aria-label="Show all reviews or verified visits only"
            className="inline-flex rounded-full border border-border bg-surface p-0.5 font-serif text-xs"
          >
            <button
              type="button"
              aria-pressed={!verifiedOnly}
              onClick={() => onToggle(false)}
              className={`rounded-full px-3 py-1 transition-colors ${
                !verifiedOnly
                  ? "bg-accent-700 text-cream"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              All
            </button>
            <button
              type="button"
              aria-pressed={verifiedOnly}
              onClick={() => onToggle(true)}
              className={`rounded-full px-3 py-1 transition-colors ${
                verifiedOnly
                  ? "bg-verified text-cream"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              ✓ Verified only
            </button>
          </div>
        )}
      </div>

      {hasVerified && (
        <p className="mt-1.5 font-mono text-[11px] text-ink-soft">
          {verifiedCount} of {rawCount} reviews are from confirmed visits
          {verifiedRating != null &&
            ` · verified rating ${verifiedRating.toFixed(1)}`}
          .
        </p>
      )}
    </div>
  );
}
