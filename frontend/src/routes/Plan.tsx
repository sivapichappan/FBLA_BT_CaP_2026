/**
 * The small-business trip planner: describe your day in words (or tap a few
 * categories), set your start/end time and number of stops → get a walkable,
 * ALL-INDEPENDENT itinerary with times, walking legs, a map, and an AI
 * narration (deterministic
 * fallback offline — the "✦/⚙" chip shows which engine narrated). Signed-in
 * users can save trips and revisit them.
 */

import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CategoryIcon } from "../components/CategoryIcon";
import { LocationControl } from "../components/LocationControl";
import { MapView } from "../components/MapView";
import { MapListToggle } from "../components/MapListToggle";
import { BizImage, LocalBadge, Skeleton, StarRating } from "../components/ui";
import { ApiError, dealApi, tripApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocation } from "../lib/location";
import { usePageTitle } from "../lib/usePageTitle";
import type { SavedTrip, TripPlan, TripStop } from "../types";

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

const INTERESTS = [
  "Coffee",
  "Bookstore",
  "Restaurant",
  "Retail",
  "Dessert",
  "Bar",
  "Grocery",
];

/** A labelled row of mutually-exclusive pills (a toggle; clicking the active one
 *  clears it back to the neutral default). Reused for the optional knobs. */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T | null) => void;
}) {
  return (
    <div>
      <span className="font-serif text-sm font-medium text-ink">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : o.value)}
              className={`rounded-full border px-3 py-1.5 font-serif text-sm transition-colors ${
                on
                  ? "border-accent-700 bg-accent-700 text-cream"
                  : "border-border bg-cream text-ink-soft hover:border-accent-600 hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Plan() {
  usePageTitle("Plan a day");
  const { user } = useAuth();
  const coords = useLocation();
  const navigate = useNavigate();

  const [interests, setInterests] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("16:00");
  const [numStops, setNumStops] = useState(4);
  const [goals, setGoals] = useState("");
  // Optional personalisation knobs (idea 4/6/8); null = the neutral default.
  const [audience, setAudience] = useState<
    "solo" | "couple" | "family" | "group" | null
  >(null);
  const [occasion, setOccasion] = useState<
    "casual" | "date" | "celebrate" | null
  >(null);
  const [pace, setPace] = useState<"relaxed" | "normal" | "packed" | null>(
    null,
  );
  const [budget, setBudget] = useState<number | null>(null);
  // Which day the outing is for (open-on-arrival, idea 3). 0=Sun..6=Sat, like
  // JS getDay() and our backend — defaults to today.
  const [weekday, setWeekday] = useState<number | null>(new Date().getDay());
  const [showTune, setShowTune] = useState(false);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [optionIdx, setOptionIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedTrip[]>([]);
  const [hoveredRef, setHoveredRef] = useState<string | null>(null);
  // Below lg the itinerary and map can't sit side-by-side; the user toggles.
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  // Edit-in-place (idea 1): an editable copy of the selected option's stops, the
  // set of refs the user locked, per-stop dwell overrides, and a window warning.
  const [editedStops, setEditedStops] = useState<TripStop[]>([]);
  const [lockedRefs, setLockedRefs] = useState<Set<string>>(new Set());
  const [dwellOverrides, setDwellOverrides] = useState<Record<string, number>>(
    {},
  );
  const [overWindow, setOverWindow] = useState(false);

  // The itinerary/map below always reflect the option the user has selected.
  const option = plan?.options[optionIdx] ?? null;

  useEffect(() => {
    if (user)
      tripApi
        .mine()
        .then(setSaved)
        .catch(() => setSaved([]));
  }, [user]);

  // Building a plan or switching options resets the editable copy to that
  // option's stops (edits are per-option). Locks persist across re-plans.
  useEffect(() => {
    setEditedStops(option ? option.stops : []);
    setDwellOverrides({});
    setOverWindow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, optionIdx]);

  // Apply an edit (new stop list) and let the server re-time it — one authority
  // for the clock so the UI never drifts from the walk/dwell/window rules.
  async function applyEdit(
    next: TripStop[],
    overrides: Record<string, number> = dwellOverrides,
  ) {
    setEditedStops(next); // optimistic
    if (!plan) return;
    try {
      const r = await tripApi.retime({
        start: plan.start,
        end_time: plan.end_time,
        stops: next,
        dwell_overrides: overrides,
      });
      setEditedStops(r.stops);
      setOverWindow(r.over_window);
    } catch {
      /* keep the optimistic state if re-timing fails */
    }
  }

  /** Swap a stop for the next alternate on its bench (instant, offline). */
  function swapStop(i: number) {
    const s = editedStops[i];
    const bench = s.bench ?? [];
    if (!bench.length) return;
    const [next, ...rest] = bench;
    // Rotate the current pick to the end of the bench so swaps can cycle.
    const oldAsBench = {
      ...s,
      bench: undefined,
      locked: undefined,
    } as TripStop;
    const newStop: TripStop = {
      ...next,
      slot: s.slot,
      dwell_min: s.dwell_min,
      explore_after_min: s.explore_after_min, // keep this slot's free-time gap on swap
      bench: [...rest, oldAsBench],
      locked: false,
    };
    applyEdit(editedStops.map((x, j) => (j === i ? newStop : x)));
  }

  function removeStop(i: number) {
    applyEdit(editedStops.filter((_, j) => j !== i));
  }

  function moveStop(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= editedStops.length) return;
    const next = [...editedStops];
    [next[i], next[j]] = [next[j], next[i]];
    applyEdit(next);
  }

  /** Toggle a lock — kept exactly when you re-plan around it. */
  function toggleLock(ref: string) {
    setLockedRefs((cur) => {
      const n = new Set(cur);
      n.has(ref) ? n.delete(ref) : n.add(ref);
      return n;
    });
    setEditedStops((cur) =>
      cur.map((s) => (s.ref === ref ? { ...s, locked: !s.locked } : s)),
    );
  }

  function changeDwell(ref: string, current: number, delta: number) {
    const nv = Math.max(10, Math.min(240, current + delta));
    const nd = { ...dwellOverrides, [ref]: nv };
    setDwellOverrides(nd);
    applyEdit(editedStops, nd);
  }

  /** Add a stop, drawn from the first stop that still has a bench alternate. */
  function addStop() {
    const donor = editedStops.find((s) => (s.bench?.length ?? 0) > 0);
    if (!donor) return;
    const cand = donor.bench![0];
    applyEdit([
      ...editedStops,
      {
        ...cand,
        slot: donor.slot,
        dwell_min: donor.dwell_min,
        bench: donor.bench!.slice(1),
        locked: false,
      },
    ]);
  }

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
    // "HH:MM" strings compare chronologically, so this catches a backwards
    // window before the request (the backend also rejects it with a 422).
    if (endTime <= startTime) {
      setMessage("Your end time needs to be after your start time.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setPlan(
        await tripApi.plan({
          lat: coords.lat,
          lng: coords.lng,
          interests,
          start_time: startTime,
          end_time: endTime,
          num_stops: numStops,
          goals: goals.trim() || undefined,
          audience: audience ?? undefined,
          occasion: occasion ?? undefined,
          pace: pace ?? undefined,
          budget: budget ?? undefined,
          weekday: weekday ?? undefined,
          locked_refs: lockedRefs.size ? Array.from(lockedRefs) : undefined,
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
      window.prompt("Name this trip:", `My ${plan.num_stops}-stop local day`) ??
      "";
    if (!title.trim()) return;
    try {
      const trip = await tripApi.save(
        title.trim(),
        {
          interests: plan.interests,
          start: plan.start,
          end_time: plan.end_time,
          num_stops: plan.num_stops,
          knobs: plan.knobs, // the personalisation knobs the day was built with
          option: option.key, // remember which day-shape was saved
        },
        editedStops, // save the edited itinerary, not the original
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

  /** Redeem a deal surfaced on a stop (idea 10a). */
  async function redeemDeal(dealId: number) {
    try {
      const r = await dealApi.redeem(dealId);
      setMessage(
        `Redeemed! Show code ${r.code} at ${r.business_name ?? "the counter"}.`,
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not redeem.");
    }
  }

  /** Ensure a saved trip has a public share token, returning it (idea 10c). */
  async function ensureToken(t: SavedTrip): Promise<string> {
    if (t.share_token) return t.share_token;
    const token = (await tripApi.share(t.id)).share_token;
    setSaved((cur) =>
      cur.map((x) => (x.id === t.id ? { ...x, share_token: token } : x)),
    );
    return token;
  }

  async function shareTrip(t: SavedTrip) {
    try {
      const token = await ensureToken(t);
      const url = `${window.location.origin}/trip/shared/${token}`;
      await navigator.clipboard?.writeText(url);
      setMessage(`Share link copied — ${url}`);
    } catch (err) {
      setMessage(
        err instanceof ApiError
          ? err.message
          : "Could not create a share link.",
      );
    }
  }

  async function downloadIcs(t: SavedTrip) {
    try {
      const token = await ensureToken(t);
      window.location.href = tripApi.icsUrl(token);
    } catch (err) {
      setMessage(
        err instanceof ApiError
          ? err.message
          : "Could not export the calendar.",
      );
    }
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

        {/* 2) SETTINGS — start, end, and how many stops, each chosen separately */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-3">
          <label className="font-serif text-sm font-medium text-ink">
            Start at
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-2 block w-full rounded-md border border-border bg-cream px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="font-serif text-sm font-medium text-ink">
            End by
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-2 block w-full rounded-md border border-border bg-cream px-3 py-2 font-mono text-sm"
            />
          </label>

          {/* Stops — a stepper, bounded 1–8 to match the planner. */}
          <div className="font-serif text-sm font-medium text-ink">
            Stops
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNumStops((n) => Math.max(1, n - 1))}
                disabled={numStops <= 1}
                aria-label="Fewer stops"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-cream text-lg text-ink transition-colors hover:border-accent-600 disabled:opacity-40"
              >
                −
              </button>
              <span
                aria-live="polite"
                className="w-8 text-center font-mono text-base text-ink"
              >
                {numStops}
              </span>
              <button
                type="button"
                onClick={() => setNumStops((n) => Math.min(8, n + 1))}
                disabled={numStops >= 8}
                aria-label="More stops"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-cream text-lg text-ink transition-colors hover:border-accent-600 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* 2b) FINE-TUNE — optional knobs (who/occasion/pace/budget). Collapsed
               by default so the form stays simple; all default to neutral. */}
        <div className="mt-4 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowTune((v) => !v)}
            aria-expanded={showTune}
            className="font-serif text-sm text-accent-700 underline-offset-2 hover:underline"
          >
            {showTune ? "− Fine-tune" : "+ Fine-tune (optional)"}
          </button>
          {showTune && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Segmented
                label="Who's it for?"
                value={audience}
                onChange={setAudience}
                options={[
                  { value: "solo", label: "Solo" },
                  { value: "couple", label: "Couple" },
                  { value: "family", label: "Family" },
                  { value: "group", label: "Group" },
                ]}
              />
              <Segmented
                label="Occasion"
                value={occasion}
                onChange={setOccasion}
                options={[
                  { value: "casual", label: "Casual" },
                  { value: "date", label: "Date" },
                  { value: "celebrate", label: "Celebrate" },
                ]}
              />
              <Segmented
                label="Pace"
                value={pace}
                onChange={setPace}
                options={[
                  { value: "relaxed", label: "Relaxed" },
                  { value: "normal", label: "Normal" },
                  { value: "packed", label: "Packed" },
                ]}
              />
              <Segmented
                label="Budget"
                value={budget}
                onChange={setBudget}
                options={[
                  { value: 1, label: "$" },
                  { value: 2, label: "$$" },
                  { value: 3, label: "$$$" },
                ]}
              />
              <div className="sm:col-span-2">
                <Segmented
                  label="Which day? (checks opening hours)"
                  value={weekday}
                  onChange={setWeekday}
                  options={[
                    { value: 0, label: "Sun" },
                    { value: 1, label: "Mon" },
                    { value: 2, label: "Tue" },
                    { value: 3, label: "Wed" },
                    { value: 4, label: "Thu" },
                    { value: 5, label: "Fri" },
                    { value: 6, label: "Sat" },
                  ]}
                />
              </div>
            </div>
          )}
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
              className={`min-w-0 ${mobileView === "list" ? "block" : "hidden"} lg:block`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold text-ink">
                  {plan.options.length > 1
                    ? `${option.label} · `
                    : "Your day · "}
                  {editedStops.length} stops ·{" "}
                  {editedStops
                    .reduce((a, s) => a + s.walk_from_prev_km, 0)
                    .toFixed(1)}{" "}
                  km on foot
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

              {/* Money-kept-local estimate (idea 8) — ties the day to the
                  app's local-impact theme. Hidden when we have no price data. */}
              {option.estimated_spend && option.estimated_spend.low > 0 && (
                <p className="mt-1 font-mono text-xs text-verified">
                  ≈ ${option.estimated_spend.low}–${option.estimated_spend.high}{" "}
                  kept local
                  {option.estimated_spend.unknown_count > 0 && (
                    <span className="text-ink-soft">
                      {" "}
                      ({option.estimated_spend.unknown_count} stop
                      {option.estimated_spend.unknown_count === 1
                        ? ""
                        : "s"}{" "}
                      with no price data)
                    </span>
                  )}
                </p>
              )}

              {/* Narration */}
              <blockquote className="mt-3 whitespace-pre-line break-words border-l-2 border-accent-600 bg-surface px-4 py-3 font-serif text-sm italic text-ink">
                {option.narrative}
                <span className="mt-1 block font-mono text-[10px] not-italic text-ink-soft">
                  {option.mode === "llm" ? "✦ AI narration" : "⚙ offline mode"}
                </span>
              </blockquote>

              {/* Order-realism note (idea 2): honest word when the day couldn't
                  follow the exact order described (a stop didn't fit the window). */}
              {option.sequence_note && (
                <p className="mt-2 font-mono text-[11px] text-ink-soft">
                  ↺ {option.sequence_note}
                </p>
              )}
              {/* Spread-out area note: some stops were too far to walk to. */}
              {option.spread_note && (
                <p className="mt-2 font-mono text-[11px] text-ink-soft">
                  🚶 {option.spread_note}
                </p>
              )}

              {/* A day that no longer fits the window after edits (warn, never block). */}
              {overWindow && (
                <p className="mt-3 rounded-md border border-chain bg-cream px-3 py-2 font-mono text-[11px] text-ink-soft">
                  ⚠ This edited day runs past your end time — remove a stop or
                  shorten a stay.
                </p>
              )}

              {/* Timeline — the EDITABLE copy: swap ♻ / remove ✕ / lock 🔒 /
                  reorder ▲▼ / adjust the stay, each re-timed by the server. */}
              <ol className="mt-4 space-y-3">
                {editedStops.map((s, i) => (
                  <Fragment key={s.ref}>
                    <li
                      className={`flex flex-col gap-3 rounded-lg border bg-surface p-3 transition-colors ${
                        hoveredRef === s.ref
                          ? "border-accent-600"
                          : "border-border"
                      }`}
                      onMouseEnter={() => setHoveredRef(s.ref)}
                      onMouseLeave={() => setHoveredRef(null)}
                    >
                      {/* Media row: time · image · details, sized to its content so
                          the image fills the row with no dead space beside it. */}
                      <div className="flex gap-3">
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
                          className="w-28 shrink-0 self-stretch rounded-md border border-border min-h-[4.5rem]"
                          focusX={s.photo_focus_x}
                          focusY={s.photo_focus_y}
                        />
                        <div className="min-w-0 flex-1">
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
                                <StarRating
                                  rating={s.average_rating}
                                  size={12}
                                />
                                <span className="font-serif text-xs text-ink-soft">
                                  {s.average_rating.toFixed(1)}
                                </span>
                              </span>
                            )}
                            <LocalBadge badge={s.local_badge} />
                            {/* Open-when-you-arrive (idea 3): only for stops whose
                            hours we actually know (seeded businesses). */}
                            {s.hours_known && s.open_at_arrival === true && (
                              <span className="rounded-full border border-verified px-2 py-0.5 font-mono text-[10px] text-verified">
                                ✓ Open when you arrive
                              </span>
                            )}
                            {s.hours_known && s.open_at_arrival === false && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-chain px-2 py-0.5 font-mono text-[10px] text-ink-soft">
                                ⚠ May be closed
                              </span>
                            )}
                            {s.is_favorite && (
                              <span className="rounded-full border border-accent-600 px-2 py-0.5 font-mono text-[10px] text-accent-700">
                                ♥ Your favorite
                              </span>
                            )}
                          </div>

                          {/* Active LocalLens deals on this stop (idea 10a) — redeem
                          right from the itinerary. */}
                          {s.deals?.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => redeemDeal(d.id)}
                              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-accent-600 bg-cream px-2 py-1 font-serif text-xs text-accent-700 hover:bg-accent-700 hover:text-cream"
                            >
                              🏷 {d.discount_pct}% off — {d.title} · Redeem
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Actions footer — a full-width toolbar, so each card reads as
                          a balanced media row + actions with no dead space. Controls
                          are large, clearly labelled, and touch-friendly; each has a
                          descriptive accessible name. */}
                      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                        <button
                          type="button"
                          onClick={() => swapStop(i)}
                          disabled={!s.bench?.length}
                          title={
                            s.bench?.length
                              ? "Swap for a nearby alternative"
                              : "No nearby alternative to swap to"
                          }
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border bg-cream px-3 py-1.5 font-serif text-xs text-ink hover:border-accent-600 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span aria-hidden>♻</span> Swap
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleLock(s.ref)}
                          aria-pressed={!!s.locked}
                          title={
                            s.locked
                              ? "Locked — kept when you re-plan"
                              : "Lock this stop so re-planning keeps it"
                          }
                          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-3 py-1.5 font-serif text-xs ${
                            s.locked
                              ? "border-accent-700 bg-accent-700 text-cream"
                              : "border-border bg-cream text-ink hover:border-accent-600 hover:text-accent-700"
                          }`}
                        >
                          <span aria-hidden>{s.locked ? "🔒" : "🔓"}</span>
                          {s.locked ? "Locked" : "Lock"}
                        </button>

                        {/* Stay (dwell) stepper — shows the live value so the
                              −/＋ buttons are self-explanatory. */}
                        <div className="inline-flex min-h-[36px] items-center gap-0.5 rounded-md border border-border bg-cream px-1">
                          <button
                            type="button"
                            onClick={() => changeDwell(s.ref, s.dwell_min, -15)}
                            aria-label={`Shorten the stay at ${s.name} by 15 minutes`}
                            title="Shorter stay"
                            className="flex h-8 w-8 items-center justify-center rounded text-xl leading-none text-ink-soft hover:bg-surface hover:text-ink"
                          >
                            −
                          </button>
                          <span className="min-w-[5rem] text-center font-serif text-xs text-ink">
                            Stay {s.dwell_min} min
                          </span>
                          <button
                            type="button"
                            onClick={() => changeDwell(s.ref, s.dwell_min, 15)}
                            aria-label={`Lengthen the stay at ${s.name} by 15 minutes`}
                            title="Longer stay"
                            className="flex h-8 w-8 items-center justify-center rounded text-xl leading-none text-ink-soft hover:bg-surface hover:text-ink"
                          >
                            +
                          </button>
                        </div>

                        {/* Reorder earlier / later. */}
                        <div className="inline-flex min-h-[36px] items-center rounded-md border border-border bg-cream">
                          <button
                            type="button"
                            onClick={() => moveStop(i, -1)}
                            disabled={i === 0}
                            aria-label={`Move ${s.name} earlier in the day`}
                            title="Move earlier"
                            className="flex h-9 w-9 items-center justify-center rounded-l-md text-base text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <span className="h-5 w-px bg-border" aria-hidden />
                          <button
                            type="button"
                            onClick={() => moveStop(i, 1)}
                            disabled={i === editedStops.length - 1}
                            aria-label={`Move ${s.name} later in the day`}
                            title="Move later"
                            className="flex h-9 w-9 items-center justify-center rounded-r-md text-base text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </div>

                        {/* Remove — destructive, so it reads as distinct on hover. */}
                        <button
                          type="button"
                          onClick={() => removeStop(i)}
                          aria-label={`Remove ${s.name} from the day`}
                          title="Remove this stop"
                          className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border bg-cream px-3 py-1.5 font-serif text-xs text-ink-soft hover:border-red-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <span aria-hidden>✕</span> Remove
                        </button>
                      </div>
                    </li>
                    {/* Free time between stops when a short day was spread to fill the
                      window — so the clock jump reads as a deliberate wander, not a gap. */}
                    {(s.explore_after_min ?? 0) > 0 &&
                      i < editedStops.length - 1 && (
                        <li className="flex items-center gap-2 pl-[4.5rem] font-mono text-[10px] text-ink-soft">
                          <span aria-hidden>↓</span>≈ {s.explore_after_min} min
                          free time to explore nearby
                        </li>
                      )}
                  </Fragment>
                ))}
              </ol>
              <button
                type="button"
                onClick={addStop}
                className="mt-3 rounded-md border border-dashed border-border px-3 py-1.5 font-serif text-sm text-ink-soft hover:border-accent-600 hover:text-ink"
              >
                ＋ Add a stop
              </button>
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
                businesses={editedStops}
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
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono text-[10px] text-ink-soft">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => shareTrip(t)}
                    className="font-serif text-xs text-accent-700 underline-offset-2 hover:underline"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadIcs(t)}
                    className="font-serif text-xs text-accent-700 underline-offset-2 hover:underline"
                  >
                    Add to calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTrip(t.id)}
                    className="ml-auto font-serif text-xs text-ink-soft underline-offset-2 hover:text-accent-700 hover:underline"
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
