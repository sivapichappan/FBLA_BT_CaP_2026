/**
 * Discover — the editorial homepage (the front door to LocalLens). Instead of
 * dropping straight into search results, it opens with the mission + a search
 * bar, then curated sections: browse-by-category tiles, featured independents
 * near you (personalized when signed in), live deals, and a trip-planner CTA.
 *
 * Everything here HANDS OFF to /search: the search box routes to
 * /search?q=…(&kind=vibe), and a category tile routes to /search?cat=Name,
 * where the existing Search page (URL-driven filters) takes over.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CategoryIcon } from "../components/CategoryIcon";
import { LocationControl } from "../components/LocationControl";
import { Reveal } from "../components/Reveal";
import { BizImage, Skeleton } from "../components/ui";
import { businessApi, dealApi, recommendApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocation } from "../lib/location";
import { usePageTitle } from "../lib/usePageTitle";
import type { Business, Category, Deal, Recommendation } from "../types";

/** A featured tile is either a personalized pick (with a reason) or a plain
 *  nearby business — both render the same card, the reason shown when present. */
type Featured = (Business | Recommendation) & { reason?: string };

export function Discover() {
  usePageTitle("Discover local");
  const navigate = useNavigate();
  const { user } = useAuth();
  const coords = useLocation();

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"classic" | "vibe">("classic");
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  // Category tiles + a few live deals load once.
  useEffect(() => {
    businessApi
      .categories()
      .then(setCategories)
      .catch(() => setCategories([]));
    dealApi
      .listActive()
      .then((d) => setDeals(d.slice(0, 3)))
      .catch(() => setDeals([]));
  }, []);

  // Featured independents: personalized picks when signed in, otherwise the
  // best nearby small businesses. Re-runs when the location changes.
  useEffect(() => {
    let cancelled = false;
    setLoadingFeatured(true);
    const load: Promise<Featured[]> = user
      ? recommendApi.forYou(coords.lat, coords.lng)
      : businessApi
          .search({ lat: coords.lat, lng: coords.lng })
          .then((r) => r.results);
    load
      .then((rows) => {
        if (!cancelled) setFeatured(rows.slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setFeatured([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFeatured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, coords.lat, coords.lng]);

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (query.trim()) qs.set("q", query.trim());
    if (kind === "vibe") qs.set("kind", "vibe");
    navigate(`/search?${qs}`);
  }

  return (
    <main className="container-page py-10">
      {/* ── Hero: mission + search ─────────────────────────────────────── */}
      <Reveal>
        <section aria-label="Search" className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-5xl font-semibold leading-tight text-ink">
            Find the local spot,
            <br />
            <span className="text-accent-700">not the chain.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl font-serif text-lg text-ink-soft">
            Every search shows only small, independently-owned businesses — the
            chains are filtered out, everywhere, automatically.
          </p>

          <form onSubmit={runSearch} role="search" className="mt-6">
            <label htmlFor="discover-q" className="sr-only">
              Search local businesses
            </label>
            <div className="flex gap-2">
              <input
                id="discover-q"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  kind === "classic"
                    ? "Search — coffee, bookstore, barber…"
                    : "Describe a feeling — cozy rainy-day reading spot…"
                }
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 font-serif text-lg text-ink placeholder:text-ink-soft/60"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-accent-700 px-6 py-3 font-serif font-medium text-cream hover:bg-accent-600"
              >
                Search
              </button>
            </div>
            {/* Classic vs Vibe, mirrored on the Search page */}
            <div className="mt-3 flex items-center justify-center gap-3">
              <div
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1"
                role="group"
                aria-label="Search mode"
              >
                {(
                  [
                    ["classic", "Classic"],
                    ["vibe", "✦ Vibe"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded-md px-3 py-1.5 font-serif text-sm transition-colors ${
                      kind === k
                        ? "bg-accent-700 text-cream"
                        : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <LocationControl />
            </div>
          </form>
        </section>
      </Reveal>

      {/* ── Browse by category ─────────────────────────────────────────── */}
      {categories.length > 0 && (
        <Reveal delay={0.05}>
          <section aria-label="Browse by category" className="mt-12">
            <h2 className="font-display text-2xl font-semibold text-ink">
              Browse by category
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    navigate(`/search?cat=${encodeURIComponent(c.name)}`)
                  }
                  className="group flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-3 py-4 text-ink-soft shadow-warm transition-all duration-300 hover:-translate-y-1 hover:border-accent-600 hover:text-accent-700 hover:shadow-lift"
                >
                  <span className="transition-transform duration-300 group-hover:scale-110">
                    <CategoryIcon name={c.name} />
                  </span>
                  <span className="font-serif text-sm text-ink">{c.name}</span>
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── Featured independents near you ─────────────────────────────── */}
      <Reveal delay={0.1}>
        <section aria-label="Featured businesses" className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold text-ink">
              {user ? "For you" : "Featured near you"}
            </h2>
            <Link
              to="/search"
              className="font-serif text-sm text-accent-700 underline-offset-2 hover:underline"
            >
              See all →
            </Link>
          </div>
          {user && (
            <p className="mt-0.5 font-serif text-sm text-ink-soft">
              Based on what you've saved and reviewed.
            </p>
          )}

          {loadingFeatured ? (
            <div className="mt-4">
              <Skeleton count={1} height="11rem" />
            </div>
          ) : featured.length === 0 ? (
            <p className="mt-4 font-serif text-ink-soft">
              Nothing to feature here yet — try a search above.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((b) => (
                <button
                  key={b.ref}
                  type="button"
                  onClick={() =>
                    navigate(`/business/${encodeURIComponent(b.ref)}`)
                  }
                  className="group overflow-hidden rounded-lg border border-border bg-surface text-left shadow-warm transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
                >
                  <BizImage
                    photoUrl={b.photo_url}
                    name={b.name}
                    className="h-32 w-full transition-transform duration-500 group-hover:scale-105"
                    focusX={b.photo_focus_x}
                    focusY={b.photo_focus_y}
                  />
                  <div className="p-3">
                    <p className="truncate font-display font-semibold text-ink">
                      {b.name}
                    </p>
                    {b.reason ? (
                      <p className="mt-0.5 line-clamp-2 font-serif text-xs italic text-accent-700">
                        {b.reason}
                      </p>
                    ) : (
                      <p className="mt-0.5 truncate font-serif text-xs text-ink-soft">
                        {b.categories.slice(0, 2).join(" · ")}
                        {b.distance_km !== null && ` · ${b.distance_km} km`}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* ── Deals + Plan-a-day CTA ─────────────────────────────────────── */}
      <Reveal delay={0.15}>
        <section className="mt-12 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          {/* Deals */}
          <div className="rounded-lg border border-border bg-surface p-5 shadow-warm">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold text-ink">
                Deals nearby
              </h2>
              <Link
                to="/deals"
                className="font-serif text-sm text-accent-700 underline-offset-2 hover:underline"
              >
                All deals →
              </Link>
            </div>
            {deals.length === 0 ? (
              <p className="mt-2 font-serif text-sm text-ink-soft">
                No active deals right now — check back soon.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {deals.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-cream px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-ink">
                        {d.title}
                      </span>
                      {d.business_name && (
                        <span className="block truncate font-mono text-[11px] text-ink-soft">
                          {d.business_name}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded bg-accent-700 px-2 py-1 font-mono text-xs font-bold text-cream">
                      −{d.discount_pct}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Plan CTA */}
          <Link
            to="/plan"
            className="flex flex-col justify-center rounded-lg border border-accent-600/40 bg-surface p-6 shadow-warm transition-colors hover:border-accent-600"
          >
            <span className="font-display text-2xl font-semibold text-ink">
              Plan a local day
            </span>
            <span className="mt-1 font-serif text-ink-soft">
              A walkable itinerary made only of independent businesses — chains
              can't appear by construction.
            </span>
            <span className="mt-3 font-serif text-accent-700">
              Build my day →
            </span>
          </Link>
        </section>
      </Reveal>
    </main>
  );
}
