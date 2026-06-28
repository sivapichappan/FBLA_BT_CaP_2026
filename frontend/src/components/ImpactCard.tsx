/**
 * A shareable "Year in Review" card for the user's local impact — a single,
 * self-contained SVG we hand-build (no html-to-image dependency to attribute).
 * Because it's already an SVG, "Download image" just serializes the live node;
 * "Share" uses the Web Share API when present, else copies a summary to the
 * clipboard. Colors are the light-theme hexes baked in, so the shared artifact
 * looks the same regardless of the viewer's app theme (SVG can't read CSS vars).
 */

import { useRef, useState } from "react";
import { dollars, formatDay } from "../lib/export";
import type { UserReportSummary } from "../types";

// Light-palette hexes mirrored from tokens.css (an SVG can't read CSS vars).
const C = {
  cream: "#fbf7f0",
  surface: "#fefcf8",
  ink: "#1f1b16",
  inkSoft: "#5a5247",
  accent: "#21436b",
  accent600: "#2e5c8a",
  verified: "#4f6b4a",
  border: "#e8e0d4",
};

function periodLabel(from: string, to: string): string {
  return `${formatDay(from)} – ${formatDay(to)}`;
}

export function ImpactCard({
  from,
  to,
  summary,
  topCategory,
  topCity,
  username,
}: {
  from: string;
  to: string;
  summary: UserReportSummary;
  topCategory?: string;
  topCity?: string;
  username?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const stats: [string, string][] = [
    [String(summary.verified_visits), "verified visits"],
    [String(summary.distinct_businesses), "businesses"],
    [
      topCity ?? `${summary.tenure_days}`,
      topCity ? "top city" : "days a member",
    ],
  ];

  function downloadImage() {
    if (!svgRef.current) return;
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `locallens-impact-${from.slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const text =
      `My LocalLens impact: ${dollars(summary.money_local_cents)} kept local across ` +
      `${summary.verified_visits} verified visits to ${summary.distinct_businesses} ` +
      `local businesses (${periodLabel(from, to)}).`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "My Local Impact", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNote("Summary copied to clipboard.");
    } catch {
      setNote("Couldn't share — try Download image instead.");
    }
  }

  return (
    <section
      aria-label="Shareable impact card"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Your Year-in-Review card
        </h2>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={share}
            className="rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink hover:border-accent-600"
          >
            Share
          </button>
          <button
            type="button"
            onClick={downloadImage}
            className="rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600"
          >
            Download image
          </button>
        </div>
      </div>

      {note && (
        <p role="status" className="mt-2 font-serif text-xs text-ink-soft">
          {note}
        </p>
      )}

      {/* The card itself — a 1200×630 social-friendly SVG, scaled to fit. */}
      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 630"
          className="block h-auto w-full"
          role="img"
          aria-label={`Local impact: ${dollars(summary.money_local_cents)} kept local across ${summary.verified_visits} verified visits.`}
        >
          <rect width="1200" height="630" fill={C.cream} />
          <rect
            x="24"
            y="24"
            width="1152"
            height="582"
            rx="24"
            fill={C.surface}
            stroke={C.border}
            strokeWidth="2"
          />

          {/* Wordmark */}
          <text
            x="72"
            y="108"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="40"
            fontWeight="700"
            fill={C.ink}
          >
            Local<tspan fill={C.accent}>Lens</tspan>
          </text>
          <text
            x="72"
            y="150"
            fontFamily="ui-monospace, monospace"
            fontSize="22"
            letterSpacing="2"
            fill={C.inkSoft}
          >
            MY LOCAL IMPACT
          </text>

          {/* Hero number */}
          <text
            x="72"
            y="330"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="180"
            fontWeight="700"
            fill={C.accent}
          >
            {dollars(summary.money_local_cents)}
          </text>
          <text
            x="80"
            y="386"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="34"
            fill={C.inkSoft}
          >
            kept in the local economy
          </text>

          {/* Stat row */}
          {stats.map(([value, label], i) => {
            const x = 72 + i * 372;
            return (
              <g key={label}>
                <text
                  x={x}
                  y="500"
                  fontFamily="Georgia, 'Times New Roman', serif"
                  fontSize="64"
                  fontWeight="700"
                  fill={C.ink}
                >
                  {value}
                </text>
                <text
                  x={x + 4}
                  y="534"
                  fontFamily="ui-monospace, monospace"
                  fontSize="20"
                  fill={C.inkSoft}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Footer: top category chip + attribution */}
          {topCategory && (
            <text
              x="72"
              y="582"
              fontFamily="Georgia, 'Times New Roman', serif"
              fontSize="24"
              fill={C.verified}
            >
              ★ Top category: {topCategory}
            </text>
          )}
          <text
            x="1128"
            y="582"
            textAnchor="end"
            fontFamily="ui-monospace, monospace"
            fontSize="20"
            fill={C.inkSoft}
          >
            {username ? `@${username} · ` : ""}
            {periodLabel(from, to)}
          </text>
        </svg>
      </div>
    </section>
  );
}
