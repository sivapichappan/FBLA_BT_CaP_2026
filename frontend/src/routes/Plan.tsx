/**
 * The small-business trip planner: pick a duration, interests, and start time
 * → get a walkable, ALL-INDEPENDENT itinerary with times, walking legs, a map,
 * and an AI narration (deterministic fallback offline — the "✦/⚙" chip shows
 * which engine narrated). Signed-in users can save trips and revisit them.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CategoryIcon } from "../components/CategoryIcon";
import { LocationControl } from "../components/LocationControl";
import { MapView } from "../components/MapView";
import { Reveal } from "../components/Reveal";
import { BizImage, LocalBadge, Skeleton, StarRating } from "../components/ui";
import { ApiError, tripApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocation } from "../lib/location";
import { usePageTitle } from "../lib/usePageTitle";
import type { SavedTrip, TripDuration, TripPlan } from "../types";

/** Tiny preview of the businesses in an option, e.g. "Sweet Kitchen → Tabla". */
function previewNames(names: string[]): string {
  if (names.length <= 3) return names.join(" → ");
  return `${names.slice(0, 2).join(" → ")} +${names.length - 2} more`;
}

/** Plain-language gloss for each option's optimisation goal (keyed by backend
 *  strategy key) — tells the user WHY the days differ without jargon. */
const OPTION_BLURB: Record<string, string> = {
  best: "Balanced picks",
  rated: "Highest-rated spots",
  walk: "Least walking",
};

/** A small numbered badge that turns the form into legible, guided steps. */
function StepDot({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-700/10 font-mono text-[11px] font-bold text-accent-700">
      {n}
    </span>
  );
}

const DURATIONS: { value: TripDuration; label: string; hint: string }[] = [
  { value: "quick", label: "Quick outing", hint: "~2 h · 3 stops" },
  { value: "half", label: "Half day", hint: "~4 h · 4 stops" },
  { value: "full", label: "Full day", hint: "~7 h · 6 stops" },
];

const INTERESTS = [
  "Coffee",
  "Bookstore",
  "Restaurant",
  "Retail",
  "Dessert",
  "Bar",
  "Grocery",
];

