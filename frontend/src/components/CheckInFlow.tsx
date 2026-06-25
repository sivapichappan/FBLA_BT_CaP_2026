/**
 * Verified-Visit check-in: prove the user is physically at a business so their
 * review can be marked verified. The hero method is GPS + dwell — one location
 * ping puts you "here", then we confirm again after a short stay so a momentary
 * spoof can't pass.
 *
 * Resilience (§13): every failure path has a graceful exit. If location is
 * denied/unavailable, the geofence is missed, or an anti-abuse rule trips, the
 * user is always offered the "post an unverified review instead" path — nobody
 * is ever hard-blocked from reviewing.
 *
 * Privacy (§14): we read location ONLY during this check-in (no background
 * tracking), and say so. The user's coordinates are sent to confirm presence and
 * are never shown publicly.
 */

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ApiError, businessSnapshot, visitApi } from "../lib/api";
import { trapFocus } from "../lib/focusTrap";
import type { Business, VisitResult } from "../types";
import { MapView } from "./MapView";

type Phase =
  | "intro"
  | "locating"
  | "checking"
  | "dwell"
  | "verified"
  | "failed";

/** One high-accuracy position read. Rejects with a user-safe message. */
function getPrecisePosition(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location isn't available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied. You can still post an unverified review."
              : "We couldn't read your location. Try again with a clear view of the sky.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}

export function CheckInFlow({
  business,
  onVerified,
  onClose,
  initialCode,
}: {
  business: Business;
  /** Called the moment the visit is VERIFIED, so the review composer can link it. */
  onVerified: (visitId: number) => void;
  onClose: () => void;
  /** A code from a scanned kiosk QR (deep link) — pre-fills the code field. */
  initialCode?: string;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<VisitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [code, setCode] = useState((initialCode ?? "").toUpperCase());

  const radiusM = business.geofence_radius_m ?? 100;

  const visitIdRef = useRef<number | null>(null);
  const dwellTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const cardRef = useRef<HTMLDivElement>(null);
  // Always-fresh re-check fn so the dwell interval never calls a stale closure.
  const recheckRef = useRef<() => void>(() => {});

  function stopDwell() {
    if (dwellTimer.current) {
      window.clearInterval(dwellTimer.current);
      dwellTimer.current = undefined;
    }
  }

  function applyResult(res: VisitResult) {
    if (!mounted.current) return;
    setResult(res);
    if (res.status === "VERIFIED") {
      stopDwell();
      setPhase("verified");
      onVerified(res.visit_id); // attach now, so closing still keeps it linked
    } else if (
      res.status === "AWAITING_DWELL" ||
      res.needs_another_checkpoint
    ) {
      setPhase("dwell");
      // Re-check every 20 s; the server flips to VERIFIED once the dwell elapses.
      if (!dwellTimer.current) {
        dwellTimer.current = window.setInterval(
          () => recheckRef.current(),
          20_000,
        );
      }
    } else {
      stopDwell(); // FAILED / REJECTED / EXPIRED
      setPhase("failed");
    }
  }

  async function checkpoint(visitId: number, silent: boolean) {
    try {
      if (!silent) setPhase("checking");
      const pos = await getPrecisePosition();
      if (!mounted.current) return;
      setUserPos({ lat: pos.lat, lng: pos.lng });
      const res = await visitApi.checkpoint(visitId, {
        latitude: pos.lat,
        longitude: pos.lng,
        accuracy_m: pos.accuracy,
        mock_location: false,
        client_ts: new Date().toISOString(),
      });
      if (!mounted.current) return;
      applyResult(res);
    } catch (e) {
      if (!mounted.current) return;
      if (silent) return; // a transient blip during dwell — let the next tick retry
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setPhase("failed");
    }
  }
  recheckRef.current = () => {
    if (visitIdRef.current) void checkpoint(visitIdRef.current, true);
  };

  async function start() {
    setError(null);
    setResult(null);
    setPhase("locating");
    let pos: { lat: number; lng: number; accuracy: number };
    try {
      pos = await getPrecisePosition();
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setPhase("failed");
      }
      return;
    }
    if (!mounted.current) return;
    setUserPos({ lat: pos.lat, lng: pos.lng });
    setPhase("checking");
    try {
      const visit = await visitApi.initiate(
        business.ref,
        "GPS_GEOFENCE_DWELL",
        businessSnapshot(business),
      );
      visitIdRef.current = visit.visit_id;
      const res = await visitApi.checkpoint(visit.visit_id, {
        latitude: pos.lat,
        longitude: pos.lng,
        accuracy_m: pos.accuracy,
        mock_location: false,
        client_ts: new Date().toISOString(),
      });
      if (mounted.current) applyResult(res);
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof ApiError ? e.message : "Couldn't reach the server.",
        );
        setPhase("failed");
      }
    }
  }

  // The counter-code path (QR_GEOFENCE): the code is verified server-side AND an
  // in-geofence checkpoint is still required, so it's the highest-trust method.
  async function startQr() {
    const token = code.trim().toUpperCase();
    if (!token) return;
    setError(null);
    setResult(null);
    setPhase("locating");
    let pos: { lat: number; lng: number; accuracy: number };
    try {
      pos = await getPrecisePosition();
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setPhase("failed");
      }
      return;
    }
    if (!mounted.current) return;
    setUserPos({ lat: pos.lat, lng: pos.lng });
    setPhase("checking");
    try {
      const visit = await visitApi.initiate(
        business.ref,
        "QR_GEOFENCE",
        businessSnapshot(business),
      );
      visitIdRef.current = visit.visit_id;
      const res = await visitApi.submitQr(visit.visit_id, {
        token,
        latitude: pos.lat,
        longitude: pos.lng,
        accuracy_m: pos.accuracy,
        mock_location: false,
        client_ts: new Date().toISOString(),
      });
      if (mounted.current) applyResult(res);
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof ApiError ? e.message : "Couldn't reach the server.",
        );
        setPhase("failed");
      }
    }
  }

  // Lifecycle: focus the dialog, close on Esc, clean up the dwell timer.
  useEffect(() => {
    mounted.current = true;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      mounted.current = false;
      stopDwell();
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showMap = phase !== "intro" && userPos !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-title"
    >
      {/* Scrim — inline rgba because Tailwind opacity-on-CSS-var doesn't compile. */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(31,27,22,0.45)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        ref={cardRef}
        tabIndex={-1}
        onKeyDown={(e) => trapFocus(e, cardRef.current)}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-lift outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="checkin-title"
            className="font-display text-2xl font-semibold text-ink"
          >
            Check in to verify
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close check-in"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-ink-soft hover:border-accent-600 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 font-serif text-sm text-ink-soft">{business.name}</p>

        {showMap && (
          <div className="mt-4 h-44 overflow-hidden rounded-lg sm:h-52">
            <MapView
              businesses={[business]}
              center={{ lat: business.lat, lng: business.lng }}
              zoom={17}
              hoveredRef={null}
              onHover={() => {}}
              onSelect={() => {}}
              geofence={{ lat: business.lat, lng: business.lng, radiusM }}
              userPosition={userPos}
              minHeightClass="min-h-0"
              ariaLabel={`Map showing the check-in area around ${business.name}`}
            />
          </div>
        )}

        {/* Phase content. No per-phase fade — switching states should be instant
            so a "Try again" message never flickers away. */}
        <div className="mt-4">
          {phase === "intro" && (
            <div>
              <p className="font-serif text-ink">
                We'll use your location once, right now, to confirm you're at{" "}
                {business.name}. We don't track you — your coordinates are only
                used to verify this visit and are never shown publicly.
              </p>
              <button
                type="button"
                onClick={start}
                className="mt-4 w-full rounded-md bg-accent-700 px-4 py-2.5 font-serif text-cream hover:bg-accent-600"
              >
                📍 Check me in
              </button>

              {/* Counter-code path: type (or scan) the rotating code shown
                      at the business — highest-trust, still geofenced. */}
              <div className="mt-4 border-t border-border pt-4">
                <label
                  htmlFor="checkin-code"
                  className="font-serif text-sm text-ink-soft"
                >
                  At the counter? Enter the code shown there:
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="checkin-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={16}
                    placeholder="e.g. 5SKSAIIE"
                    className="min-w-0 flex-1 rounded-md border border-border bg-cream px-3 py-2 font-mono tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={startQr}
                    disabled={!code.trim()}
                    className="rounded-md border border-accent-600 px-3 py-2 font-serif text-accent-700 hover:bg-accent-700 hover:text-cream disabled:opacity-40"
                  >
                    Verify
                  </button>
                </div>
              </div>
            </div>
          )}

          {(phase === "locating" || phase === "checking") && (
            <p role="status" className="py-2 font-serif text-ink">
              {phase === "locating"
                ? "Getting your location…"
                : `Confirming you're at ${business.name}…`}
            </p>
          )}

          {phase === "dwell" && (
            <div>
              <p role="status" className="font-serif text-ink">
                {result?.message ??
                  "You're here. Stay a moment and we'll confirm your visit."}
              </p>
              <p className="mt-2 font-mono text-[11px] text-ink-soft">
                Keep this open — we'll confirm automatically. ✓
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 font-serif text-sm text-ink-soft underline-offset-2 hover:underline"
              >
                Cancel and post an unverified review instead
              </button>
            </div>
          )}

          {phase === "verified" && (
            <div>
              <p className="font-serif text-lg text-ink">
                <span className="text-verified">✓</span> Verified — you were
                here.
              </p>
              {/* Straight to the review — the spend question now lives in the
                  composer, asked while you write (not as a gate here). */}
              <p className="mt-1 font-serif text-sm text-ink-soft">
                Now share what you thought — your review will carry a Verified
                badge.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full rounded-md bg-verified px-4 py-2.5 font-serif text-cream hover:opacity-90"
              >
                Write my review →
              </button>
            </div>
          )}

          {phase === "failed" && (
            <div>
              <p className="font-serif text-ink">
                {error ??
                  result?.message ??
                  "We couldn't verify this check-in."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {result?.status !== "REJECTED" && (
                  <button
                    type="button"
                    onClick={start}
                    className="w-full rounded-md bg-accent-700 px-4 py-2.5 font-serif text-cream hover:bg-accent-600"
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-md border border-border px-4 py-2.5 font-serif text-ink-soft hover:text-ink"
                >
                  Post an unverified review instead
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
