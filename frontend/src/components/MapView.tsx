/**
 * Google Map with custom numbered pins, badge-colored by independence, and
 * bidirectional hover sync with the result cards (§14 signature interaction):
 * hovering a card enlarges its pin; hovering a pin highlights its card.
 *
 * Resilience (§13): if the Maps key is missing or the script fails, we render
 * a calm placeholder panel — never a crash or a gray void.
 */

import {
  AdvancedMarker,
  APIProvider,
  ColorScheme,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { useTheme } from "../lib/theme";
import type { Business } from "../types";

const MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

interface Props {
  businesses: Business[];
  center: { lat: number; lng: number };
  hoveredRef: string | null;
  onHover: (ref: string | null) => void;
  onSelect: (ref: string) => void;
  /** Initial zoom. Search uses the default (neighborhood); a single-business
   *  detail map passes a tighter value so the one pin isn't lost. */
  zoom?: number;
  /** Accessible label for the map region (defaults to the search context). */
  ariaLabel?: string;
}

/**
 * The map mounts UNCONTROLLED (defaultCenter) so users can pan/zoom freely —
 * but that means a changed `center` prop is ignored after creation. This
 * child watches the prop and pans the live map instance to it, so picking a
 * new city in the LocationControl (or re-planning a trip) moves the map too.
 */
function PanToCenter({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map?.panTo(center);
  }, [map, center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Pin color: forest for verified locals, soft green for likely, gray
 *  otherwise — all design tokens, so pins re-tint with the theme. */
function pinColor(b: Business): string {
  if (b.local_badge === "verified_local") return "var(--verified)";
  if (b.local_badge === "likely_local") return "var(--likely)";
  return "var(--chain)";
}

export function MapView({
  businesses,
  center,
  hoveredRef,
  onHover,
  onSelect,
  zoom = 14,
  ariaLabel = "Map of search results",
}: Props) {
  const theme = useTheme();

  if (!MAPS_KEY) {
    return (
      <div className="flex h-full min-h-[20rem] items-center justify-center rounded-lg border border-border bg-surface p-6 text-center">
        <p className="font-serif text-ink-soft">
          Map unavailable — results are listed on the left.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={MAPS_KEY}>
      <Map
        // DEMO_MAP_ID enables AdvancedMarker (custom DOM pins) without a styled map id.
        mapId="DEMO_MAP_ID"
        // colorScheme only applies at map creation, so key the element by
        // theme: toggling dark mode remounts the map in the matching scheme.
        key={theme}
        colorScheme={theme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT}
        defaultCenter={center}
        defaultZoom={zoom}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        className="h-full min-h-[20rem] w-full rounded-lg border border-border"
        aria-label={ariaLabel}
      >
        <PanToCenter center={center} />
        {businesses.map((b, i) => {
          const hovered = hoveredRef === b.ref;
          return (
            <AdvancedMarker
              key={b.ref}
              position={{ lat: b.lat, lng: b.lng }}
              zIndex={hovered ? 1000 : i}
              title={b.name}
              onClick={() => onSelect(b.ref)}
              onMouseEnter={() => onHover(b.ref)}
              onMouseLeave={() => onHover(null)}
            >
              {/* Custom numbered pin; scales up when its card is hovered. */}
              <div
                className="flex items-center justify-center rounded-full font-mono font-bold text-cream shadow-warm transition-transform duration-150"
                style={{
                  width: hovered ? 34 : 26,
                  height: hovered ? 34 : 26,
                  fontSize: hovered ? 14 : 12,
                  backgroundColor: pinColor(b),
                  border: "2px solid var(--surface)",
                  transform: hovered ? "translateY(-2px)" : undefined,
                }}
              >
                {/* Numbered in a list of results; an unlabeled location pin
                    when it's a single business (the detail-page map). */}
                {businesses.length > 1 ? i + 1 : null}
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>
    </APIProvider>
  );
}
