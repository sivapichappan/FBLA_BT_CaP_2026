/**
 * Location state for the whole app, three sources with clear precedence:
 *   1. a MANUAL location the user picked (geocoded city/address — persisted),
 *   2. the device's geolocation (if granted),
 *   3. the NYC demo center (always-works fallback, §13).
 * Pages subscribe via useLocation(); changing location anywhere (the
 * LocationControl) re-renders every subscriber through one window event.
 */

import { useEffect, useState } from "react";

/** Greenwich Village — matches the backend's DEMO_LAT/DEMO_LNG defaults. */
export const DEMO_CENTER = { lat: 40.7308, lng: -73.9973 };

/** The seeded demo cities the picker offers. Each has its own cluster of local
 *  businesses in the database, so all three work fully offline like NYC. NYC is
 *  the backend default; the others are manual picks centred on their cluster
 *  (downtown/Southtown San Antonio · the Mission, San Francisco). */
export const DEMO_CITIES = [
  {
    key: "nyc",
    label: "New York, NY",
    lat: DEMO_CENTER.lat,
    lng: DEMO_CENTER.lng,
  },
  { key: "sat", label: "San Antonio, TX", lat: 29.4246, lng: -98.491 },
  { key: "sfo", label: "San Francisco, CA", lat: 37.76, lng: -122.421 },
] as const;
const STORAGE_KEY = "locallens_location";
const EVENT = "locallens-location-changed";

export interface Coords {
  lat: number;
  lng: number;
  /** True when these are real device coordinates. */
  fromDevice: boolean;
  /** Human label for manual picks ("Chicago, IL, USA"). */
  label?: string;
  manual?: boolean;
}

function loadSaved(): Coords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Coords;
    return typeof parsed.lat === "number" && typeof parsed.lng === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

let cached: Coords | null = loadSaved();

function publish(next: Coords, persist: boolean) {
  cached = next;
  try {
    if (persist) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — state still works for this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Pick a geocoded city/address — persists across reloads. */
export function setManualLocation(lat: number, lng: number, label: string) {
  publish({ lat, lng, fromDevice: false, manual: true, label }, true);
}

/** Ask the browser for the real position (clears any manual pick). */
export function useDeviceLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        publish(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            fromDevice: true,
            label: "your location",
          },
          false,
        );
        resolve(true);
      },
      () => resolve(false),
      { timeout: 6000, maximumAge: 300000 },
    );
  });
}

/** Back to the NYC demo center. */
export function resetToDemo() {
  publish({ ...DEMO_CENTER, fromDevice: false }, false);
}

export function useLocation(): Coords {
  const [coords, setCoords] = useState<Coords>(
    cached ?? { ...DEMO_CENTER, fromDevice: false },
  );

  useEffect(() => {
    const onChange = () =>
      setCoords(cached ?? { ...DEMO_CENTER, fromDevice: false });
    window.addEventListener(EVENT, onChange);

    // First mount with no saved pick: try the device once, silently.
    if (!cached && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          publish(
            {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              fromDevice: true,
              label: "your location",
            },
            false,
          ),
        () => publish({ ...DEMO_CENTER, fromDevice: false }, false),
        { timeout: 5000, maximumAge: 300000 },
      );
    }
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  return coords;
}
