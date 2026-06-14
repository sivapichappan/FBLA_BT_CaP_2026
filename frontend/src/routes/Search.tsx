/**
 * Search — the core discovery experience (§8.1, §8.3).
 *
 * - Filter state lives in the URL (?q=…&cat=…&sort=…) so a filtered search is
 *   shareable and survives reload.
 * - Fetches are debounced 300 ms so typing doesn't spam the API.
 * - The result list and the map share hover state (card ↔ pin sync).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BusinessCard } from "../components/BusinessCard";
import { FilterBar } from "../components/FilterBar";
import { LocationControl } from "../components/LocationControl";
import { MapView } from "../components/MapView";
import { Reveal } from "../components/Reveal";
import { BizImage, EmptyState, Skeleton } from "../components/ui";
import { businessApi, recommendApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocation } from "../lib/location";
import { usePageTitle } from "../lib/usePageTitle";
import type {
  Business,
  Category,
  Recommendation,
  SearchFilters,
} from "../types";

/** URL ⇄ filters codec, kept tiny and explicit. */
function filtersFromUrl(sp: URLSearchParams): SearchFilters {
  return {
    q: sp.get("q") ?? "",
    categories: sp.get("cat")?.split(",").filter(Boolean) ?? [],
    min_rating: Number(sp.get("min_rating")) || 0,
    price_levels:
      sp
        .get("price")
        ?.split(",")
        .map(Number)
        .filter((n) => n >= 1 && n <= 4) ?? [],
    open_now: sp.get("open") === "1",
    sort: (["best_match", "distance", "rating", "reviews"].includes(
      sp.get("sort") ?? "",
    )
      ? sp.get("sort")
      : "best_match") as SearchFilters["sort"],
  };
}

