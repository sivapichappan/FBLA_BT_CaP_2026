/**
 * The reusable business card — one renderer for search results, favorites,
 * and concierge suggestions. Keyboard-accessible (it's a real link), with the
 * optional rank number used by the map↔card hover sync on the Search page.
 */

import { Link } from "react-router-dom";
import type { Business } from "../types";
import { BizImage, LocalBadge, OpenBadge, PriceLevel, StarRating } from "./ui";

interface Props {
  business: Business;
  /** 1-based rank shown in the corner; matches the numbered map pin. */
  rank?: number;
  /** Hover sync hooks (Search page wires these to the map). */
  onHover?: (ref: string | null) => void;
  highlighted?: boolean;
}

export function BusinessCard({
  business: b,
  rank,
  onHover,
  highlighted,
}: Props) {
  return (
    <Link
      to={`/business/${encodeURIComponent(b.ref)}`}
      className={`group block overflow-hidden rounded-lg border bg-surface shadow-warm transition-all duration-300 hover:-translate-y-1 hover:shadow-lift ${
        highlighted ? "border-accent-600" : "border-border"
      }`}
      onMouseEnter={() => onHover?.(b.ref)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(b.ref)}
      onBlur={() => onHover?.(null)}
      aria-label={`${b.name}${b.average_rating ? `, rated ${b.average_rating.toFixed(1)} of 5` : ""}`}
    >
      <BizImage
        photoUrl={b.photo_url}
        name={b.name}
        className="h-36 w-full transition-transform duration-500 group-hover:scale-105"
        focusX={b.photo_focus_x}
        focusY={b.photo_focus_y}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold text-ink">
              {rank !== undefined && (
                <span
                  className="mr-2 font-mono text-sm text-accent-700"
                  aria-hidden="true"
                >
                  {rank}.
                </span>
              )}
              {b.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {b.review_count > 0 && (
                <span className="flex items-center gap-1.5">
                  <StarRating rating={b.average_rating} />
                  <span className="font-serif text-sm text-ink-soft">
                    {b.average_rating.toFixed(1)} ({b.review_count})
                  </span>
                </span>
              )}
              <PriceLevel level={b.price_level} />
              <OpenBadge open={b.is_open_now} />
            </div>
          </div>
          <LocalBadge badge={b.local_badge} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-serif text-sm text-ink-soft">
          {b.categories.slice(0, 3).map((c) => (
            <span
              key={c}
              className="rounded-full border border-border px-2 py-0.5 text-xs"
            >
              {c}
            </span>
          ))}
          {b.distance_km !== null && <span>{b.distance_km} km away</span>}
          {b.address && <span className="truncate">{b.address}</span>}
        </div>
      </div>
    </Link>
  );
}
