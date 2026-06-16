/**
 * Owner post-deal form (§11). Client-side checks give instant feedback; the
 * server re-validates (discount 1–100, ends-after-starts) and only the
 * business's owner may post for it (§12).
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/ui";
import { ApiError, ownerApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Business } from "../../types";
import { usePageTitle } from "../../lib/usePageTitle";

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PostDeal() {
  usePageTitle("Post a deal");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<(Business & { id?: number })[]>(
    [],
  );
  const [businessId, setBusinessId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [discount, setDiscount] = useState(10);
  const [perUser, setPerUser] = useState(1);
  const [totalLimit, setTotalLimit] = useState<string>("");
  const [startsAt, setStartsAt] = useState(isoIn(0));
  const [endsAt, setEndsAt] = useState(isoIn(30));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    ownerApi
      .mine()
      .then((rows) => {
        setBusinesses(rows as (Business & { id: number })[]);
        const first = (rows as { id?: number }[])[0];
        if (first?.id) setBusinessId(first.id);
      })
      .catch(() => setBusinesses([]));
  }, [user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!businessId) return setError("Pick a business first.");
    if (endsAt <= startsAt)
      return setError("The end date must be after the start date.");
    setBusy(true);
    try {
      await ownerApi.createDeal({
        business_id: businessId,
        title,
        discount_pct: discount,
        per_user_limit: perUser,
        total_limit: totalLimit === "" ? null : Number(totalLimit),
        starts_at: `${startsAt}T00:00:00Z`,
        ends_at: `${endsAt}T23:59:59Z`,
      });
      navigate("/owner");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the deal.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user || (user.role !== "owner" && user.role !== "admin"))
    return (
      <main className="container-page py-8">
        <EmptyState title="Owners only">
          <Link to="/register" className="text-accent-700 underline">
            Join as an owner
          </Link>{" "}
          to post deals.
        </EmptyState>
      </main>
    );

  const inputClass =
    "mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif";

  return (
    <main className="container-page max-w-xl py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        Post a deal
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        Bring neighbors through the door with an offer they can redeem in-app.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-accent-600/40 bg-surface px-3 py-2 font-serif text-sm text-accent-700"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        className="mt-5 space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <label className="block font-serif text-sm text-ink-soft">
          Business *
          <select
            value={businessId ?? ""}
            onChange={(e) => setBusinessId(Number(e.target.value))}
            required
            className={inputClass}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block font-serif text-sm text-ink-soft">
          Deal title *
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={120}
            placeholder="20% off any espresso drink"
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block w-full font-serif text-sm text-ink-soft">
            Discount % *
            <input
              type="number"
              min={1}
              max={100}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              required
              className={inputClass}
            />
          </label>
          <label className="block w-full font-serif text-sm text-ink-soft">
            Per-user limit
            <input
              type="number"
              min={1}
              value={perUser}
              onChange={(e) => setPerUser(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="block w-full font-serif text-sm text-ink-soft">
            Total limit
            <input
              type="number"
              min={1}
              value={totalLimit}
              placeholder="∞"
              onChange={(e) => setTotalLimit(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block w-full font-serif text-sm text-ink-soft">
            Starts
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className="block w-full font-serif text-sm text-ink-soft">
            Ends
            <input
              type="date"
              value={endsAt}
              min={startsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
              className={inputClass}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent-700 py-2.5 font-serif font-medium text-cream hover:bg-accent-600 disabled:opacity-60"
        >
          {busy ? "Posting…" : "Post deal"}
        </button>
      </form>
    </main>
  );
}
