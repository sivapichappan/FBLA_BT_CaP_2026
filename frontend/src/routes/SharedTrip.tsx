/**
 * Public, read-only view of a shared day (idea 10c). No auth, no form — anyone
 * with the link sees the itinerary + map and can add it to their calendar or go
 * plan their own. Reuses the planner's stop-card look without the edit controls.
 */

import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapView } from "../components/MapView";
import {
  BizImage,
  EmptyState,
  LocalBadge,
  Skeleton,
  StarRating,
} from "../components/ui";
import { tripApi } from "../lib/api";
import { usePageTitle } from "../lib/usePageTitle";
import type { SavedTrip } from "../types";

export function SharedTrip() {
  const { token = "" } = useParams();
  const [trip, setTrip] = useState<SavedTrip | null>(null);
  const [notFound, setNotFound] = useState(false);
  usePageTitle(trip ? `${trip.title} — a local day` : "Shared day");

  useEffect(() => {
    tripApi
      .sharedTrip(token)
      .then(setTrip)
      .catch(() => setNotFound(true));
  }, [token]);

  if (notFound)
    return (
      <main className="container-page py-8">
        <EmptyState title="This shared day isn't available">
          <Link to="/plan" className="text-accent-700 underline">
            Plan your own local day
          </Link>
        </EmptyState>
      </main>
    );
  if (!trip)
    return (
      <main className="container-page py-8">
        <Skeleton count={3} height="6rem" />
      </main>
    );

  const stops = trip.stops;
  const center = stops[0]
    ? { lat: stops[0].lat, lng: stops[0].lng }
    : { lat: 40.7308, lng: -73.9973 };

  return (
    <main className="container-page max-w-4xl py-8">
      <p className="font-mono text-[11px] uppercase tracking-wide text-accent-700">
        ✦ A shared day on LocalLens
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold text-ink">
        {trip.title}
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        A walkable day out of independent spots only — never a chain.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a
          href={tripApi.icsUrl(token)}
          className="rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600"
        >
          📅 Add to calendar
        </a>
        <Link
          to="/plan"
          className="rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600"
        >
          Plan your own day →
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <ol className="space-y-3">
          {stops.map((s, i) => (
            <Fragment key={s.ref}>
              <li className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                <div className="flex w-16 shrink-0 flex-col items-center">
                  <span className="font-mono text-xs font-bold text-accent-700">
                    {s.arrive}
                  </span>
                  <span className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent-700 font-mono text-sm font-bold text-cream">
                    {i + 1}
                  </span>
                  {s.walk_from_prev_min > 0 && (
                    <span className="mt-1 text-center font-mono text-[10px] text-ink-soft">
                      {s.walk_from_prev_min} min walk
                    </span>
                  )}
                </div>
                <BizImage
                  photoUrl={s.photo_url}
                  name={s.name}
                  className="h-20 w-24 shrink-0 rounded-md border border-border"
                  focusX={s.photo_focus_x}
                  focusY={s.photo_focus_y}
                />
                <div className="min-w-0">
                  <Link
                    to={`/business/${encodeURIComponent(s.ref)}`}
                    className="truncate font-display text-lg font-semibold text-ink hover:text-accent-700"
                  >
                    {s.name}
                  </Link>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    {s.slot} · stay ~{s.dwell_min} min
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {s.review_count > 0 && (
                      <span className="flex items-center gap-1">
                        <StarRating rating={s.average_rating} size={12} />
                        <span className="font-serif text-xs text-ink-soft">
                          {s.average_rating.toFixed(1)}
                        </span>
                      </span>
                    )}
                    <LocalBadge badge={s.local_badge} />
                  </div>
                </div>
              </li>
              {(s.explore_after_min ?? 0) > 0 && i < stops.length - 1 && (
                <li className="flex items-center gap-2 pl-[4.5rem] font-mono text-[10px] text-ink-soft">
                  <span aria-hidden>↓</span>≈ {s.explore_after_min} min free
                  time to explore nearby
                </li>
              )}
            </Fragment>
          ))}
        </ol>
        <section
          aria-label="Route map"
          className="h-[60vh] lg:sticky lg:top-4 lg:h-[70vh]"
        >
          <MapView
            businesses={stops}
            center={center}
            hoveredRef={null}
            onHover={() => {}}
            onSelect={() => {}}
          />
        </section>
      </div>
    </main>
  );
}
