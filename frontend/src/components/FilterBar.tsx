/**
 * Search filters: category multi-select, price, rating floor, open-now, and
 * sort. (No "independent only" toggle — hiding chains is the product itself,
 * enforced by the backend pipeline on every search.) Pure controlled
 * component — state lives in the Search page (where it also syncs to the
 * URL). Buttons use aria-pressed so toggle state is announced to screen
 * readers.
 *
 * Layout: one compact row (sort dropdown + the two most-used quick toggles +
 * a "Filters" disclosure). Price, rating, and categories live in the
 * collapsible panel; a count badge on the disclosure button signals active
 * filters while the panel is closed.
 */

import { useId, useState, type ReactNode } from "react";

import type { Category, SearchFilters } from "../types";

interface Props {
  filters: SearchFilters;
  categories: Category[];
  onChange: (next: SearchFilters) => void;
}

const SORTS: { value: SearchFilters["sort"]; label: string }[] = [
  { value: "best_match", label: "Best match" },
  { value: "distance", label: "Closest" },
  { value: "rating", label: "Top rated" },
  { value: "reviews", label: "Most reviewed" },
];

/** Pill-style toggle button used across the bar. */
function Toggle({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 font-serif text-sm transition-colors ${
        active
          ? "border-accent-700 bg-accent-700 text-cream"
          : "border-border bg-surface text-ink-soft hover:border-accent-600 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Mono uppercase row label inside the expanded panel. */
function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <span className="w-full shrink-0 pt-1 font-mono text-xs uppercase tracking-wide text-ink-soft sm:w-16">
      {children}
    </span>
  );
}

export function FilterBar({ filters, categories, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  const set = (patch: Partial<SearchFilters>) =>
    onChange({ ...filters, ...patch });

  const toggleCategory = (name: string) =>
    set({
      categories: filters.categories.includes(name)
        ? filters.categories.filter((c) => c !== name)
        : [...filters.categories, name],
    });

  const togglePrice = (level: number) =>
    set({
      price_levels: filters.price_levels.includes(level)
        ? filters.price_levels.filter((p) => p !== level)
        : [...filters.price_levels, level],
    });

  // Filters hiding inside the panel — shown as a badge while it's closed.
  const panelCount =
    filters.categories.length +
    filters.price_levels.length +
    (filters.min_rating > 0 ? 1 : 0);

  const activeCount = panelCount + (filters.open_now ? 1 : 0);

  return (
    <section aria-label="Search filters" className="space-y-2">
      {/* Single compact row: sort + quick toggles + disclosure */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`${panelId}-sort`}>
          Sort results
        </label>
        <select
          id={`${panelId}-sort`}
          value={filters.sort}
          onChange={(e) =>
            set({ sort: e.target.value as SearchFilters["sort"] })
          }
          className="rounded-full border border-border bg-surface py-1 pl-3 pr-7 font-serif text-sm text-ink hover:border-accent-600"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <Toggle
          active={filters.open_now}
          onClick={() => set({ open_now: !filters.open_now })}
        >
          Open now
        </Toggle>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-serif text-sm transition-colors ${
            expanded || panelCount > 0
              ? "border-accent-700 text-accent-700"
              : "border-border bg-surface text-ink-soft hover:border-accent-600 hover:text-ink"
          }`}
        >
          Filters
          {panelCount > 0 && (
            <span className="rounded-full bg-accent-700 px-1.5 font-mono text-[11px] leading-4 text-cream">
              {panelCount}
            </span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              set({
                categories: [],
                price_levels: [],
                min_rating: 0,
                open_now: false,
              })
            }
            className="font-serif text-sm text-accent-700 underline-offset-2 hover:underline"
          >
            Clear ({activeCount})
          </button>
        )}
      </div>

      {/* Collapsible panel: price, rating, categories */}
      {expanded && (
        <div
          id={panelId}
          className="space-y-2.5 rounded-lg border border-border bg-surface p-3"
        >
          <div
            className="flex flex-wrap items-start gap-2"
            role="group"
            aria-label="Price and minimum rating"
          >
            <PanelLabel>Price</PanelLabel>
            {[1, 2, 3, 4].map((p) => (
              <Toggle
                key={p}
                active={filters.price_levels.includes(p)}
                onClick={() => togglePrice(p)}
                label={`Price level ${p}`}
              >
                {"$".repeat(p)}
              </Toggle>
            ))}
            <span
              className="mx-1 h-5 w-px self-center bg-border"
              aria-hidden="true"
            />
            <PanelLabel>Rating</PanelLabel>
            {[4, 4.5].map((r) => (
              <Toggle
                key={r}
                active={filters.min_rating === r}
                onClick={() =>
                  set({ min_rating: filters.min_rating === r ? 0 : r })
                }
              >
                {r}★+
              </Toggle>
            ))}
          </div>

          <div
            className="flex flex-wrap items-start gap-2"
            role="group"
            aria-label="Filter by category"
          >
            <PanelLabel>Type</PanelLabel>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Toggle
                  key={c.id}
                  active={filters.categories.includes(c.name)}
                  onClick={() => toggleCategory(c.name)}
                >
                  {c.name}
                </Toggle>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