export function Plan() {
  usePageTitle("Plan a day");
  const { user } = useAuth();
  const coords = useLocation();
  const navigate = useNavigate();

  const [duration, setDuration] = useState<TripDuration>("half");
  const [interests, setInterests] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("10:00");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [optionIdx, setOptionIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedTrip[]>([]);
  const [hoveredRef, setHoveredRef] = useState<string | null>(null);

  // The itinerary/map below always reflect the option the user has selected.
  const option = plan?.options[optionIdx] ?? null;

  useEffect(() => {
    if (user)
      tripApi
        .mine()
        .then(setSaved)
        .catch(() => setSaved([]));
  }, [user]);

  function toggleInterest(name: string) {
    setInterests((curr) =>
      curr.includes(name)
        ? curr.filter((i) => i !== name)
        : curr.length < 6
          ? [...curr, name]
          : curr,
    );
  }

  async function buildPlan() {
    setBusy(true);
    setMessage(null);
    try {
      setPlan(
        await tripApi.plan({
          lat: coords.lat,
          lng: coords.lng,
          duration,
          interests,
          start_time: startTime,
        }),
      );
      setOptionIdx(0); // always show the top ("Best overall") option first
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Couldn't build a plan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveTrip() {
    if (!plan || !option) return;
    const title =
      window.prompt("Name this trip:", `My ${duration}-day local crawl`) ?? "";
    if (!title.trim()) return;
    try {
      const trip = await tripApi.save(
        title.trim(),
        {
          duration: plan.duration,
          interests: plan.interests,
          start: plan.start,
          option: option.key, // remember which day-shape was saved
        },
        option.stops,
      );
      setSaved((curr) => [trip, ...curr]);
      setMessage(`Saved “${trip.title}”.`);
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Couldn't save the trip.",
      );
    }
  }

  async function deleteTrip(id: number) {
    setSaved((curr) => curr.filter((t) => t.id !== id));
    tripApi.remove(id).catch(() => tripApi.mine().then(setSaved));
  }

  return (
    <main className="container-page py-8">
      <h1 className="font-display text-4xl font-semibold text-ink">
        Plan a local day
      </h1>
      <p className="mt-1 max-w-2xl font-serif text-ink-soft">
        A walkable itinerary made only of independent businesses — chains can't
        appear here by construction. Pick a shape for your day and go.
      </p>
      <p className="mt-2">
        <LocationControl />
      </p>

      {/* ── The planner form (three guided steps) ─────────────────────── */}
      <section
        aria-label="Plan your day"
        className="mt-5 space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6"
      >
        {/* Step 1 — how long */}
        <fieldset>
          <legend className="flex items-center gap-2 font-serif text-sm font-medium text-ink">
            <StepDot n={1} /> How long do you have?
          </legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2 sm:max-w-xl">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={duration === d.value}
                onClick={() => setDuration(d.value)}
                className={`flex flex-col rounded-lg border px-3 py-3 text-left transition-colors ${
                  duration === d.value
                    ? "border-accent-700 bg-accent-700 text-cream"
                    : "border-border bg-cream text-ink hover:border-accent-600"
                }`}
              >
                <span className="font-serif text-sm font-medium">
                  {d.label}
                </span>
                <span
                  className={`mt-0.5 font-mono text-[10px] ${duration === d.value ? "text-cream/80" : "text-ink-soft"}`}
                >
                  {d.hint}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Step 2 — interests */}
        <fieldset>
          <legend className="flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-sm font-medium text-ink">
            <span className="flex items-center gap-2">
              <StepDot n={2} /> What are you in the mood for?
            </span>
            <span className="font-serif text-xs font-normal text-ink-soft">
              optional ·{" "}
              {interests.length
                ? `${interests.length} picked`
                : "leave blank for a balanced day"}
            </span>
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {INTERESTS.map((name) => {
              const on = interests.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleInterest(name)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-serif text-sm transition-colors ${
                    on
                      ? "border-accent-700 bg-accent-700 text-cream"
                      : "border-border bg-cream text-ink-soft hover:border-accent-600 hover:text-ink"
                  }`}
                >
                  <CategoryIcon name={name} size={15} />
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Step 3 — start time + the primary action */}
        <fieldset className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="font-serif text-sm font-medium text-ink">
            <span className="flex items-center gap-2">
              <StepDot n={3} /> Start time
            </span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-2 block rounded-md border border-border bg-cream px-3 py-2 font-mono text-sm"
            />
          </label>

          <button
            type="button"
            onClick={buildPlan}
            disabled={busy}
            className="w-full rounded-md bg-accent-700 px-6 py-3 font-serif font-medium text-cream shadow-sm transition-colors hover:bg-accent-600 disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Planning…" : plan ? "↻ Re-plan my day" : "Build my day →"}
          </button>
        </fieldset>
      </section>

      {message && (
        <p role="status" className="mt-4 font-serif text-accent-700">
          {message}
        </p>
      )}
      {busy && (
        <div className="mt-5">
          <Skeleton count={3} height="6rem" />
        </div>
      )}

      {/* ── The itinerary ─────────────────────────────────────────────── */}
      {plan && option && !busy && (
        <div className="mt-6">
          {/* Pick between the alternative days — each visits different spots. */}
          {plan.options.length > 1 && (
            <div className="mb-6">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
                {plan.options.length} ways to spend your day — tap one
              </h3>
              <div
                role="tablist"
                aria-label="Trip options"
                className="grid gap-2.5 sm:grid-cols-3"
              >
                {plan.options.map((o, i) => {
                  const sel = i === optionIdx;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="tab"
                      aria-selected={sel}
                      onClick={() => setOptionIdx(i)}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        sel
                          ? "border-accent-700 bg-accent-700 text-cream shadow-sm"
                          : "border-border bg-surface text-ink hover:border-accent-600 hover:shadow-sm"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-serif text-sm font-semibold">
                          {o.label}
                        </span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${
                            sel
                              ? "bg-cream/20 text-cream"
                              : "bg-accent-700/10 text-accent-700"
                          }`}
                        >
                          {sel ? "✓" : i + 1}
                        </span>
                      </span>
                      <span
                        className={`block font-serif text-xs ${sel ? "text-cream/85" : "text-ink-soft"}`}
                      >
                        {OPTION_BLURB[o.key] ?? "Another route"}
                      </span>
                      <span
                        className={`mt-1.5 block font-mono text-[10px] ${sel ? "text-cream/80" : "text-ink-soft"}`}
                      >
                        {o.stops.length} stops · {o.total_walk_km.toFixed(1)} km
                      </span>
                      <span
                        className={`mt-1 block truncate font-serif text-xs ${sel ? "text-cream/90" : "text-ink"}`}
                      >
                        {previewNames(o.stops.map((s) => s.name))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <section aria-label="Itinerary">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold text-ink">
                  {plan.options.length > 1
                    ? `${option.label} · `
                    : "Your day · "}
                  {option.stops.length} stops ·{" "}
                  {option.total_walk_km.toFixed(1)} km on foot
                </h2>
                {user ? (
                  <button
                    type="button"
                    onClick={saveTrip}
                    className="rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600"
                  >
                    ♥ Save trip
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="font-serif text-sm text-accent-700 underline-offset-2 hover:underline"
                  >
                    Sign in to save
                  </Link>
                )}
              </div>

              {/* Narration */}
              <blockquote className="mt-3 whitespace-pre-line border-l-2 border-accent-600 bg-surface px-4 py-3 font-serif text-sm italic text-ink">
                {option.narrative}
                <span className="mt-1 block font-mono text-[10px] not-italic text-ink-soft">
                  {option.mode === "llm" ? "✦ AI narration" : "⚙ offline mode"}
                </span>
              </blockquote>

              {/* Timeline */}
              <ol className="mt-4 space-y-3">
                {option.stops.map((s, i) => (
                  <Reveal key={s.ref} delay={Math.min(i * 0.07, 0.5)}>
                    <li
                      className={`flex gap-3 rounded-lg border bg-surface p-3 transition-colors ${
                        hoveredRef === s.ref
                          ? "border-accent-600"
                          : "border-border"
                      }`}
                      onMouseEnter={() => setHoveredRef(s.ref)}
                      onMouseLeave={() => setHoveredRef(null)}
                    >
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
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/business/${encodeURIComponent(s.ref)}`)
                          }
                          className="truncate font-display text-lg font-semibold text-ink hover:text-accent-700"
                        >
                          {s.name}
                        </button>
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
                  </Reveal>
                ))}
              </ol>
            </section>

            <section aria-label="Route map" className="sticky top-4 h-[70vh]">
              <MapView
                businesses={option.stops}
                center={{ lat: plan.start.lat, lng: plan.start.lng }}
                hoveredRef={hoveredRef}
                onHover={setHoveredRef}
                onSelect={(ref) =>
                  navigate(`/business/${encodeURIComponent(ref)}`)
                }
              />
            </section>
          </div>
        </div>
      )}

      {/* ── Saved trips ───────────────────────────────────────────────── */}
      {user && saved.length > 0 && (
        <section aria-label="Saved trips" className="mt-10">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Saved trips
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {saved.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <p className="font-display font-semibold text-ink">{t.title}</p>
                <p className="mt-0.5 font-serif text-sm text-ink-soft">
                  {t.stops.map((s) => s.name).join(" → ")}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-ink-soft">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTrip(t.id)}
                    className="font-serif text-xs text-accent-700 underline-offset-2 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
