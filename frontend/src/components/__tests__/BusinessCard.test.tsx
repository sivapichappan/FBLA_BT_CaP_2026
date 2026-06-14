/**
 * BusinessCard unit tests (§16): the one renderer shared by search results,
 * favorites, and concierge suggestions — so a regression here breaks three
 * surfaces at once. Covers: core fields, the rank number used by the map
 * hover-sync, the badge, and the photo→monogram fallback path (§13).
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Business } from "../../types";
import { BusinessCard } from "../BusinessCard";

/** A realistic local business; tests override single fields as needed. */
const BIZ: Business = {
  ref: "12",
  source: "local",
  name: "Caffè Reggio",
  lat: 40.7299,
  lng: -74.0003,
  address: "119 MacDougal St",
  phone: null,
  website: null,
  price_level: 2,
  categories: ["Coffee", "Cafe", "Dessert", "Bakery"],
  average_rating: 4.5,
  review_count: 120,
  is_independent: true,
  local_confidence: 0.9,
  local_badge: "verified_local",
  is_open_now: true,
  distance_km: 0.4,
  photo_url: null,
  editorial_summary: null,
};

/** The card is a <Link>, so it needs a router around it. The future flags
 *  opt into v7 behavior now, which silences router deprecation warnings. */
function renderCard(props: Partial<Parameters<typeof BusinessCard>[0]> = {}) {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <BusinessCard business={BIZ} {...props} />
    </MemoryRouter>,
  );
}

describe("BusinessCard", () => {
  it("renders the name, rating, review count, and distance", () => {
    renderCard();
    expect(screen.getByText("Caffè Reggio")).toBeTruthy();
    expect(screen.getByText("4.5 (120)")).toBeTruthy();
    expect(screen.getByText("0.4 km away")).toBeTruthy();
    // Stars are exposed to screen readers as one labeled image.
    expect(
      screen.getByRole("img", { name: "4.5 out of 5 stars" }),
    ).toBeTruthy();
  });

  it("links to the business detail page by ref", () => {
    renderCard();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/business/12");
  });

  it("shows the rank number that matches the numbered map pin", () => {
    renderCard({ rank: 3 });
    expect(screen.getByText("3.")).toBeTruthy();
  });

  it("shows the verified-local badge and caps categories at three", () => {
    renderCard();
    expect(screen.getByText("Verified local")).toBeTruthy();
    expect(screen.getByText("Coffee")).toBeTruthy();
    expect(screen.getByText("Dessert")).toBeTruthy();
    // The 4th category is sliced off to keep the card scannable.
    expect(screen.queryByText("Bakery")).toBeNull();
  });

  it("renders the monogram tile (no <img>) when there is no photo", () => {
    renderCard();
    expect(screen.queryByRole("img", { name: "" })).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    // The fallback shows the business's first letter as a monogram.
    expect(screen.getByText("C")).toBeTruthy();
  });

  it("renders an <img> with the backend-proxied src when a photo exists", () => {
    renderCard({
      business: { ...BIZ, photo_url: "/businesses/photo?name=places%2Fx" },
    });
    const img = document.querySelector("img");
    expect(img).toBeTruthy();
    // Relative proxy paths get the API base prefixed (key stays server-side).
    expect(img!.getAttribute("src")).toBe(
      "http://localhost:8000/businesses/photo?name=places%2Fx",
    );
  });

  it("hides rating UI entirely for businesses with zero reviews", () => {
    renderCard({ business: { ...BIZ, review_count: 0, average_rating: 0 } });
    expect(screen.queryByText(/out of 5 stars/)).toBeNull();
  });

  it("applies the smart-crop focal point as object-position", () => {
    renderCard({
      business: {
        ...BIZ,
        photo_url: "/businesses/photo?name=x",
        photo_focus_x: 37,
        photo_focus_y: 62,
      },
    });
    const img = document.querySelector("img")!;
    expect(img.style.objectPosition).toBe("37% 62%");
  });

  it("defaults to a center crop when no focal point is stored", () => {
    renderCard({
      business: { ...BIZ, photo_url: "/businesses/photo?name=x" },
    });
    const img = document.querySelector("img")!;
    expect(img.style.objectPosition).toBe("50% 50%");
  });
});
