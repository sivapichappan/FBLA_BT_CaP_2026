/**
 * Business detail: info + hours, favorite toggle (works for BOTH local and
 * Google businesses — §8.4), and for local businesses the review system
 * (§8.2) and live deals (§8.5). Every action handles failure with a message,
 * never a crash (§13).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckInFlow } from "../components/CheckInFlow";
import { MapView } from "../components/MapView";
import { Reveal } from "../components/Reveal";
import { TrustAdjustedRating } from "../components/TrustAdjustedRating";
import { VerdictBreakdown } from "../components/VerdictBreakdown";
import { VerifiedRating } from "../components/VerifiedRating";
import {
  BizImage,
  EmptyState,
  LocalBadge,
  OpenBadge,
  PriceLevel,
  Skeleton,
  StarRating,
} from "../components/ui";
import {
  ApiError,
  businessApi,
  businessSnapshot,
  dealApi,
  favoriteApi,
  reviewApi,
  visitApi,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocation } from "../lib/location";
import { usePageTitle } from "../lib/usePageTitle";
import type { Business, Deal, Review } from "../types";

export function BusinessDetail() {
  const { ref = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const coords = useLocation();

  const [biz, setBiz] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Review form state (create or edit-in-place).
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  // Optional spend on a verified visit, chosen IN the composer (feeds "money
  // kept local", §17). null = not answered; never blocks posting.
  const [spendCents, setSpendCents] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Owner reply form state (only this business's owner ever sees it).
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  // Verified Visits: the trust toggle, an attached verified visit, and the
  // check-in modal.
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [linkedVisitId, setLinkedVisitId] = useState<number | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLocal = /^\d+$/.test(ref);
  const localId = isLocal ? Number(ref) : null;
  // Is the signed-in user this business's owner? Gates the reply controls.
  const isOwner =
    !!user && (biz?.owner_id === user.id || user.role === "admin");
  const myReview = user
    ? reviews.find((r) => r.user_id === user.id)
    : undefined;
  // The "Verified reviews only" toggle filters the list client-side (no refetch).
  const shownReviews = verifiedOnly
    ? reviews.filter((r) => r.is_verified)
    : reviews;
  usePageTitle(biz?.name ?? "Business");

  // Reviews work for ANY business now (a not-yet-materialized Google business
  // simply returns []), so we load them by ref regardless of source.
  const loadReviews = useCallback(() => {
    reviewApi
      .list(ref)
      .then(setReviews)
      .catch(() => setReviews([]));
  }, [ref]);

  useEffect(() => {
    setLoading(true);
    businessApi
      .detail(ref, coords.lat, coords.lng)
      .then(setBiz)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    loadReviews();
    // Deals + the AI review summary remain local-business features.
    if (localId) {
      dealApi
        .forBusiness(localId)
        .then(setDeals)
        .catch(() => setDeals([]));
      // "What people love here" — null (offline/few reviews) just hides it.
      businessApi
        .summary(localId)
        .then((r) => setSummary(r.summary))
        .catch(() => setSummary(null));
    }
    if (user)
      favoriteApi
        .check(ref)
        .then((r) => setIsFavorite(r.is_favorite))
        .catch(() => {});
  }, [ref, localId, user, coords.lat, coords.lng, loadReviews]);

  // A scanned kiosk QR deep-links here with ?checkin=1&code=… — auto-open the
  // check-in modal so the customer can verify in one step.
  useEffect(() => {
    if (searchParams.get("checkin") === "1") setCheckInOpen(true);
  }, [searchParams]);

  // After a verified check-in — once the check-in modal has closed — bring the
  // user straight to the review form so the "now write it" step is obvious and
  // the textarea gets focus (not stolen back by the modal's focus trap).
  useEffect(() => {
    if (linkedVisitId && !checkInOpen && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current?.focus();
    }
  }, [linkedVisitId, checkInOpen]);

  async function toggleFavorite() {
    if (!user || !biz) {
      setMessage("Sign in to save favorites.");
      return;
    }
    try {
      if (isFavorite) {
        await favoriteApi.remove(ref);
        setIsFavorite(false);
      } else {
        // Snapshot enough to render the card later, even if the source vanishes (§8.4).
        await favoriteApi.add(ref, {
          name: biz.name,
          source: biz.source,
          address: biz.address ?? undefined,
          average_rating: biz.average_rating,
          review_count: biz.review_count,
          price_level: biz.price_level ?? undefined,
          categories: biz.categories,
          lat: biz.lat,
          lng: biz.lng,
          local_badge: biz.local_badge ?? undefined,
        });
        setIsFavorite(true);
      }
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Could not update favorite.",
      );
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!biz) return;
    setMessage(null);
    try {
      if (editingId) {
        await reviewApi.update(editingId, { rating, body });
        setEditingId(null);
      } else {
        // Review by ref (materializing a Google business via the snapshot) and
        // attach the verified visit (if any) so the review is verified.
        await reviewApi.create(
          ref,
          rating,
          body,
          linkedVisitId ?? undefined,
          businessSnapshot(biz),
        );
        // Record the spend the user noted while writing — feeds their "money
        // kept local" total (§17). Optional, and never blocks the review.
        if (linkedVisitId && spendCents != null) {
          try {
            await visitApi.setSpend(linkedVisitId, spendCents);
          } catch {
            /* optional — a failed spend never blocks the review */
          }
        }
        setLinkedVisitId(null);
        setSpendCents(null);
      }
      setBody("");
      setRating(5);
      loadReviews();
      // Aggregate (avg/count) changed server-side in the same transaction — refetch.
      businessApi
        .detail(ref, coords.lat, coords.lng)
        .then(setBiz)
        .catch(() => {});
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Could not save review.",
      );
    }
  }

  async function deleteReview(id: number) {
    try {
      await reviewApi.remove(id);
      loadReviews();
      businessApi
        .detail(ref, coords.lat, coords.lng)
        .then(setBiz)
        .catch(() => {});
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Could not delete review.",
      );
    }
  }

  async function submitReply(reviewId: number) {
    if (!replyBody.trim()) return;
    try {
      await reviewApi.reply(reviewId, replyBody.trim());
      setReplyingId(null);
      setReplyBody("");
      loadReviews();
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Could not save the reply.",
      );
    }
  }

  async function removeReply(reviewId: number) {
    try {
      await reviewApi.deleteReply(reviewId);
      loadReviews();
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Could not delete the reply.",
      );
    }
  }

  async function redeem(dealId: number) {
    try {
      const r = await dealApi.redeem(dealId);
      setMessage(
        `Redeemed! Show code ${r.code} at ${r.business_name ?? "the counter"}.`,
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not redeem.");
    }
  }

  if (loading)
    return (
      <main className="container-page py-8">
        <Skeleton count={3} height="8rem" />
      </main>
    );
  if (notFound || !biz)
    return (
      <main className="container-page py-8">
        <EmptyState title="Business not found">
          <Link to="/search" className="text-accent-700 underline">
            Back to search
          </Link>
        </EmptyState>
      </main>
    );

  return (
    <main className="container-page max-w-4xl py-8">
      {/* Hero photo (monogram tile when absent/offline) */}
      <Reveal>
        <BizImage
          photoUrl={biz.photo_url}
          name={biz.name}
          className="mb-6 h-48 w-full rounded-lg border border-border sm:h-64"
          focusX={biz.photo_focus_x}
          focusY={biz.photo_focus_y}
        />
      </Reveal>
      {/* Header */}
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold text-ink">
              {biz.name}
            </h1>
            <div className="mt-2">
              {/* Two-tier rating + the headline "Verified reviews only" toggle. */}
              <VerifiedRating
                rawRating={biz.average_rating}
                rawCount={biz.review_count}
                verifiedRating={biz.verified_rating ?? null}
                verifiedCount={biz.verified_reviews ?? 0}
                verifiedOnly={verifiedOnly}
                onToggle={setVerifiedOnly}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <PriceLevel level={biz.price_level} />
                <OpenBadge open={biz.is_open_now} />
                <LocalBadge badge={biz.local_badge} />
              </div>
            </div>
            <p className="mt-2 font-serif text-ink-soft">
              {biz.categories.join(" · ")}
              {biz.distance_km !== null && ` · ${biz.distance_km} km away`}
            </p>
            {/* Glass-box (§9.4): the detector's reasoning, on demand. */}
            <VerdictBreakdown businessRef={biz.ref} />
            {/* Glass-box trust-weighted rating (verified reviews count more). */}
            <TrustAdjustedRating trust={biz.trust} />
          </div>
          <button
            type="button"
            onClick={toggleFavorite}
            aria-pressed={isFavorite}
            className={`rounded-full border px-4 py-2 font-serif transition-colors ${
              isFavorite
                ? "border-accent-700 bg-accent-700 text-cream"
                : "border-border bg-surface text-ink hover:border-accent-600"
            }`}
          >
            {isFavorite ? "♥ Saved" : "♡ Save"}
          </button>
        </div>
      </Reveal>

      {message && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-accent-600/40 bg-surface px-4 py-2 font-serif text-accent-700"
        >
          {message}
        </p>
      )}

      {/* What people love here — grounded LLM digest of the reviews below */}
      {summary && (
        <blockquote className="mt-6 border-l-2 border-accent-600 bg-surface px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wide text-accent-700">
            What people love here
          </p>
          <p className="mt-1 font-serif italic text-ink">{summary}</p>
          <p className="mt-1 font-mono text-[10px] text-ink-soft">
            ✦ AI summary of the reviews below
          </p>
        </blockquote>
      )}

      {/* Info + hours */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            Details
          </h2>
          <ul className="mt-2 space-y-1 font-serif text-ink-soft">
            {biz.address && <li>{biz.address}</li>}
            {biz.phone && (
              <li>
                <a href={`tel:${biz.phone}`} className="text-accent-700">
                  {biz.phone}
                </a>
              </li>
            )}
            {biz.website && (
              <li>
                <a
                  href={biz.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-700 underline-offset-2 hover:underline"
                >
                  Website ↗
                </a>
              </li>
            )}
            {biz.editorial_summary && (
              <li className="italic">{biz.editorial_summary}</li>
            )}
          </ul>
        </section>
        {biz.hours_text && biz.hours_text.length > 0 && (
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold text-ink">
              Hours
            </h2>
            <ul className="mt-2 space-y-1 font-mono text-sm text-ink-soft">
              {biz.hours_text.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Location — one pin for this business. Not wrapped in <Reveal> on
          purpose: a transform ancestor can mis-size a Google map. Guarded by
          coords so a result missing lat/lng simply omits the map (§13). */}
      {typeof biz.lat === "number" && typeof biz.lng === "number" && (
        <section aria-label="Location" className="mt-6">
          <h2 className="font-display text-lg font-semibold text-ink">
            Location
          </h2>
          <div className="mt-2 h-80 sm:h-96">
            <MapView
              businesses={[biz]}
              center={{ lat: biz.lat, lng: biz.lng }}
              zoom={16}
              hoveredRef={null}
              onHover={() => {}}
              onSelect={() => {}}
              ariaLabel={`Map showing ${biz.name}`}
            />
          </div>
        </section>
      )}

      {/* Deals (local businesses only) */}
      {deals.length > 0 && (
        <section className="mt-6" aria-label="Active deals">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Deals
          </h2>
          <div className="mt-3 space-y-3">
            {deals.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4"
              >
                <div>
                  <p className="font-serif font-medium text-ink">{d.title}</p>
                  <p className="font-mono text-xs text-ink-soft">
                    {d.discount_pct}% off · ends{" "}
                    {new Date(d.ends_at).toLocaleDateString()}
                    {d.total_limit !== null &&
                      ` · ${d.total_limit - d.redemption_count} left`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => redeem(d.id)}
                  className="rounded-md bg-accent-700 px-4 py-2 font-serif text-cream hover:bg-accent-600"
                >
                  Redeem
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Reviews (local businesses only) */}
      {/* Reviews + check-in — available for ANY business (Google ones are
          materialized on first review/visit). */}
      <section className="mt-8" aria-label="Reviews">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Reviews
        </h2>

        {/* Write/edit form — one review per user (§8.2). */}
        {user && (!myReview || editingId) ? (
          <form
            ref={formRef}
            onSubmit={submitReview}
            className="mt-3 rounded-lg border border-border bg-surface p-4"
          >
            <h3 className="font-display text-lg font-semibold text-ink">
              {editingId ? "Edit your review" : "Leave a review"}
            </h3>

            {/* Verification choice (new reviews only) — framed as the payoff. */}
            {!editingId &&
              (linkedVisitId ? (
                <p className="mt-2 flex items-center gap-2 rounded-md border border-verified bg-surface px-3 py-2 font-serif text-sm text-verified">
                  <span aria-hidden="true">✓</span> Verified visit attached —
                  your review will carry a Verified badge.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-cream px-3 py-2">
                  <span className="font-serif text-sm text-ink">
                    Here right now? Check in for a{" "}
                    <span className="text-verified">✓ Verified</span> badge.
                  </span>
                  <button
                    type="button"
                    onClick={() => setCheckInOpen(true)}
                    className="rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600"
                  >
                    📍 Check in
                  </button>
                  <span className="font-mono text-[11px] text-ink-soft">
                    optional
                  </span>
                </div>
              ))}

            {/* Spend prompt — shown only on a verified visit, asked HERE while
                you write (not as a gate after check-in). Feeds "money kept
                local" (§17); tapping a chip again clears it. */}
            {!editingId && linkedVisitId && (
              <div className="mt-3">
                <span className="font-serif text-sm text-ink-soft">
                  Roughly how much did you spend here?{" "}
                  <span className="font-mono text-[11px]">
                    optional — adds to your “money kept local”
                  </span>
                </span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {[500, 1500, 3000].map((cents) => (
                    <button
                      key={cents}
                      type="button"
                      onClick={() =>
                        setSpendCents(spendCents === cents ? null : cents)
                      }
                      aria-pressed={spendCents === cents}
                      className={`rounded-md border px-3 py-1.5 font-serif text-sm transition-colors ${
                        spendCents === cents
                          ? "border-accent-700 bg-accent-700 text-cream"
                          : "border-border text-ink hover:border-accent-600"
                      }`}
                    >
                      ${cents / 100}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive star picker — clearer than a dropdown. */}
            <label className="mt-3 block font-serif text-sm text-ink-soft">
              Your rating
            </label>
            <div
              className="mt-1 flex items-center gap-1"
              role="radiogroup"
              aria-label="Your rating"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  aria-pressed={rating === n}
                  className="rounded p-0.5 transition-transform hover:scale-110"
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill={n <= rating ? "var(--accent-600)" : "none"}
                    stroke={n <= rating ? "var(--accent-600)" : "var(--chain)"}
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              ))}
              <span className="ml-2 font-serif text-sm text-ink-soft">
                {rating}/5
              </span>
            </div>

            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={2000}
              rows={3}
              placeholder="What makes this place worth knowing about?"
              className="mt-3 w-full rounded-md border border-border bg-cream p-3 font-serif"
              aria-label="Review text"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-accent-700 px-4 py-2 font-serif text-cream hover:bg-accent-600"
              >
                {editingId ? "Update review" : "Post review"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setBody("");
                  }}
                  className="font-serif text-ink-soft"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : !user ? (
          <p className="mt-3 font-serif text-ink-soft">
            <Link
              to="/login"
              className="text-accent-700 underline-offset-2 hover:underline"
            >
              Sign in
            </Link>{" "}
            to leave a review.
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {shownReviews.length === 0 && (
            <p className="font-serif text-ink-soft">
              {verifiedOnly
                ? "No verified reviews yet — check in to leave the first."
                : "No reviews yet — be the first."}
            </p>
          )}
          {shownReviews.map((r) => (
            <article
              key={r.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRating rating={r.rating} />
                  <span className="font-serif font-medium text-ink">
                    {r.username}
                  </span>
                  <span className="font-mono text-xs text-ink-soft">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  {r.is_verified && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-verified px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-verified">
                      ✓ Verified visit
                    </span>
                  )}
                </div>
                {user?.id === r.user_id && (
                  <span className="flex gap-3 font-serif text-sm">
                    <button
                      type="button"
                      className="text-accent-700"
                      onClick={() => {
                        setEditingId(r.id);
                        setRating(r.rating);
                        setBody(r.body);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-ink-soft"
                      onClick={() => deleteReview(r.id)}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>
              <p className="mt-2 font-serif text-ink">{r.body}</p>

              {/* Owner's response (visible to everyone) */}
              {r.reply && replyingId !== r.id && (
                <div className="mt-3 border-l-2 border-accent-600/50 bg-cream/60 py-2 pl-3 pr-2">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent-700">
                    Response from the owner
                  </p>
                  <p className="mt-1 font-serif text-sm text-ink">
                    {r.reply.body}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-ink-soft">
                    @{r.reply.owner_username} ·{" "}
                    {new Date(r.reply.created_at).toLocaleDateString()}
                  </p>
                </div>
              )}

              {/* Owner reply form (create or edit) */}
              {isOwner && replyingId === r.id && (
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitReply(r.id);
                  }}
                >
                  <label htmlFor={`reply-${r.id}`} className="sr-only">
                    Reply to this review
                  </label>
                  <textarea
                    id={`reply-${r.id}`}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    required
                    maxLength={1000}
                    rows={2}
                    placeholder="Thank the reviewer, answer a concern, share an update…"
                    className="w-full rounded-md border border-border bg-cream p-2 font-serif text-sm"
                  />
                  <div className="mt-1 flex gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream hover:bg-accent-600"
                    >
                      {r.reply ? "Update reply" : "Post reply"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingId(null);
                        setReplyBody("");
                      }}
                      className="font-serif text-sm text-ink-soft"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    user &&
                    reviewApi
                      .helpful(r.id)
                      .then(loadReviews)
                      .catch(() => {})
                  }
                  className="font-mono text-xs text-ink-soft hover:text-accent-700"
                >
                  Helpful ({r.helpful_count})
                </button>
                {isOwner && replyingId !== r.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingId(r.id);
                        setReplyBody(r.reply?.body ?? "");
                      }}
                      className="font-mono text-xs text-accent-700 hover:underline"
                    >
                      {r.reply ? "Edit reply" : "Reply as owner"}
                    </button>
                    {r.reply && (
                      <button
                        type="button"
                        onClick={() => removeReply(r.id)}
                        className="font-mono text-xs text-ink-soft hover:text-accent-700"
                      >
                        Delete reply
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      {checkInOpen && (
        <CheckInFlow
          business={biz}
          onVerified={(visitId) => setLinkedVisitId(visitId)}
          onClose={() => setCheckInOpen(false)}
          initialCode={searchParams.get("code") ?? undefined}
        />
      )}
    </main>
  );
}
