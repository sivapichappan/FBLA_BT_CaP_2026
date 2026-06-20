/**
 * Owner kiosk: displays a rotating check-in code (and a scannable QR) that a
 * customer presents while standing in the business to verify their visit. The
 * code changes every period — a screenshot posted online expires, so only
 * someone at the counter right now can use it. The QR encodes a deep link to the
 * business with the current code, so a phone-camera scan opens the check-in
 * pre-filled; the big code beneath it is the type-it-in fallback.
 *
 * The per-business secret stays on the server — this screen only ever sees the
 * short-lived current token (polled each period).
 */

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Skeleton } from "../../components/ui";
import { ApiError, ownerApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { usePageTitle } from "../../lib/usePageTitle";
import type { CheckinCode } from "../../types";

export function CheckinKiosk() {
  usePageTitle("Check-in code");
  const { user } = useAuth();

  const [businesses, setBusinesses] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [code, setCode] = useState<CheckinCode | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const periodRef = useRef(30);
  const bucketRef = useRef(-1);

  // Load the owner's businesses for the selector.
  useEffect(() => {
    ownerApi
      .mine()
      .then((rows) => {
        const list = (rows as unknown as { id: number; name: string }[]).map(
          (r) => ({ id: r.id, name: r.name }),
        );
        setBusinesses(list);
        if (list.length) setSelectedId(list[0].id);
      })
      .catch(() => setError("Could not load your businesses."));
  }, []);

  // Poll the current code each second; refetch when a new period bucket starts.
  useEffect(() => {
    if (selectedId == null) return;
    bucketRef.current = -1; // force an immediate fetch on (re)select
    const tick = async () => {
      const period = periodRef.current;
      const nowSec = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(nowSec / period);
      if (bucket !== bucketRef.current) {
        bucketRef.current = bucket;
        try {
          const cc = await ownerApi.checkinCode(selectedId);
          periodRef.current = cc.period_seconds || 30;
          setCode(cc);
          setError(null);
        } catch (e) {
          setError(
            e instanceof ApiError ? e.message : "Could not load the code.",
          );
        }
      }
      setSecondsLeft(period - (nowSec % period));
    };
    void tick();
    const t = window.setInterval(() => void tick(), 1000);
    return () => window.clearInterval(t);
  }, [selectedId]);

  // Render the QR for the current code (a deep link that opens check-in).
  useEffect(() => {
    if (!code) {
      setQrDataUrl("");
      return;
    }
    const link = `${window.location.origin}/business/${code.business_id}?checkin=1&code=${encodeURIComponent(code.token)}`;
    QRCode.toDataURL(link, {
      width: 320,
      margin: 2,
      color: { dark: "#1F1B16", light: "#FEFCF8" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [code]);

  if (!user || (user.role !== "owner" && user.role !== "admin"))
    return (
      <main className="container-page py-8">
        <EmptyState title="Owners only">
          <Link to="/login" className="text-accent-700 underline">
            Sign in as an owner
          </Link>{" "}
          to display a check-in code.
        </EmptyState>
      </main>
    );

  return (
    <main className="container-page max-w-xl py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        Check-in code
      </h1>
      <p className="mt-1 font-serif text-ink-soft">
        Show this at your counter. A customer scans it (or types the code) while
        they're here to leave a <span className="text-verified">verified</span>{" "}
        review — proof a real person was actually in your shop.
      </p>

      {businesses.length > 1 && (
        <label className="mt-5 block">
          <span className="font-serif text-sm text-ink-soft">Business</span>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-border bg-cream px-3 py-2 font-serif"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p role="status" className="mt-4 font-serif text-accent-700">
          {error}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
        {code ? (
          <>
            <p className="font-display text-xl font-semibold text-ink">
              {code.business_name}
            </p>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Check-in QR code for ${code.business_name}`}
                className="mx-auto mt-4 h-64 w-64 rounded-lg border border-border"
              />
            ) : (
              <div className="mx-auto mt-4 h-64 w-64 animate-pulse rounded-lg border border-border bg-cream" />
            )}
            <p
              className="mt-4 font-mono text-4xl font-bold tracking-[0.3em] text-ink"
              aria-label={`Current code ${code.token.split("").join(" ")}`}
            >
              {code.token}
            </p>
            <p className="mt-2 font-mono text-xs text-ink-soft">
              Refreshes in {secondsLeft}s
            </p>
          </>
        ) : (
          <Skeleton count={1} height="20rem" />
        )}
      </div>

      <p className="mt-4 font-mono text-[11px] text-ink-soft">
        The code changes every {code?.period_seconds ?? 30} seconds, so a
        screenshot can't be reused later. Your secret key never leaves our
        server.
      </p>
    </main>
  );
}
