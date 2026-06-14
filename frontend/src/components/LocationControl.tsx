/**
 * The location switcher: a pill showing where results are centered, expanding
 * to a panel that geocodes any city/address, grabs the device location, or
 * resets to the NYC demo. Every page using useLocation() follows instantly.
 */

import { useState } from "react";
import { businessApi } from "../lib/api";
import {
  resetToDemo,
  setManualLocation,
  useDeviceLocation,
  useLocation,
} from "../lib/location";

export function LocationControl() {
  const coords = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = coords.manual
    ? coords.label
    : coords.fromDevice
      ? "your location"
      : "NYC demo location";

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const r = await businessApi.geocode(input.trim());
      // Keep the label compact: "Chicago, IL 60611, USA" → "Chicago, IL".
      const short = r.formatted_address.split(",").slice(0, 2).join(",").trim();
      setManualLocation(r.lat, r.lng, short);
      setOpen(false);
      setInput("");
    } catch {
      setError("Couldn't find that place — try a city or full address.");
    } finally {
      setBusy(false);
    }
  }

  async function useDevice() {
    setBusy(true);
    const ok = await useDeviceLocation();
    setBusy(false);
    if (ok) setOpen(false);
    else setError("Location permission unavailable — type a city instead.");
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-ink-soft hover:border-accent-600 hover:text-ink"
      >
        ⌖ {label}
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Change search location"
          className="absolute left-0 top-8 z-30 w-72 rounded-lg border border-border bg-surface p-3 shadow-warm"
        >
          <form onSubmit={go}>
            <label htmlFor="loc-input" className="sr-only">
              City or address
            </label>
            <div className="flex gap-2">
              <input
                id="loc-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Chicago · 90210 · 1 Main St…"
                className="w-full rounded-md border border-border bg-cream px-2.5 py-1.5 font-serif text-sm"
              />
              <button
                type="submit"
                disabled={busy || input.trim().length < 3}
                className="shrink-0 rounded-md bg-accent-700 px-3 py-1.5 font-serif text-sm text-cream disabled:opacity-50"
              >
                Go
              </button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-2 font-serif text-xs text-accent-700">
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={useDevice}
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 font-serif text-xs text-ink hover:border-accent-600 disabled:opacity-50"
            >
              ⌖ Use my location
            </button>
            <button
              type="button"
              onClick={() => {
                resetToDemo();
                setOpen(false);
              }}
              className="rounded-md border border-border px-2.5 py-1 font-serif text-xs text-ink-soft hover:border-accent-600"
            >
              NYC demo
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