function urlFromFilters(f: SearchFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.categories.length) sp.set("cat", f.categories.join(","));
  if (f.min_rating) sp.set("min_rating", String(f.min_rating));
  if (f.price_levels.length) sp.set("price", f.price_levels.join(","));
  if (f.open_now) sp.set("open", "1");
  if (f.sort !== "best_match") sp.set("sort", f.sort);
  return sp;
}

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<SearchFilters>(() =>
    filtersFromUrl(searchParams),
  );
  const [results, setResults] = useState<Business[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredRef, setHoveredRef] = useState<string | null>(null);
  // Set when the backend widened the circle to reach 10 small businesses.
  const [widenedToKm, setWidenedToKm] = useState<number | null>(null);
  // Classic = keyword/filter search; Vibe = semantic search by feel. Initialized
  // from ?kind= so the Discover homepage can hand off a vibe search directly.
  const [searchKind, setSearchKind] = useState<"classic" | "vibe">(
    searchParams.get("kind") === "vibe" ? "vibe" : "classic",
  );
  const [vibeUnavailable, setVibeUnavailable] = useState(false);
  const coords = useLocation();
  const navigate = useNavigate();
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const { user } = useAuth();
  const [forYou, setForYou] = useState<Recommendation[]>([]);
  usePageTitle(filters.q ? `“${filters.q}”` : "Search");

  // Personalized picks for signed-in users (hidden while actively searching).
  useEffect(() => {
    if (!user) {
      setForYou([]);
      return;
    }
    recommendApi
      .forYou(coords.lat, coords.lng)
      .then(setForYou)
      .catch(() => setForYou([]));
  }, [user, coords.lat, coords.lng]);

  // Category list loads once (graceful: an error just hides the chips).
  useEffect(() => {
    businessApi
      .categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const runSearch = useCallback(
    async (
      f: SearchFilters,
      lat: number,
      lng: number,
      kind: "classic" | "vibe",
    ) => {
      setLoading(true);
      setError(null);
      setVibeUnavailable(false);
      setWidenedToKm(null);
      try {
        // Vibe mode: semantic search over the local index — meaning, not
        // keywords. Falls back to a notice (not an error) when the AI is off.
        // The FilterBar filters ride along: similarity orders, filters gate.
        if (kind === "vibe" && f.q.trim().length >= 3) {
          const vibe = await businessApi.vibe({
            q: f.q.trim(),
            lat,
            lng,
            categories: f.categories.join(",") || undefined,
            min_rating: f.min_rating || undefined,
            price_levels: f.price_levels.join(",") || undefined,
            open_now: f.open_now,
          });
          if (vibe.available) {
            setResults(vibe.results);
          } else {
            setVibeUnavailable(true);
            setResults([]);
          }
          return;
        }
        const res = await businessApi.search({
          q: f.q || undefined,
          lat,
          lng,
          categories: f.categories.join(",") || undefined,
          min_rating: f.min_rating || undefined,
          price_levels: f.price_levels.join(",") || undefined,
          open_now: f.open_now,
          sort: f.sort,
        });
        setResults(res.results);
        if (res.radius_expanded) setWidenedToKm(res.radius_used_km);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Debounced fetch + URL sync on every filter/location change.
  useEffect(() => {
    setSearchParams(urlFromFilters(filters), { replace: true });
    clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => runSearch(filters, coords.lat, coords.lng, searchKind),
      300,
    );
    return () => clearTimeout(debounce.current);
  }, [filters, coords.lat, coords.lng, searchKind, runSearch, setSearchParams]);

  const center = useMemo(
    () => ({ lat: coords.lat, lng: coords.lng }),
    [coords.lat, coords.lng],
  );

  return (
    <main className="container-page py-6">
      <h1 className="sr-only">Search local businesses</h1>

      {/* Query input */}
      {/* "For you" — explainable personalized picks (signed-in, not searching) */}
      {user && !filters.q && forYou.length > 0 && (
        <section aria-label="Recommended for you" className="mb-6">
          <h2 className="font-display text-xl font-semibold text-ink">
            For you
          </h2>
          <p className="font-serif text-sm text-ink-soft">
            Based on what you've saved and reviewed.
          </p>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {forYou.map((p) => (
              <button
                key={p.ref}
                type="button"
                onClick={() =>
                  navigate(`/business/${encodeURIComponent(p.ref)}`)
                }
                className="w-56 shrink-0 rounded-lg border border-border bg-surface text-left shadow-warm transition-transform hover:-translate-y-0.5"
              >
                <BizImage
                  photoUrl={p.photo_url}
                  name={p.name}
                  className="h-24 w-full rounded-t-lg"
                  focusX={p.photo_focus_x}
                  focusY={p.photo_focus_y}
                />
                <div className="p-3">
                  <p className="truncate font-display font-semibold text-ink">
                    {p.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 font-serif text-xs italic text-accent-700">
                    {p.reason}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <form
        className="mb-4"
        onSubmit={
          (e) => e.preventDefault() /* search is live; Enter just blurs */
        }
        role="search"
      >
        <label htmlFor="search-q" className="sr-only">
          Search businesses
        </label>
        <div className="flex gap-2">
          <input
            id="search-q"
            type="search"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder={
              searchKind === "classic"
                ? "Search — coffee, ramen, bookstore…"
                : "Describe a feeling — cozy rainy-day reading spot…"
            }
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 font-serif text-lg text-ink placeholder:text-ink-soft/60"
          />
          {/* Classic = keywords + filters · Vibe = semantic, by meaning */}
          <div
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface p-1"
            role="group"
            aria-label="Search mode"
          >
            {(
              [
                ["classic", "Classic"],
                ["vibe", "✦ Vibe"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={searchKind === kind}
                onClick={() => setSearchKind(kind)}
                className={`rounded-md px-3 py-2 font-serif text-sm transition-colors ${
                  searchKind === kind
                    ? "bg-accent-700 text-cream"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {searchKind === "vibe" && (
          <p className="mt-1.5 font-mono text-xs text-ink-soft">
            Vibe search matches the <em>meaning</em> of your words against what
            reviewers actually say — try “old new york atmosphere”.
          </p>
        )}
      </form>

      {vibeUnavailable && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-border bg-surface px-4 py-2 font-serif text-sm text-ink-soft"
        >
          ⚙ Vibe search needs the AI connection, which is unavailable right now
          — Classic search still works fully offline.
        </p>
      )}

      <FilterBar
        filters={filters}
        categories={categories}
        onChange={setFilters}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p
          className="flex items-center gap-2 font-mono text-xs text-ink-soft"
          aria-live="polite"
        >
          <span>
            {loading
              ? "Searching…"
              : `${results.length} small business${results.length === 1 ? "" : "es"}`}
          </span>
          <LocationControl />
        </p>
      </div>

      {/* The min-results contract, stated honestly: the backend widened the
          circle until it found enough small businesses. */}
      {widenedToKm !== null && !loading && (
        <p
          role="status"
          className="mt-2 rounded-md border border-border bg-surface px-3 py-1.5 font-serif text-xs text-ink-soft"
        >
          ⌖ Widened the search to {widenedToKm} km to find enough small
          businesses near you.
        </p>
      )}

      {/* Results + map — the map gets the larger share: it's the spatial
          half of the experience and cards stay readable at ~45% width. */}
      <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <section
          aria-label="Results"
          className="max-h-[75vh] space-y-3 overflow-y-auto pr-1"
        >
          {loading ? (
            <Skeleton count={4} height="7rem" />
          ) : error ? (
            <EmptyState title="Something went wrong">{error}</EmptyState>
          ) : results.length === 0 ? (
            <EmptyState title="No matches nearby">
              Try clearing a filter or searching something broader, like
              “coffee”.
            </EmptyState>
          ) : (
            results.map((b, i) => (
              // Staggered fade-up entrance (§14); capped so deep lists don't lag.
              <Reveal key={b.ref} delay={Math.min(i * 0.05, 0.4)}>
                {b.similarity !== undefined && (
                  <p className="mb-1 font-mono text-[11px] text-accent-700">
                    ✦ {Math.round(b.similarity * 100)}% vibe match
                  </p>
                )}
                <BusinessCard
                  business={b}
                  rank={i + 1}
                  onHover={setHoveredRef}
                  highlighted={hoveredRef === b.ref}
                />
              </Reveal>
            ))
          )}
        </section>

        <section aria-label="Map" className="sticky top-4 h-[75vh]">
          <MapView
            businesses={results}
            center={center}
            hoveredRef={hoveredRef}
            onHover={setHoveredRef}
            onSelect={(ref) => navigate(`/business/${encodeURIComponent(ref)}`)}
          />
        </section>
      </div>
    </main>
  );
}
