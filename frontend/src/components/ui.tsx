/**
 * Small shared UI primitives: stars, price level, local badge, skeletons,
 * empty states. Kept together — each is a few lines and they travel as a set.
 */

import { useState, type ReactNode } from "react";
import { photoSrc } from "../lib/api";

/**
 * Business photo with a graceful fallback: when there's no photo (or it fails
 * to load — e.g. offline demo), render a flat editorial monogram tile instead
 * of a broken-image icon (§13). Decorative: the business name lives in text
 * next to it, so alt="" keeps screen readers from hearing it twice.
 *
 * Smart crop (Phase F): focusX/focusY are the photo's pre-computed focal
 * point (edge-energy analysis at enrich time). object-position keeps that
 * point in frame at ANY crop shape; without one, 50/50 = a normal center crop.
 */
export function BizImage({
  photoUrl,
  name,
  className = "",
  focusX,
  focusY,
}: {
  photoUrl: string | null | undefined;
  name: string;
  className?: string;
  focusX?: number | null;
  focusY?: number | null;
}) {
  const [failed, setFailed] = useState(false);
  const src = photoSrc(photoUrl);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center border-b border-border bg-cream ${className}`}
        aria-hidden="true"
      >
        <span className="font-display text-5xl font-semibold text-accent-600/30">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ objectPosition: `${focusX ?? 50}% ${focusY ?? 50}%` }}
      className={`border-b border-border object-cover ${className}`}
    />
  );
}

/** 0–5 star row (filled vs hollow), accessible via aria-label. */
export function StarRating({
  rating,
  size = 14,
}: {
  rating: number;
  size?: number;
}) {
  const rounded = Math.round(rating);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={i <= rounded ? "var(--accent-600)" : "none"}
          stroke={i <= rounded ? "var(--accent-600)" : "var(--chain)"}
          strokeWidth="2"
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

/** $–$$$$ price hint. */
export function PriceLevel({ level }: { level: number | null }) {
  if (!level) return null;
  return (
    <span
      className="font-mono text-xs text-ink-soft"
      aria-label={`Price level ${level} of 4`}
    >
      {"$".repeat(level)}
    </span>
  );
}

/** Local-independence badge (forest = verified, soft = likely). */
export function LocalBadge({ badge }: { badge: string | null | undefined }) {
  if (!badge) return null;
  const verified = badge === "verified_local";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${
        verified
          ? "bg-verified text-cream"
          : "border border-verified text-verified"
      }`}
    >
      {verified ? "Verified local" : "Likely local"}
    </span>
  );
}

/** Open/closed pill (renders nothing when unknown). */
export function OpenBadge({ open }: { open: boolean | null | undefined }) {
  if (open === null || open === undefined) return null;
  return (
    <span
      className={`font-mono text-[11px] uppercase tracking-wide ${open ? "text-verified" : "text-accent-700"}`}
    >
      {open ? "Open now" : "Closed"}
    </span>
  );
}

/** Pulsing placeholder blocks for loading states. */
export function Skeleton({
  count = 3,
  height = "5rem",
}: {
  count?: number;
  height?: string;
}) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-border bg-surface"
          style={{ height }}
        />
      ))}
    </div>
  );
}

/** Friendly empty/error state card. */
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {children && <p className="mt-2 font-serif text-ink-soft">{children}</p>}
    </div>
  );
}
