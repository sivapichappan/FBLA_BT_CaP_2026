/**
 * Active deals (§8.5): browse, redeem (signed in), and see your codes.
 * Redemption errors (already-redeemed, sold out) surface as friendly inline
 * messages straight from the API.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Skeleton } from "../components/ui";
import { ApiError, dealApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Deal, Redemption } from "../types";
import { usePageTitle } from "../lib/usePageTitle";

export function Deals() {
  usePageTitle("Deals");
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [mine, setMine] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    dealApi
      .listActive()
      .then(setDeals)
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
    if (user)
      dealApi
        .myRedemptions()
        .then(setMine)
        .catch(() => {});
  }, [user]);

  async function redeem(deal: Deal) {
    setMessage(null);
    try {
      const r = await dealApi.redeem(deal.id);
      setMine((curr) => [r, ...curr]);
      setMessage(`Redeemed “${deal.title}” — your code is ${r.code}.`);
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Could not redeem this deal.",
      );
    }
  }

  return (
    <main className="container-page py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        Deals & coupons
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        Exclusive offers from independent businesses near you.
      </p>

      {message && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-accent-600/40 bg-surface px-4 py-2 font-serif text-accent-700"
        >
          {message}
        </p>
      )}

      {loading ? (
        <div className="mt-5">
          <Skeleton count={3} height="6rem" />
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="No active deals right now">
            Check back soon.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {deals.map((d) => {
            const left =
              d.total_limit === null
                ? null
                : d.total_limit - d.redemption_count;
            return (
              <div
                key={d.id}
                className="rounded-lg border border-border bg-surface p-5 shadow-warm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">
                      {d.title}
                    </p>
                    {d.business_name && (
                      <Link
                        to={`/business/${d.business_id}`}
                        className="font-serif text-sm text-accent-700 underline-offset-2 hover:underline"
                      >
                        {d.business_name}
                      </Link>
                    )}
                  </div>
                  <span className="rounded-md bg-accent-700 px-2.5 py-1 font-mono text-sm font-bold text-cream">
                    −{d.discount_pct}%
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-ink-soft">
                  ends {new Date(d.ends_at).toLocaleDateString()}
                  {left !== null &&
                    ` · ${left} redemption${left === 1 ? "" : "s"} left`}
                </p>
                {user ? (
                  <button
                    type="button"
                    onClick={() => redeem(d)}
                    className="mt-3 rounded-md bg-accent-700 px-4 py-2 font-serif text-cream hover:bg-accent-600"
                  >
                    Redeem
                  </button>
                ) : (
                  <p className="mt-3 font-serif text-sm text-ink-soft">
                    <Link
                      to="/login"
                      className="text-accent-700 underline-offset-2 hover:underline"
                    >
                      Sign in
                    </Link>{" "}
                    to redeem.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* The user's redemption codes */}
      {user && mine.length > 0 && (
        <section className="mt-10" aria-label="Your redemption codes">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Your codes
          </h2>
          <div className="mt-3 space-y-2">
            {mine.map((r) => (
              <div
                key={`${r.deal_id}-${r.code}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
              >
                <span className="font-serif text-ink">
                  {r.title}{" "}
                  {r.business_name && (
                    <span className="text-ink-soft">· {r.business_name}</span>
                  )}
                </span>
                <code className="rounded bg-cream px-2 py-1 font-mono text-sm font-bold text-accent-700">
                  {r.code}
                </code>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
