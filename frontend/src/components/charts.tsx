/**
 * Tiny hand-rolled charts for the owner dashboard. No chart library — plain
 * HTML/CSS flex columns we fully understand and can defend line-by-line in
 * Q&A (§18), and zero extra dependencies to attribute.
 *
 * Why HTML instead of SVG: a stretched SVG viewBox distorts TEXT along with
 * the bars. With flex columns, bars scale to the container while labels stay
 * crisp at their natural size on any screen width.
 */

interface BarDatum {
  label: string;
  value: number;
}

/** Vertical bar chart with per-bar labels (e.g. the 1★–5★ distribution). */
export function BarChart({
  data,
  color = "var(--accent-600)",
}: {
  data: BarDatum[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div
      className="flex h-40 items-end gap-2 pt-1"
      role="img"
      aria-label={`Bar chart: ${data.map((d) => `${d.label}: ${d.value}`).join(", ")}`}
    >
      {data.map((d) => (
        <div
          key={d.label}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
        >
          {d.value > 0 && (
            <span className="font-mono text-xs text-ink">{d.value}</span>
          )}
          <div
            className="w-3/5 max-w-10 rounded-t"
            style={{
              height: `${(d.value / max) * 75}%`,
              minHeight: d.value > 0 ? 3 : 0,
              backgroundColor: color,
            }}
          />
          <span className="mt-1 truncate font-mono text-[11px] text-ink-soft">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Conversion funnel: three horizontal bars scaled to the first step, with
 * step-over-step percentages between them — "is interest becoming customers?"
 */
export function FunnelChart({
  steps,
}: {
  steps: { label: string; value: number; pctOfPrev?: number }[];
}) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div
      className="space-y-2"
      role="img"
      aria-label={`Funnel: ${steps.map((s) => `${s.label} ${s.value}`).join(", ")}`}
    >
      {steps.map((s, i) => (
        <div key={s.label}>
          {i > 0 && s.pctOfPrev !== undefined && (
            <p className="mb-1 pl-1 font-mono text-[10px] text-ink-soft">
              ↓ {s.pctOfPrev}% convert
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 font-mono text-xs uppercase tracking-wide text-ink-soft">
              {s.label}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-cream">
              <div
                className="flex h-full items-center rounded bg-accent-600 pl-2 font-mono text-xs font-bold text-cream transition-[width] duration-300"
                style={{
                  width: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 0)}%`,
                }}
              >
                {s.value}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Day-by-day trend as slim bars (clearer than a line for sparse demo data). */
export function TrendChart({
  data,
  color = "var(--verified)",
}: {
  data: { day: string; count: number }[];
  color?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center font-serif text-sm text-ink-soft">
        No activity in this range.
      </p>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  // With many bars, label every Nth day so the axis stays readable.
  const labelEvery = data.length <= 10 ? 1 : Math.ceil(data.length / 7);
  const showValues = data.length <= 20;

  return (
    <div
      className="flex h-36 items-end gap-1 pt-1"
      role="img"
      aria-label={`Trend: ${data.map((d) => `${d.day}: ${d.count}`).join(", ")}`}
    >
      {data.map((d, i) => (
        <div
          key={d.day}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
        >
          {showValues && (
            <span className="font-mono text-[10px] leading-tight text-ink">
              {d.count}
            </span>
          )}
          <div
            className="w-full max-w-5 rounded-t"
            style={{
              height: `${(d.count / max) * 70}%`,
              minHeight: 2,
              backgroundColor: color,
            }}
          />
          <span className="mt-1 h-4 truncate font-mono text-[10px] text-ink-soft">
            {i % labelEvery === 0 ? d.day.slice(5) : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
