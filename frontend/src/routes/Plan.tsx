/**
 * The small-business trip planner: describe your day in words (or tap a few
 * categories), choose how long and when → get a walkable, ALL-INDEPENDENT
 * itinerary with times, walking legs, a map, and an AI narration (deterministic
 * fallback offline — the "✦/⚙" chip shows which engine narrated). Signed-in
 * users can save trips and revisit them.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CategoryIcon } from "../components/CategoryIcon";
import { LocationControl } from "../components/LocationControl";
import { MapView } from "../components/MapView";
import { MapListToggle } from "../components/MapListToggle";
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
  const [goals, setGoals] = useState("");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [optionIdx, setOptionIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedTrip[]>([]);
  const [hoveredRef, setHoveredRef] = useState<string | null>(null);
  // Below lg the itinerary and map can't sit side-by-side; the user toggles.
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

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
          goals: goals.trim() || undefined,
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
        Tell us what you're in the mood for and we'll build a walkable day out
        of independent spots only — never a chain.
      </p>
      <p className="mt-2">
        <LocationControl />
      </p>

      {/* ── The planner form ──────────────────────────────────────────── */}
      <section
        aria-label="Plan your day"
        className="mt-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
      >
        {/* 1) WHAT you want — describe in words OR tap categories (two ways to
               say the same thing, so they sit together, not as separate steps) */}
        <h2 className="font-display text-xl font-semibold text-ink">
          What are you in the mood for?
        </h2>
        <p className="mt-1 font-serif text-sm text-ink-soft">
          Describe your ideal day in a sentence, or just tap a few categories —
          both are optional.
        </p>

        <label htmlFor="plan-goals" className="sr-only">
          Describe your ideal day
        </label>
        <textarea
          id="plan-goals"
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. A relaxed rainy afternoon — good coffee, a bookshop to browse, then a cozy dinner. Nothing too far."
          className="mt-3 w-full rounded-lg border border-border bg-cream px-3.5 py-2.5 font-serif text-ink placeholder:text-ink-soft/60 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600"
        />

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
            or tap categories
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <fieldset>
          <legend className="sr-only">Categories</legend>
          <div className="flex flex-wrap gap-2">
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

        {/* 2) SETTINGS — how long + when */}
        <div className="mt-6 flex flex-col gap-5 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
          <fieldset>
            <legend className="font-serif text-sm font-medium text-ink">
              How long?
            </legend>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:flex">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={duration === d.value}
                  onClick={() => setDuration(d.value)}
                  className={`flex flex-col rounded-lg border px-3 py-2 text-left transition-colors ${
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

          <label className="font-serif text-sm font-medium text-ink">
            Start at
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-2 block rounded-md border border-border bg-cream px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>

        {/* 3) The one clear action */}
        <button
          type="button"
          onClick={buildPlan}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-accent-700 px-6 py-3.5 font-serif text-base font-medium text-cream shadow-sm transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "Planning your day…"
            : plan
              ? "↻ Re-plan my day"
              : "Build my day →"}
        </button>
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
          {/* What Gemini understood from the free-text description (the framing
              sentence itself appears in the narration below). */}
          {plan.interpretation && (
            <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-cream px-4 py-2.5">
              <span className="font-mono text-[11px] uppercase tracking-wide text-accent-700">
                ✦ From your description
              </span>
              <span className="font-mono text-[11px] text-ink-soft">·</span>
              {plan.interpretation.interests.map((i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-surface px-2 py-0.5 font-serif text-xs text-ink"
                >
                  {i}
                </span>
              ))}
              {plan.interpretation.keep_close && (
                <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-serif text-xs text-ink">
                  kept nearby
                </span>
              )}
            </div>
          )}

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

          <MapListToggle view={mobileView} onChange={setMobileView} />

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <section
              aria-label="Itinerary"
              className={mobileView === "list" ? "block lg:block" : "hidden lg:block"}
            >
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

            <section
              aria-label="Route map"
              className={`h-[70vh] lg:sticky lg:top-4 ${
                mobileView === "map" ? "block" : "hidden"
              } lg:block`}
            >
              {/* key remounts the map when revealed on mobile (no grey 0×0). */}
              <MapView
                key={mobileView}
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
