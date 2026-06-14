/**
 * Saved businesses (§8.4). Cards render from the stored SNAPSHOT, so a
 * favorite still displays even if its source business was deleted — that's
 * the point of the denormalized copy.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, LocalBadge, Skeleton, StarRating } from "../components/ui";
import { favoriteApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Favorite } from "../types";
import { usePageTitle } from "../lib/usePageTitle";

export function Favorites() {
  usePageTitle("Favorites");
  const { user, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    favoriteApi
      .list()
      .then(setFavorites)
      .catch(() => setFavorites([]))
      .finally(() => setLoading(false));
  }, [user]);

  async function remove(ref: string) {
    // Optimistic removal; restore by refetch on failure.
    setFavorites((curr) => curr.filter((f) => f.business_ref !== ref));
    try {
      await favoriteApi.remove(ref);
    } catch {
      favoriteApi
        .list()
        .then(setFavorites)
        .catch(() => {});
    }
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
        <EmptyState title="Sign in to see your favorites">
          <Link
            to="/login"
            className="text-accent-700 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>{" "}
          to start saving places.
        </EmptyState>
      </main>
    );

  return (
    <main className="container-page py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        Favorites{" "}
        <span className="font-mono text-base text-ink-soft">
          ({favorites.length})
        </span>
      </h1>

      {loading ? (
        <div className="mt-5">
          <Skeleton count={3} height="6rem" />
        </div>
      ) : favorites.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Nothing saved yet">
            Tap “♡ Save” on any business to keep it here.{" "}
            <Link to="/" className="text-accent-700 underline">
              Start exploring
            </Link>
            .
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {favorites.map((f) => (
            <div
              key={f.id}
              className="rounded-lg border border-border bg-surface p-4 shadow-warm"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/business/${encodeURIComponent(f.business_ref)}`}
                  className="min-w-0"
                >
                  <h2 className="truncate font-display text-lg font-semibold text-ink hover:text-accent-700">
                    {f.snapshot.name}
                  </h2>
                </Link>
                <LocalBadge badge={f.snapshot.local_badge ?? null} />
              </div>
              {typeof f.snapshot.average_rating === "number" &&
                f.snapshot.average_rating > 0 && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <StarRating rating={f.snapshot.average_rating} />
                    <span className="font-serif text-sm text-ink-soft">
                      {f.snapshot.average_rating.toFixed(1)}
                      {f.snapshot.review_count
                        ? ` (${f.snapshot.review_count})`
                        : ""}
                    </span>
                  </div>
                )}
              {f.snapshot.address && (
                <p className="mt-1 truncate font-serif text-sm text-ink-soft">
                  {f.snapshot.address}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  saved {new Date(f.created_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => remove(f.business_ref)}
                  className="font-serif text-sm text-accent-700 underline-offset-2 hover:underline"
                  aria-label={`Remove ${f.snapshot.name} from favorites`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
