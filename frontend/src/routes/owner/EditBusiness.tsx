/**
 * Edit-listing form: prefilled from the live record, PATCHes only the basics
 * (name, address, phone, website, price, photo). The backend re-validates and
 * enforces ownership (§12); COALESCE semantics mean blank = unchanged.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, Skeleton } from "../../components/ui";
import { ApiError, businessApi, ownerApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { usePageTitle } from "../../lib/usePageTitle";

export function EditBusiness() {
  usePageTitle("Edit listing");
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notMine, setNotMine] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [priceLevel, setPriceLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    businessApi
      .detail(id)
      .then((b) => {
        if (b.owner_id !== user.id && user.role !== "admin") {
          setNotMine(true);
          return;
        }
        setName(b.name);
        setAddress(b.address ?? "");
        setPhone(b.phone ?? "");
        setWebsite(b.website ?? "");
        setPhotoUrl(b.photo_url && !b.photo_url.startsWith("/") ? b.photo_url : "");
        setPriceLevel(b.price_level);
      })
      .catch(() => setNotMine(true))
      .finally(() => setLoading(false));
  }, [id, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await ownerApi.updateBusiness(Number(id), {
        name,
        address,
        phone: phone || null,
        website: website || null,
        photo_url: photoUrl || null,
        price_level: priceLevel,
      });
      navigate(`/business/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  if (!user || (user.role !== "owner" && user.role !== "admin") || notMine)
    return (
      <main className="container-page py-8">
        <EmptyState title="Not your listing">
          You can only edit businesses you own.{" "}
          <Link to="/owner" className="text-accent-700 underline">
            Back to the dashboard
          </Link>
          .
        </EmptyState>
      </main>
    );

  if (loading)
    return (
      <main className="container-page max-w-2xl py-8">
        <Skeleton count={2} height="8rem" />
      </main>
    );

  const inputClass =
    "mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif";

  return (
    <main className="container-page max-w-2xl py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        Edit “{name}”
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        Changes go live immediately. Leave a field blank to keep it unchanged.
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
          Business name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            className={inputClass}
          />
        </label>

        <label className="block font-serif text-sm text-ink-soft">
          Street address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            minLength={5}
            maxLength={200}
            className={inputClass}
          />
        </label>

        <div className="flex gap-3">
          <label className="block w-full font-serif text-sm text-ink-soft">
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={25}
              className={inputClass}
            />
          </label>
          <label className="block w-full font-serif text-sm text-ink-soft">
            Website
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              maxLength={200}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block font-serif text-sm text-ink-soft">
          Photo URL{" "}
          <span className="font-mono text-xs">
            (blank keeps the current photo)
          </span>
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            maxLength={400}
            placeholder="https://…"
            className={inputClass}
          />
        </label>

        <fieldset>
          <legend className="font-serif text-sm text-ink-soft">
            Price level
          </legend>
          <div className="mt-1 flex gap-2">
            {[1, 2, 3, 4].map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={priceLevel === p}
                onClick={() => setPriceLevel(priceLevel === p ? null : p)}
                className={`rounded-full border px-3 py-1 font-mono text-sm ${
                  priceLevel === p
                    ? "border-accent-700 bg-accent-700 text-cream"
                    : "border-border text-ink-soft"
                }`}
              >
                {"$".repeat(p)}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent-700 py-2.5 font-serif font-medium text-cream hover:bg-accent-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}
