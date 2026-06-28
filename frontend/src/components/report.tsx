/**
 * Shared report UI primitives used by BOTH the owner dashboard and the user
 * "My Local Impact" report — a segmented control, a period-over-period delta
 * badge, a KPI tile, and the narrative callout. Keeping them here is the
 * frontend half of "one report pattern, two subjects": the pages differ in
 * their data, not their building blocks.
 */

import type { ReactNode } from "react";
import type { Change } from "../types";

/** A reusable segmented (single-choice) control built on the aria-pressed pill
 *  pattern used elsewhere in the app — used for granularity + date presets. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-1"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`rounded-full border px-3 py-1 font-mono text-xs ${
              on
                ? "border-accent-700 bg-accent-700 text-cream"
                : "border-border text-ink-soft hover:border-accent-600 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A period-over-period delta: ▲ green when up, ▼ rust when down, "new" when
 *  there was no prior base to compare against. Renders nothing for no change. */
export function DeltaBadge({ change }: { change?: Change }) {
  if (!change) return null;
  if (change.pct === null) {
    if (!change.abs) return null;
    return (
      <span
        className="font-mono text-[11px] text-verified"
        title="No activity in the previous period"
      >
        new
      </span>
    );
  }
  if (change.pct === 0) return null;
  const up = change.pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-[11px] ${
        up ? "text-verified" : "text-accent-700"
      }`}
      title={`${up ? "Up" : "Down"} ${Math.abs(change.pct)}% vs the previous period`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(change.pct)}%
    </span>
  );
}

/** A headline number tile with an optional comparison badge. */
export function KpiCard({
  label,
  value,
  change,
}: {
  label: string;
  value: ReactNode;
  change?: Change;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-2xl font-semibold text-ink">{value}</p>
        <DeltaBadge change={change} />
      </div>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
        {label}
      </p>
    </div>
  );
}

/** The auto-generated plain-English highlights, as a calm callout. */
export function NarrativeCard({ lines }: { lines?: string[] }) {
  if (!lines || lines.length === 0) return null;
  return (
    <section
      aria-label="Highlights"
      className="rounded-lg border border-border bg-cream p-5"
    >
      <h2 className="font-display text-lg font-semibold text-ink">
        Highlights
      </h2>
      <ul className="mt-2 space-y-1 font-serif text-sm text-ink">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-accent-700">
              •
            </span>
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
