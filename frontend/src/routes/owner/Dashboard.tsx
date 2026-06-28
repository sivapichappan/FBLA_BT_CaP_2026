/**
 * Owner analytics dashboard — THE scored "customizable report" (§11).
 *
 * The user customizes the report three ways and it recomputes live:
 *   1. business selector (which listing),
 *   2. date range (quick presets + custom from/to),
 *   3. metric multi-select (only chosen sections are fetched & rendered).
 * The current view exports to CSV and prints. Every control change re-queries
 * the API — the report is genuinely recomputed, not client-filtered.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, FunnelChart, TrendChart } from "../../components/charts";
import { KpiCard, NarrativeCard, Segmented } from "../../components/report";
import { EmptyState, Skeleton } from "../../components/ui";
import { ownerApi } from "../../lib/api";
import { downloadJson, dollars } from "../../lib/export";
import {
  barList,
  dataTable,
  kpiGrid,
  narrativeBlock,
  printReport,
  sectionBlock,
} from "../../lib/printDoc";
import { useAuth } from "../../lib/auth";
import type { Business, Granularity, MetricKey, Report } from "../../types";
import { usePageTitle } from "../../lib/usePageTitle";

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "funnel", label: "Conversion funnel" },
  { key: "views_trend", label: "Views trend" },
  { key: "rating_distribution", label: "Rating distribution" },
  { key: "reviews_trend", label: "Review trend" },
  { key: "deals", label: "Deal performance" },
  { key: "redemptions_trend", label: "Redemption trend" },
];

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const GRANULARITIES: { label: string; value: Granularity }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

export function OwnerDashboard() {
  usePageTitle("Owner dashboard");
  const { user, loading: authLoading } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState<number | null>(null);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(today());
  const [metrics, setMetrics] = useState<MetricKey[]>(
    METRIC_OPTIONS.map((m) => m.key),
  );
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the owner's businesses once; preselect the first.
  useEffect(() => {
    if (!user) return;
    ownerApi
      .mine()
      .then((rows) => {
        setBusinesses(rows as unknown as Business[]);
        const first = (rows as { id?: number }[])[0];
        if (first?.id) setBusinessId(first.id);
      })
      .catch(() => setBusinesses([]));
  }, [user]);

  // Re-fetch the report whenever ANY knob changes — the "recomputes" gate.
  const fetchReport = useCallback(() => {
    if (!businessId || metrics.length === 0) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    ownerApi
      .report(businessId, { from, to, metrics: metrics.join(","), granularity })
      .then(setReport)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [businessId, from, to, metrics, granularity]);

  useEffect(fetchReport, [fetchReport]);

  function toggleMetric(key: MetricKey) {
    setMetrics((curr) =>
      curr.includes(key) ? curr.filter((m) => m !== key) : [...curr, key],
    );
  }

  /** Flatten the CURRENT report (only selected sections) into CSV rows. */
  function exportCsv() {
    if (!report) return;
    const lines: string[][] = [
      ["LocalLens owner report"],
      ["business_id", String(report.business_id)],
      ["from", report.from],
      ["to", report.to],
      [],
    ];
    if (report.summary) {
      const s = report.summary;
      lines.push(["SUMMARY"], ["metric", "value", "change_abs", "change_pct"]);
      const line = (k: string, val: number) =>
        lines.push([
          k,
          String(val),
          String(s.change?.[k]?.abs ?? ""),
          String(s.change?.[k]?.pct ?? ""),
        ]);
      line("local_spend_cents", s.local_spend_cents);
      line("views", s.views);
      line("review_count", s.review_count);
      line("average_rating", s.average_rating);
      line("favorites", s.favorites);
      line("deal_redemptions", s.deal_redemptions);
      lines.push([]);
    }
    if (report.rating_distribution) {
      lines.push(["RATING DISTRIBUTION"], ["stars", "count"]);
      for (const r of report.rating_distribution)
        lines.push([String(r.rating), String(r.count)]);
      lines.push([]);
    }
    if (report.reviews_trend) {
      lines.push(["REVIEW TREND"], ["day", "count", "avg_rating"]);
      for (const r of report.reviews_trend)
        lines.push([r.day, String(r.count), String(r.avg_rating)]);
      lines.push([]);
    }
    if (report.deals) {
      lines.push(
        ["DEALS"],
        [
          "title",
          "discount_pct",
          "redemptions_in_range",
          "redemptions_total",
          "total_limit",
        ],
      );
      for (const d of report.deals)
        lines.push([
          d.title,
          String(d.discount_pct),
          String(d.redemptions_in_range),
          String(d.redemption_count),
          d.total_limit === null ? "unlimited" : String(d.total_limit),
        ]);
      lines.push([]);
    }
    if (report.redemptions_trend) {
      lines.push(["REDEMPTION TREND"], ["day", "count"]);
      for (const r of report.redemptions_trend)
        lines.push([r.day, String(r.count)]);
      lines.push([]);
    }
    if (report.views_trend) {
      lines.push(["VIEWS TREND"], ["day", "count"]);
      for (const r of report.views_trend) lines.push([r.day, String(r.count)]);
      lines.push([]);
    }
    if (report.funnel) {
      lines.push(["FUNNEL"], ["step", "count", "conversion_from_previous_pct"]);
      lines.push(["views", String(report.funnel.views), ""]);
      lines.push([
        "favorites",
        String(report.funnel.favorites),
        String(report.funnel.view_to_favorite_pct),
      ]);
      lines.push([
        "redemptions",
        String(report.funnel.redemptions),
        String(report.funnel.favorite_to_redemption_pct),
      ]);
      lines.push([]);
    }
    if (report.narrative?.length) {
      lines.push(["HIGHLIGHTS"]);
      for (const line of report.narrative) lines.push([line]);
    }
    // Quote every cell (commas in deal titles are likely).
    const csv = lines
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `locallens-report-${report.business_id}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Build a clean, document-style report and open the print dialog (Save as PDF). */
  function printPdf() {
    if (!report) return;
    const fmt = (s: string) =>
      new Date(s).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const bizName =
      businesses.find((b) => (b as unknown as { id: number }).id === businessId)
        ?.name ?? "Your business";
    const gran = report.granularity ?? "day";
    const parts: string[] = [];
    if (report.narrative?.length) parts.push(narrativeBlock(report.narrative));

    const s = report.summary;
    if (s) {
      parts.push(
        sectionBlock(
          "Summary",
          kpiGrid([
            {
              label: "Kept local",
              value: dollars(s.local_spend_cents),
              change: s.change?.local_spend_cents,
            },
            { label: "Views", value: String(s.views), change: s.change?.views },
            {
              label: "Reviews",
              value: String(s.review_count),
              change: s.change?.review_count,
            },
            {
              label: "Favorites",
              value: String(s.favorites),
              change: s.change?.favorites,
            },
            {
              label: "Redemptions",
              value: String(s.deal_redemptions),
              change: s.change?.deal_redemptions,
            },
            {
              label: "Avg rating",
              value: s.average_rating.toFixed(2),
              change: s.change?.average_rating,
            },
          ]),
        ),
      );
    }
    if (report.funnel)
      parts.push(
        sectionBlock(
          "Conversion funnel",
          dataTable(
            [
              { label: "Step" },
              { label: "Count", num: true },
              { label: "Conv. from prev", num: true },
            ],
            [
              ["Views", report.funnel.views, "—"],
              [
                "Favorites",
                report.funnel.favorites,
                `${report.funnel.view_to_favorite_pct}%`,
              ],
              [
                "Redemptions",
                report.funnel.redemptions,
                `${report.funnel.favorite_to_redemption_pct}%`,
              ],
            ],
          ),
        ),
      );
    if (report.rating_distribution?.length)
      parts.push(
        sectionBlock(
          "Rating distribution",
          barList(
            report.rating_distribution.map((r) => ({
              label: `${r.rating}★`,
              value: r.count,
              display: String(r.count),
            })),
          ),
        ),
      );
    if (report.views_trend?.length)
      parts.push(
        sectionBlock(
          `Views per ${gran}`,
          dataTable(
            [{ label: "Period" }, { label: "Views", num: true }],
            report.views_trend.map((t) => [t.day, t.count]),
          ),
        ),
      );
    if (report.reviews_trend?.length)
      parts.push(
        sectionBlock(
          `Reviews per ${gran}`,
          dataTable(
            [
              { label: "Period" },
              { label: "Reviews", num: true },
              { label: "Avg rating", num: true },
            ],
            report.reviews_trend.map((t) => [
              t.day,
              t.count,
              t.avg_rating.toFixed(1),
            ]),
          ),
        ),
      );
    if (report.redemptions_trend?.length)
      parts.push(
        sectionBlock(
          `Redemptions per ${gran}`,
          dataTable(
            [{ label: "Period" }, { label: "Redemptions", num: true }],
            report.redemptions_trend.map((t) => [t.day, t.count]),
          ),
        ),
      );
    if (report.deals?.length)
      parts.push(
        sectionBlock(
          "Deal performance",
          dataTable(
            [
              { label: "Deal" },
              { label: "Off", num: true },
              { label: "In range", num: true },
              { label: "Total", num: true },
            ],
            report.deals.map((d) => [
              d.title,
              `${d.discount_pct}%`,
              d.redemptions_in_range,
              d.total_limit !== null
                ? `${d.redemption_count} / ${d.total_limit}`
                : d.redemption_count,
            ]),
          ),
        ),
      );

    printReport({
      title: "Owner Report",
      subtitle: bizName,
      period: `${fmt(from)} – ${fmt(to)}`,
      body: parts.join(""),
    });
  }

  if (authLoading)
    return (
      <main className="container-page py-8">
        <Skeleton />
      </main>
    );
  if (!user || (user.role !== "owner" && user.role !== "admin"))
    return (
      <main className="container-page py-8">
        <EmptyState title="Owners only">
          This dashboard is for business-owner accounts.{" "}
          <Link to="/register" className="text-accent-700 underline">
            Join as an owner
          </Link>
          .
        </EmptyState>
      </main>
    );

  return (
    <main className="container-page py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Owner dashboard
        </h1>
        <div className="flex gap-2 print:hidden">
          <Link
            to="/owner/add-business"
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600"
          >
            + Add business
          </Link>
          <Link
            to="/owner/post-deal"
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600"
          >
            + Post deal
          </Link>
          <Link
            to="/owner/verify"
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600"
          >
            Verify a code
          </Link>
          <Link
            to="/owner/checkin-code"
            className="rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600"
          >
            Check-in code
          </Link>
        </div>
      </div>

      {/* Your listings, with quick edit/view links */}
      {businesses.length > 0 && (
        <section
          aria-label="Your businesses"
          className="mt-5 flex flex-wrap gap-2 print:hidden"
        >
          {businesses.map((b) => {
            const bid = (b as unknown as { id: number }).id;
            return (
              <span
                key={bid}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 font-serif text-sm"
              >
                <Link
                  to={`/business/${bid}`}
                  className="text-ink hover:text-accent-700"
                >
                  {b.name}
                </Link>
                <Link
                  to={`/owner/edit/${bid}`}
                  className="font-mono text-xs text-accent-700 underline-offset-2 hover:underline"
                  aria-label={`Edit ${b.name}`}
                >
                  edit
                </Link>
              </span>
            );
          })}
        </section>
      )}

      {businesses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No businesses yet">
            <Link
              to="/owner/add-business"
              className="text-accent-700 underline"
            >
              Add your first listing
            </Link>{" "}
            to see analytics.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* ── The customization controls ─────────────────────────────── */}
          <section
            aria-label="Report controls"
            className="mt-5 rounded-lg border border-border bg-surface p-4 print:hidden"
          >
            <div className="flex flex-wrap items-end gap-4">
              <label className="font-serif text-sm text-ink-soft">
                Business
                <select
                  value={businessId ?? ""}
                  onChange={(e) => setBusinessId(Number(e.target.value))}
                  className="mt-1 block rounded-md border border-border bg-cream px-2 py-1.5 font-serif text-ink"
                >
                  {businesses.map((b) => (
                    <option
                      key={(b as unknown as { id: number }).id}
                      value={(b as unknown as { id: number }).id}
                    >
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <div
                role="group"
                aria-label="Date range presets"
                className="flex gap-1.5"
              >
                {PRESETS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => {
                      setFrom(isoDaysAgo(p.days));
                      setTo(today());
                    }}
                    className={`rounded-full border px-3 py-1 font-mono text-xs ${
                      from === isoDaysAgo(p.days) && to === today()
                        ? "border-accent-700 bg-accent-700 text-cream"
                        : "border-border text-ink-soft hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <label className="font-serif text-sm text-ink-soft">
                From
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 block rounded-md border border-border bg-cream px-2 py-1 font-mono text-sm"
                />
              </label>
              <label className="font-serif text-sm text-ink-soft">
                To
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={today()}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 block rounded-md border border-border bg-cream px-2 py-1 font-mono text-sm"
                />
              </label>

              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!report}
                  className="rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600 disabled:opacity-50"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    report &&
                    downloadJson(
                      `locallens-report-${report.business_id}-${from}.json`,
                      report,
                    )
                  }
                  disabled={!report}
                  className="rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600 disabled:opacity-50"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={printPdf}
                  disabled={!report}
                  className="rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600 disabled:opacity-50"
                >
                  Print / PDF
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">
                Group trends by
              </span>
              <Segmented
                ariaLabel="Trend granularity"
                options={GRANULARITIES}
                value={granularity}
                onChange={setGranularity}
              />
            </div>

            <div
              role="group"
              aria-label="Metrics to include"
              className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3"
            >
              {METRIC_OPTIONS.map((m) => (
                <label
                  key={m.key}
                  className="flex items-center gap-1.5 font-serif text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={metrics.includes(m.key)}
                    onChange={() => toggleMetric(m.key)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </section>

          {/* ── The report ─────────────────────────────────────────────── */}
          {error && (
            <p role="alert" className="mt-4 font-serif text-accent-700">
              {error}
            </p>
          )}
          {loading && (
            <div className="mt-4">
              <Skeleton count={2} height="6rem" />
            </div>
          )}
          {!loading && metrics.length === 0 && (
            <p className="mt-4 font-serif text-ink-soft">
              Select at least one metric to build the report.
            </p>
          )}

          {!loading && report && (
            <div className="mt-5 space-y-5">
              <NarrativeCard lines={report.narrative} />

              {report.summary && (
                <section
                  aria-label="Summary"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6"
                >
                  <KpiCard
                    label="Kept local"
                    value={dollars(report.summary.local_spend_cents)}
                    change={report.summary.change?.local_spend_cents}
                  />
                  <KpiCard
                    label="Views"
                    value={report.summary.views}
                    change={report.summary.change?.views}
                  />
                  <KpiCard
                    label="Reviews"
                    value={report.summary.review_count}
                    change={report.summary.change?.review_count}
                  />
                  <KpiCard
                    label="Favorites"
                    value={report.summary.favorites}
                    change={report.summary.change?.favorites}
                  />
                  <KpiCard
                    label="Redemptions"
                    value={report.summary.deal_redemptions}
                    change={report.summary.change?.deal_redemptions}
                  />
                  <KpiCard
                    label="Avg rating"
                    value={report.summary.average_rating.toFixed(2)}
                    change={report.summary.change?.average_rating}
                  />
                </section>
              )}

              {report.funnel && (
                <section
                  aria-label="Conversion funnel"
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Conversion funnel
                  </h2>
                  <p className="mb-3 font-serif text-sm text-ink-soft">
                    How interest became customers in this range — end to end,{" "}
                    {report.funnel.view_to_redemption_pct}% of views led to a
                    redemption.
                  </p>
                  <FunnelChart
                    steps={[
                      { label: "Views", value: report.funnel.views },
                      {
                        label: "Favorites",
                        value: report.funnel.favorites,
                        pctOfPrev: report.funnel.view_to_favorite_pct,
                      },
                      {
                        label: "Redemptions",
                        value: report.funnel.redemptions,
                        pctOfPrev: report.funnel.favorite_to_redemption_pct,
                      },
                    ]}
                  />
                </section>
              )}

              <div className="grid gap-5 lg:grid-cols-2">
                {report.views_trend && (
                  <section className="rounded-lg border border-border bg-surface p-4">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      Views per {granularity}
                    </h2>
                    <TrendChart
                      data={report.views_trend}
                      color="var(--accent-600)"
                    />
                  </section>
                )}
                {report.rating_distribution && (
                  <section className="rounded-lg border border-border bg-surface p-4">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      Rating distribution
                    </h2>
                    <BarChart
                      data={report.rating_distribution.map((r) => ({
                        label: `${r.rating}★`,
                        value: r.count,
                      }))}
                    />
                  </section>
                )}
                {report.reviews_trend && (
                  <section className="rounded-lg border border-border bg-surface p-4">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      Reviews per {granularity}
                    </h2>
                    <TrendChart data={report.reviews_trend} />
                  </section>
                )}
                {report.redemptions_trend && (
                  <section className="rounded-lg border border-border bg-surface p-4">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      Redemptions per {granularity}
                    </h2>
                    <TrendChart
                      data={report.redemptions_trend}
                      color="var(--accent-600)"
                    />
                  </section>
                )}
                {report.deals && (
                  <section className="rounded-lg border border-border bg-surface p-4">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      Deal performance
                    </h2>
                    {report.deals.length === 0 ? (
                      <p className="mt-2 font-serif text-sm text-ink-soft">
                        No deals yet — post one!
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="mt-2 w-full min-w-[20rem] font-serif text-sm">
                          <thead>
                            <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                              <th className="py-1 pr-2">Deal</th>
                              <th className="py-1 pr-2">Off</th>
                              <th className="py-1 pr-2">In range</th>
                              <th className="py-1">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.deals.map((d) => (
                              <tr
                                key={d.id}
                                className="border-b border-border/60"
                              >
                                <td className="py-1.5 pr-2 text-ink">
                                  {d.title}
                                </td>
                                <td className="py-1.5 pr-2 font-mono">
                                  {d.discount_pct}%
                                </td>
                                <td className="py-1.5 pr-2 font-mono">
                                  {d.redemptions_in_range}
                                </td>
                                <td className="py-1.5 font-mono">
                                  {d.redemption_count}
                                  {d.total_limit !== null &&
                                    ` / ${d.total_limit}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
