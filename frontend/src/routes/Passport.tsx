/**
 * The check-in passport (§17): every stamp is a VERIFIED visit, so it can't be
 * faked from your couch. Shows the "money kept local" impact, earned + in-progress
 * badges, a streak, and recent verified visits — the gamified payoff that turns
 * supporting local businesses into something you collect.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Skeleton } from "../components/ui";
import { passportApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../lib/usePageTitle";
import type { Passport as PassportData, PassportBadge } from "../types";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 text-center">
      <p className="font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 font-serif text-sm text-ink-soft">{label}</p>
    </div>
  );
}

function BadgeCard({ b }: { b: PassportBadge }) {
  const pct = Math.min(100, Math.round((b.have / b.need) * 100));
  return (
    <div
      className={`rounded-lg border p-4 ${
        b.earned ? "border-verified bg-surface" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`text-2xl ${b.earned ? "" : "opacity-40 grayscale"}`}
          aria-hidden="true"
        >
          {b.icon}
        </span>
        <div className="min-w-0">
          <p className="font-serif font-medium text-ink">
            {b.label} {b.earned && <span className="text-verified">✓</span>}
          </p>
          <p className="font-mono text-[11px] text-ink-soft">{b.desc}</p>
        </div>
      </div>
      {!b.earned && (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-cream"
            role="progressbar"
            aria-valuenow={b.have}
            aria-valuemin={0}
            aria-valuemax={b.need}
            aria-label={`${b.label}: ${b.have} of ${b.need}`}
          >
            <div
              className="h-full rounded-full bg-accent-600"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-right font-mono text-[10px] text-ink-soft">
            {b.have}/{b.need}
          </p>
        </div>
      )}
    </div>
  );
}

export function Passport() {
  usePageTitle("My passport");
  const { user } = useAuth();
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    passportApi
      .me()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user)
    return (
      <main className="container-page py-8">
        <EmptyState title="Sign in to see your passport">
          <Link to="/login" className="text-accent-700 underline">
            Sign in
          </Link>{" "}
          to start collecting verified-visit stamps.
        </EmptyState>
      </main>
    );

  if (loading)
    return (
      <main className="container-page max-w-3xl py-8">
        <Skeleton count={3} height="6rem" />
      </main>
    );

  if (!data)
    return (
      <main className="container-page py-8">
        <EmptyState title="Couldn't load your passport">
          Please try again in a moment.
        </EmptyState>
      </main>
    );

  const earned = data.badges.filter((b) => b.earned);
  const inProgress = data.badges.filter((b) => !b.earned);
  const dollars = (data.money_local_cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <main className="container-page max-w-3xl py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        My passport
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        Every stamp here is a <span className="text-verified">verified</span>{" "}
        visit — proof you actually showed up and supported a local business.{" "}
        <Link
          to="/impact"
          className="text-accent-700 underline-offset-2 hover:underline"
        >
          See your full impact report →
        </Link>
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat value={dollars} label="kept in the local economy" />
        <Stat value={String(data.total_verified)} label="verified visits" />
        <Stat
          value={String(data.distinct_businesses)}
          label="businesses supported"
        />
      </div>
      {data.streak_days >= 2 && (
        <p className="mt-3 font-serif text-ink">
          🔥 You're on a {data.streak_days}-day streak — keep it going!
        </p>
      )}

      <section className="mt-8" aria-label="Badges">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Badges{" "}
          <span className="font-serif text-base text-ink-soft">
            ({earned.length}/{data.badges.length})
          </span>
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[...earned, ...inProgress].map((b) => (
            <BadgeCard key={b.key} b={b} />
          ))}
        </div>
      </section>

      {data.recent.length > 0 && (
        <section className="mt-8" aria-label="Recent verified visits">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Recent verified visits
          </h2>
          <ul className="mt-3 space-y-2">
            {data.recent.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <Link
                  to={`/business/${v.business_id}`}
                  className="font-serif text-ink hover:text-accent-700"
                >
                  {v.business_name}
                </Link>
                <span className="font-mono text-xs text-ink-soft">
                  {v.verified_at
                    ? new Date(v.verified_at).toLocaleDateString()
                    : ""}
                  {v.spend_cents != null &&
                    ` · $${(v.spend_cents / 100).toFixed(0)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 border-t border-border pt-4 font-mono text-[11px] text-ink-soft">
        How verified visits work: we confirm you're at a business with a
        one-time location check (or a code at the counter) only when you check
        in — never in the background. We keep the visit result; the raw location
        samples are purged after 30 days, and your exact coordinates are never
        shown publicly.
      </p>
    </main>
  );
}
