/**
 * The user's home: trust score + level (earned +10/review, +5/redemption,
 * +2/favorite — the rules are shown right on the page), their reviews,
 * favorites count, and redemption codes. Level = score ÷ 50, with a progress
 * bar toward the next one.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Skeleton, StarRating } from "../components/ui";
import { dealApi, favoriteApi, reviewApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePageTitle } from "../lib/usePageTitle";
import type { Favorite, Redemption, Review } from "../types";

const LEVEL_SIZE = 50; // trust points per level

export function Profile() {
  usePageTitle("Profile");
  const { user, loading: authLoading, logout } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [codes, setCodes] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.allSettled([
      reviewApi.mine().then(setReviews),
      favoriteApi.list().then(setFavorites),
      dealApi.myRedemptions().then(setCodes),
    ]).finally(() => setLoading(false));
  }, [user]);

  if (authLoading)
    return (
      <main className="container-page py-8">
        <Skeleton />
      </main>
    );
  if (!user)
    return (
      <main className="container-page py-8">
        <EmptyState title="Sign in to see your profile">
          <Link to="/login" className="text-accent-700 underline">
            Sign in
          </Link>{" "}
          to track your reviews, favorites, and trust score.
        </EmptyState>
      </main>
    );

  const level = Math.floor(user.trust_score / LEVEL_SIZE) + 1;
  const intoLevel = user.trust_score % LEVEL_SIZE;
  const progressPct = Math.round((intoLevel / LEVEL_SIZE) * 100);

  return (
    <main className="container-page max-w-4xl py-8">
      {/* Identity + trust card */}
      <section className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-700 font-display text-3xl font-semibold text-cream"
            aria-hidden="true"
          >
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-ink">
              @{user.username}
            </h1>
            <p className="break-words font-serif text-sm text-ink-soft">
              {user.email} · {user.role}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="ml-auto rounded-md border border-border px-3 py-1.5 font-serif text-sm text-ink-soft hover:border-accent-600 hover:text-ink"
          >
            Sign out
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              Trust score
            </p>
            <p className="font-display text-3xl font-semibold text-ink">
              {user.trust_score}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              Level {level} · {LEVEL_SIZE - intoLevel} points to level{" "}
              {level + 1}
            </p>
            <div
              className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-cream"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress to level ${level + 1}`}
            >
              <div
                className="h-full rounded-full bg-verified"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-2 font-serif text-xs text-ink-soft">
              Earn points by contributing: +10 per review · +5 per deal redeemed
              · +2 per favorite.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="mt-6">
          <Skeleton count={2} height="6rem" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* My reviews */}
          <section aria-label="My reviews" className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-ink">
              My reviews{" "}
              <span className="font-mono text-sm text-ink-soft">
                ({reviews.length})
              </span>
            </h2>
            <div className="mt-3 space-y-3">
              {reviews.length === 0 && (
                <p className="font-serif text-sm text-ink-soft">
                  No reviews yet — visit a favorite spot and tell its story.
                </p>
              )}
              {reviews.map((r) => (
                <article
                  key={r.id}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to={`/business/${r.business_id}`}
                      className="min-w-0 truncate font-serif font-medium text-ink hover:text-accent-700"
                    >
                      {r.business_name}
                    </Link>
                    <StarRating rating={r.rating} />
                  </div>
                  <p className="mt-1 break-words font-serif text-sm text-ink-soft">
                    {r.body}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-ink-soft">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <div className="min-w-0 space-y-6">
            {/* Favorites summary */}
            <section aria-label="My favorites">
              <h2 className="font-display text-xl font-semibold text-ink">
                Favorites{" "}
                <span className="font-mono text-sm text-ink-soft">
                  ({favorites.length})
                </span>
              </h2>
              <div className="mt-3 rounded-lg border border-border bg-surface p-4">
                {favorites.length === 0 ? (
                  <p className="font-serif text-sm text-ink-soft">
                    Nothing saved yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {favorites.slice(0, 6).map((f) => (
                      <li key={f.id}>
                        <Link
                          to={`/business/${encodeURIComponent(f.business_ref)}`}
                          className="font-serif text-sm text-ink hover:text-accent-700"
                        >
                          ♥ {f.snapshot.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/favorites"
                  className="mt-3 inline-block font-mono text-xs text-accent-700 underline-offset-2 hover:underline"
                >
                  See all →
                </Link>
              </div>
            </section>

            {/* Redemption codes */}
            <section aria-label="My redemption codes">
              <h2 className="font-display text-xl font-semibold text-ink">
                My codes{" "}
                <span className="font-mono text-sm text-ink-soft">
                  ({codes.length})
                </span>
              </h2>
              <div className="mt-3 space-y-2">
                {codes.length === 0 && (
                  <p className="font-serif text-sm text-ink-soft">
                    Redeem a deal and your code shows up here.
                  </p>
                )}
                {codes.slice(0, 5).map((c) => (
                  <div
                    key={c.code}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate font-serif text-sm text-ink">
                      {c.title}
                      {c.business_name && (
                        <span className="text-ink-soft">
                          {" "}
                          · {c.business_name}
                        </span>
                      )}
                    </span>
                    <code className="ml-3 shrink-0 rounded bg-cream px-2 py-1 font-mono text-sm font-bold text-accent-700">
                      {c.code}
                    </code>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
