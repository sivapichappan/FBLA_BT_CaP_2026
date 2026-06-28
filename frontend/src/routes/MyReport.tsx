/**
 * "My Local Impact" — the consumer half of the scored customizable report (§11),
 * the citizen mirror of the owner dashboard. The visitor customizes it three
 * ways and it recomputes live: a date range (presets + custom), a roll-up
 * granularity, and a section multi-select. It analyzes (period-over-period
 * deltas, category/city breakdowns, trends, an auto-narrative) and outputs
 * (CSV, JSON, print). Every control re-queries the API — genuinely recomputed.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, TrendChart } from "../components/charts";
import { ImpactCard } from "../components/ImpactCard";
import { KpiCard, NarrativeCard, Segmented } from "../components/report";
import { EmptyState, Skeleton } from "../components/ui";
import { reportApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { downloadCsv, downloadJson, dollars, formatDay } from "../lib/export";
import {
  barList,
  dataTable,
  kpiGrid,
  narrativeBlock,
  printReport,
  sectionBlock,
} from "../lib/printDoc";
import { usePageTitle } from "../lib/usePageTitle";
import type { Granularity, UserReport, UserSection } from "../types";

const SECTION_OPTIONS: { key: UserSection; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "spend_by_category", label: "Spend by category" },
  { key: "spend_by_city", label: "Spend by city" },
  { key: "visits_trend", label: "Visits over time" },
  { key: "reviews_trend", label: "Reviews over time" },
  { key: "top_businesses", label: "Top businesses" },
  { key: "trust_breakdown", label: "Trust breakdown" },
];

const GRANULARITIES: { label: string; value: Granularity }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

const PRESETS: { label: string; from: string }[] = [
  { label: "This year", from: yearStart() },
  { label: "Last 90 days", from: isoDaysAgo(90) },
  { label: "Last 30 days", from: isoDaysAgo(30) },
  { label: "All-time", from: "2000-01-01" },
];

export function MyReport() {
  usePageTitle("My Local Impact");
  const { user, loading: authLoading } = useAuth();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [sections, setSections] = useState<UserSection[]>(
    SECTION_OPTIONS.map((s) => s.key),
  );
  const [report, setReport] = useState<UserReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch whenever any knob changes — the "recomputes live" gate.
  const fetchReport = useCallback(() => {
    if (!user || sections.length === 0) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    reportApi
      .me({ from, to, granularity, sections: sections.join(",") })
      .then(setReport)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, from, to, granularity, sections]);

  useEffect(fetchReport, [fetchReport]);

  function toggleSection(key: UserSection) {
    setSections((curr) =>
      curr.includes(key) ? curr.filter((s) => s !== key) : [...curr, key],
    );
  }

  /** Flatten the CURRENT report (only selected sections) into CSV rows. */
  function exportCsv() {
    if (!report) return;
    const rows: (string | number)[][] = [
      ["LocalLens — My Local Impact"],
      ["from", report.from],
      ["to", report.to],
      ["granularity", report.granularity],
      [],
    ];
    const s = report.summary;
    if (s) {
      rows.push(["SUMMARY"], ["metric", "value", "change_abs", "change_pct"]);
      const line = (k: string, val: number) =>
        rows.push([k, val, s.change[k]?.abs ?? "", s.change[k]?.pct ?? ""]);
      line("money_local_cents", s.money_local_cents);
      line("verified_visits", s.verified_visits);
      line("distinct_businesses", s.distinct_businesses);
      line("reviews_written", s.reviews_written);
      line("avg_rating_given", s.avg_rating_given);
      line("deals_redeemed", s.deals_redeemed);
      line("favorites_added", s.favorites_added);
      rows.push(["tenure_days", s.tenure_days, "", ""], []);
    }
    if (report.spend_by_category) {
      rows.push(["SPEND BY CATEGORY"], ["category", "visits", "spend_cents"]);
      for (const c of report.spend_by_category)
        rows.push([c.category, c.visits, c.spend_cents]);
      rows.push([]);
    }
    if (report.spend_by_city) {
      rows.push(["SPEND BY CITY"], ["city", "visits", "spend_cents"]);
      for (const c of report.spend_by_city)
        rows.push([c.city, c.visits, c.spend_cents]);
      rows.push([]);
    }
    if (report.visits_trend) {
      rows.push(["VISITS OVER TIME"], ["period", "visits", "spend_cents"]);
      for (const t of report.visits_trend)
        rows.push([t.period, t.visits, t.spend_cents]);
      rows.push([]);
    }
    if (report.reviews_trend) {
      rows.push(["REVIEWS OVER TIME"], ["period", "count", "avg_rating"]);
      for (const t of report.reviews_trend)
        rows.push([t.period, t.count, t.avg_rating]);
      rows.push([]);
    }
    if (report.top_businesses) {
      rows.push(["TOP BUSINESSES"], ["name", "visits", "spend_cents"]);
      for (const b of report.top_businesses)
        rows.push([b.name, b.visits, b.spend_cents]);
      rows.push([]);
    }
    if (report.trust_breakdown) {
      rows.push(["TRUST BREAKDOWN"], ["source", "count", "points"]);
      for (const c of report.trust_breakdown.components)
        rows.push([c.source, c.count, c.points]);
      rows.push(["total", "", report.trust_breakdown.total], []);
    }
    if (report.narrative?.length) {
      rows.push(["HIGHLIGHTS"]);
      for (const line of report.narrative) rows.push([line]);
    }
    downloadCsv(
      `locallens-impact-${report.from.slice(0, 10)}-to-${report.to.slice(0, 10)}.csv`,
      rows,
    );
  }

  /** Build a clean, document-style report and open the print dialog (Save as PDF). */
  function printPdf() {
    if (!report) return;
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
              value: dollars(s.money_local_cents),
              change: s.change.money_local_cents,
            },
            {
              label: "Verified visits",
              value: String(s.verified_visits),
              change: s.change.verified_visits,
            },
            {
              label: "Businesses supported",
              value: String(s.distinct_businesses),
              change: s.change.distinct_businesses,
            },
            {
              label: "Reviews written",
              value: String(s.reviews_written),
              change: s.change.reviews_written,
            },
            {
              label: "Avg rating given",
              value: `${s.avg_rating_given.toFixed(1)}★`,
              change: s.change.avg_rating_given,
            },
            {
              label: "Deals redeemed",
              value: String(s.deals_redeemed),
              change: s.change.deals_redeemed,
            },
            {
              label: "Favorites added",
              value: String(s.favorites_added),
              change: s.change.favorites_added,
            },
            { label: "Member for", value: `${s.tenure_days} days` },
          ]),
        ),
      );
    }
    if (report.spend_by_category?.length)
      parts.push(
        sectionBlock(
          "Spend by category",
          barList(
            report.spend_by_category.map((c) => ({
              label: c.category,
              value: c.spend_cents,
              display: `${dollars(c.spend_cents)} · ${c.visits}×`,
            })),
          ),
        ),
      );
    if (report.spend_by_city?.length)
      parts.push(
        sectionBlock(
          "Spend by city",
          barList(
            report.spend_by_city.map((c) => ({
              label: c.city,
              value: c.spend_cents,
              display: `${dollars(c.spend_cents)} · ${c.visits}×`,
            })),
          ),
        ),
      );
    if (report.visits_trend?.length)
      parts.push(
        sectionBlock(
          "Visits over time",
          dataTable(
            [
              { label: "Period" },
              { label: "Visits", num: true },
              { label: "Spend", num: true },
            ],
            report.visits_trend.map((t) => [
              t.period,
              t.visits,
              dollars(t.spend_cents),
            ]),
          ),
        ),
      );
    if (report.reviews_trend?.length)
      parts.push(
        sectionBlock(
          "Reviews over time",
          dataTable(
            [
              { label: "Period" },
              { label: "Reviews", num: true },
              { label: "Avg rating", num: true },
            ],
            report.reviews_trend.map((t) => [
              t.period,
              t.count,
              t.avg_rating.toFixed(1),
            ]),
          ),
        ),
      );
    if (report.top_businesses?.length)
      parts.push(
        sectionBlock(
          "Top businesses you supported",
          dataTable(
            [
              { label: "Business" },
              { label: "Visits", num: true },
              { label: "Spend", num: true },
            ],
            report.top_businesses.map((b) => [
              b.name,
              b.visits,
              dollars(b.spend_cents),
            ]),
          ),
        ),
      );
    if (report.trust_breakdown)
      parts.push(
        sectionBlock(
          `Trust breakdown — ${report.trust_breakdown.total} pts`,
          dataTable(
            [
              { label: "Source" },
              { label: "Count", num: true },
              { label: "Points", num: true },
            ],
            report.trust_breakdown.components.map((c) => [
              c.source,
              c.count,
              c.points,
            ]),
          ),
        ),
      );

    printReport({
      title: "My Local Impact",
      period: `${formatDay(report.from)} – ${formatDay(report.to)}`,
      body: parts.join(""),
    });
  }

  if (authLoading)
    return (
      <main className="container-page py-8">
        <Skeleton />
      </main>
    );

  if (!user)
    return (
      <main className="container-page py-8">
        <EmptyState title="Sign in to see your impact">
          Your local impact report is built from your own verified visits,
          reviews, and favorites.{" "}
          <Link to="/login" className="text-accent-700 underline">
            Sign in
          </Link>
          .
        </EmptyState>
      </main>
    );

  const inputClass =
    "rounded-md border border-border bg-cream px-3 py-2 font-serif text-sm";

  return (
    <main className="container-page py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            My Local Impact
          </h1>
          <p className="mt-1 font-serif text-ink-soft">
            What your support added up to — customize the window and sections,
            then export or print.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!report}
            className="rounded-md border border-border px-3 py-2 font-serif text-sm text-ink hover:border-accent-600 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() =>
              report &&
              downloadJson(
                `locallens-impact-${report.from.slice(0, 10)}.json`,
                report,
              )
            }
            disabled={!report}
            className="rounded-md border border-border px-3 py-2 font-serif text-sm text-ink hover:border-accent-600 disabled:opacity-50"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={printPdf}
            disabled={!report}
            className="rounded-md border border-border px-3 py-2 font-serif text-sm text-ink hover:border-accent-600 disabled:opacity-50"
          >
            Print / PDF
          </button>
        </div>
      </header>

      {/* Controls */}
      <section
        aria-label="Report controls"
        className="mt-5 space-y-4 rounded-lg border border-border bg-surface p-5 print:hidden"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">
            Period
          </span>
          <Segmented
            ariaLabel="Date range preset"
            options={PRESETS.map((p) => ({ label: p.label, value: p.from }))}
            value={from}
            onChange={(v) => setFrom(v)}
          />
          <label className="ml-auto flex items-center gap-1 font-serif text-sm text-ink-soft">
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-1 font-serif text-sm text-ink-soft">
            To
            <input
              type="date"
              value={to}
              max={today()}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">
            Group by
          </span>
          <Segmented
            ariaLabel="Trend granularity"
            options={GRANULARITIES}
            value={granularity}
            onChange={setGranularity}
          />
        </div>

        <fieldset>
          <legend className="font-mono text-xs uppercase tracking-wide text-ink-soft">
            Sections
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {SECTION_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-1.5 font-serif text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={sections.includes(opt.key)}
                  onChange={() => toggleSection(opt.key)}
                  className="accent-accent-700"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-accent-600/40 bg-surface px-3 py-2 font-serif text-sm text-accent-700"
        >
          {error}
        </p>
      )}

      {loading && (
        <div className="mt-5">
          <Skeleton count={3} height="6rem" />
        </div>
      )}

      {!loading && sections.length === 0 && (
        <p className="mt-5 font-serif text-ink-soft">
          Select at least one section to build your report.
        </p>
      )}

      {!loading && report && (
        <div className="mt-6 space-y-6">
          <NarrativeCard lines={report.narrative} />

          {report.summary && (
            <section aria-label="Summary">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard
                  label="Kept local"
                  value={dollars(report.summary.money_local_cents)}
                  change={report.summary.change.money_local_cents}
                />
                <KpiCard
                  label="Verified visits"
                  value={report.summary.verified_visits}
                  change={report.summary.change.verified_visits}
                />
                <KpiCard
                  label="Businesses supported"
                  value={report.summary.distinct_businesses}
                  change={report.summary.change.distinct_businesses}
                />
                <KpiCard
                  label="Reviews written"
                  value={report.summary.reviews_written}
                  change={report.summary.change.reviews_written}
                />
                <KpiCard
                  label="Avg rating given"
                  value={`${report.summary.avg_rating_given.toFixed(1)}★`}
                  change={report.summary.change.avg_rating_given}
                />
                <KpiCard
                  label="Deals redeemed"
                  value={report.summary.deals_redeemed}
                  change={report.summary.change.deals_redeemed}
                />
                <KpiCard
                  label="Favorites added"
                  value={report.summary.favorites_added}
                  change={report.summary.change.favorites_added}
                />
                <KpiCard
                  label="Member for"
                  value={`${report.summary.tenure_days} days`}
                />
              </div>
            </section>
          )}

          {report.summary && (
            <ImpactCard
              from={report.from}
              to={report.to}
              summary={report.summary}
              topCategory={report.spend_by_category?.[0]?.category}
              topCity={report.spend_by_city?.[0]?.city}
              username={user.username}
            />
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {report.spend_by_category &&
              report.spend_by_category.length > 0 && (
                <section
                  aria-label="Spend by category"
                  className="rounded-lg border border-border bg-surface p-5"
                >
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Spend by category{" "}
                    <span className="font-mono text-xs text-ink-soft">($)</span>
                  </h2>
                  <div className="mt-3">
                    <BarChart
                      data={report.spend_by_category.map((c) => ({
                        label: c.category,
                        value: Math.round(c.spend_cents / 100),
                      }))}
                    />
                  </div>
                </section>
              )}

            {report.spend_by_city && report.spend_by_city.length > 0 && (
              <section
                aria-label="Spend by city"
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h2 className="font-display text-lg font-semibold text-ink">
                  Spend by city{" "}
                  <span className="font-mono text-xs text-ink-soft">($)</span>
                </h2>
                <div className="mt-3">
                  <BarChart
                    color="var(--verified)"
                    data={report.spend_by_city.map((c) => ({
                      label: c.city,
                      value: Math.round(c.spend_cents / 100),
                    }))}
                  />
                </div>
              </section>
            )}

            {report.visits_trend && (
              <section
                aria-label="Visits over time"
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h2 className="font-display text-lg font-semibold text-ink">
                  Visits over time
                </h2>
                <div className="mt-3">
                  <TrendChart
                    data={report.visits_trend.map((t) => ({
                      day: t.period,
                      count: t.visits,
                    }))}
                  />
                </div>
              </section>
            )}

            {report.reviews_trend && (
              <section
                aria-label="Reviews over time"
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h2 className="font-display text-lg font-semibold text-ink">
                  Reviews over time
                </h2>
                <div className="mt-3">
                  <TrendChart
                    color="var(--accent-600)"
                    data={report.reviews_trend.map((t) => ({
                      day: t.period,
                      count: t.count,
                    }))}
                  />
                </div>
              </section>
            )}
          </div>

          {report.top_businesses && report.top_businesses.length > 0 && (
            <section
              aria-label="Top businesses"
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h2 className="font-display text-lg font-semibold text-ink">
                Top businesses you supported
              </h2>
              <ol className="mt-3 space-y-2">
                {report.top_businesses.map((b, i) => (
                  <li
                    key={b.business_id}
                    className="flex items-center justify-between gap-3 font-serif text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-ink-soft">{i + 1}.</span>{" "}
                      <Link
                        to={`/business/${b.business_id}`}
                        className="text-accent-700 underline-offset-2 hover:underline"
                      >
                        {b.name}
                      </Link>
                    </span>
                    <span className="shrink-0 font-mono text-ink-soft">
                      {dollars(b.spend_cents)} · {b.visits} visit
                      {b.visits === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {report.trust_breakdown && (
            <section
              aria-label="Trust breakdown"
              className="rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-ink">
                  Where your trust score came from
                </h2>
                <span className="font-mono text-sm text-ink-soft">
                  {report.trust_breakdown.total} pts
                </span>
              </div>
              <ul className="mt-3 space-y-1 font-serif text-sm">
                {report.trust_breakdown.components.map((c) => (
                  <li
                    key={c.source}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-ink-soft">
                      {c.source}{" "}
                      <span className="font-mono text-xs">(×{c.count})</span>
                    </span>
                    <span className="font-mono text-ink">{c.points} pts</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
