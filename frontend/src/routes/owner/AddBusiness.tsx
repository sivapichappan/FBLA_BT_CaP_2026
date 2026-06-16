/**
 * Owner add-business form (§11). Address → coordinates via the geocode
 * endpoint (manual lat/lng fallback if lookup fails, §13); categories from the
 * taxonomy; a 7-day hours grid. The backend writes business + categories +
 * hours in ONE transaction and re-validates everything (§12).
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/ui";
import { ApiError, businessApi, ownerApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Category } from "../../types";
import { usePageTitle } from "../../lib/usePageTitle";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

export function AddBusiness() {
  usePageTitle("Add business");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [manualCoords, setManualCoords] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [priceLevel, setPriceLevel] = useState<number | null>(null);
  const [selectedCats, setSelectedCats] = useState<number[]>([]);
  const [hours, setHours] = useState<DayHours[]>(
    DAYS.map((_, dow) => ({
      closed: dow === 0,
      open: "09:00",
      close: "17:00",
    })),
  );
  const [geocodeState, setGeocodeState] = useState<
    "idle" | "looking" | "ok" | "failed"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    businessApi
      .categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  async function lookupAddress() {
    if (address.trim().length < 5) return;
    setGeocodeState("looking");
    try {
      const r = await ownerApi.geocode(address);
      setCoords({ lat: r.lat, lng: r.lng });
      setAddress(r.formatted_address);
      setGeocodeState("ok");
    } catch {
      // Graceful degradation: offer manual coordinates instead of blocking.
      setGeocodeState("failed");
      setManualCoords(true);
    }
  }

  function setDay(dow: number, patch: Partial<DayHours>) {
    setHours((curr) =>
      curr.map((h, i) => (i === dow ? { ...h, ...patch } : h)),
    );
  }

  function toggleCat(id: number) {
    setSelectedCats((curr) =>
      curr.includes(id)
        ? curr.filter((c) => c !== id)
        : curr.length < 5
          ? [...curr, id]
          : curr,
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const finalLat = manualCoords ? Number(lat) : coords?.lat;
    const finalLng = manualCoords ? Number(lng) : coords?.lng;
    if (
      finalLat === undefined ||
      finalLng === undefined ||
      Number.isNaN(finalLat) ||
      Number.isNaN(finalLng)
    ) {
      return setError(
        "Look up the address (or enter coordinates) before submitting.",
      );
    }
    setBusy(true);
    try {
      const created = await ownerApi.createBusiness({
        name,
        address,
        lat: finalLat,
        lng: finalLng,
        phone: phone || null,
        website: website || null,
        photo_url: photoUrl || null,
        price_level: priceLevel,
        category_ids: selectedCats,
        hours: hours.map((h, dow) => ({
          dow,
          open: h.open,
          close: h.close,
          closed: h.closed,
        })),
      });
      navigate(`/business/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the listing.",
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
          to list a business.
        </EmptyState>
      </main>
    );

  const inputClass =
    "mt-1 w-full rounded-md border border-border bg-cream px-3 py-2 font-serif";

  return (
    <main className="container-page max-w-2xl py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        Add your business
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        Free, always. Get found by neighbors who want to support you.
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
        className="mt-5 space-y-5 rounded-lg border border-border bg-surface p-6"
      >
        <label className="block font-serif text-sm text-ink-soft">
          Business name *
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            className={inputClass}
          />
        </label>

        <div>
          <label
            htmlFor="biz-address"
            className="block font-serif text-sm text-ink-soft"
          >
            Street address *
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="biz-address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setGeocodeState("idle");
              }}
              required
              minLength={5}
              placeholder="119 MacDougal St, New York, NY"
              className="w-full rounded-md border border-border bg-cream px-3 py-2 font-serif"
            />
            <button
              type="button"
              onClick={lookupAddress}
              disabled={geocodeState === "looking"}
              className="shrink-0 rounded-md border border-border px-3 py-2 font-serif text-sm text-ink hover:border-accent-600 disabled:opacity-50"
            >
              {geocodeState === "looking" ? "Looking…" : "Look up"}
            </button>
          </div>
          {geocodeState === "ok" && coords && (
            <p className="mt-1 font-mono text-xs text-verified">
              ✓ located at {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </p>
          )}
          {geocodeState === "failed" && (
            <p className="mt-1 font-mono text-xs text-accent-700">
              Lookup failed — enter coordinates below.
            </p>
          )}
        </div>

        {manualCoords && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block w-full font-serif text-sm text-ink-soft">
              Latitude
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="40.7308"
                className={inputClass}
              />
            </label>
            <label className="block w-full font-serif text-sm text-ink-soft">
              Longitude
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-73.9973"
                className={inputClass}
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block w-full font-serif text-sm text-ink-soft">
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={25}
              placeholder="(212) 555-0100"
              className={inputClass}
            />
          </label>
          <label className="block w-full font-serif text-sm text-ink-soft">
            Website
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              maxLength={200}
              placeholder="https://…"
              className={inputClass}
            />
          </label>
        </div>

        <label className="block font-serif text-sm text-ink-soft">
          Photo URL <span className="font-mono text-xs">(optional)</span>
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            maxLength={400}
            placeholder="https://… (a storefront photo; leave blank for a monogram tile)"
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

        <fieldset>
          <legend className="font-serif text-sm text-ink-soft">
            Categories (up to 5)
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={selectedCats.includes(c.id)}
                onClick={() => toggleCat(c.id)}
                className={`rounded-full border px-3 py-1 font-serif text-sm ${
                  selectedCats.includes(c.id)
                    ? "border-accent-700 bg-accent-700 text-cream"
                    : "border-border text-ink-soft"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-serif text-sm text-ink-soft">Hours</legend>
          <div className="mt-2 space-y-1.5">
            {DAYS.map((day, dow) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-24 font-mono text-xs text-ink-soft">
                  {day}
                </span>
                <label className="flex items-center gap-1 font-serif text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={hours[dow].closed}
                    onChange={(e) => setDay(dow, { closed: e.target.checked })}
                  />
                  closed
                </label>
                {!hours[dow].closed && (
                  <>
                    <input
                      type="time"
                      value={hours[dow].open}
                      onChange={(e) => setDay(dow, { open: e.target.value })}
                      aria-label={`${day} opening time`}
                      className="rounded border border-border bg-cream px-1.5 py-0.5 font-mono text-xs"
                    />
                    <span className="text-ink-soft">–</span>
                    <input
                      type="time"
                      value={hours[dow].close}
                      onChange={(e) => setDay(dow, { close: e.target.value })}
                      aria-label={`${day} closing time`}
                      className="rounded border border-border bg-cream px-1.5 py-0.5 font-mono text-xs"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent-700 py-2.5 font-serif font-medium text-cream hover:bg-accent-600 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create listing"}
        </button>
      </form>
    </main>
  );
}
