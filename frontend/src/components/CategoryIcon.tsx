/**
 * Small line icons for the category tiles on the Discover homepage. One simple
 * stroked glyph per chip (no icon library — hand-drawn paths we can defend in
 * Q&A, consistent with the rest of the inline SVGs). Unknown categories fall
 * back to a storefront glyph.
 */

const PATHS: Record<string, string> = {
  // cup + saucer
  Coffee:
    "M4 8h13v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8zm13 1h2a2 2 0 0 1 0 4h-2M5 19h12",
  Cafe: "M4 8h13v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8zm13 1h2a2 2 0 0 1 0 4h-2M5 19h12",
  // croissant / loaf
  Bakery: "M3 15c3-6 15-6 18 0-3 2-15 2-18 0zM7 15l1-4M12 15v-5M17 15l-1-4",
  // fork + knife
  Restaurant:
    "M7 3v8m0 0v10M5 3v5a2 2 0 0 0 2 2M17 3c-1.5 0-2 2-2 4s.5 4 2 4v10",
  Food: "M7 3v8m0 0v10M5 3v5a2 2 0 0 0 2 2M17 3c-1.5 0-2 2-2 4s.5 4 2 4v10",
  // martini
  Bar: "M5 4h14l-7 8-7-8zm7 8v7m-4 0h8",
  // open book
  Bookstore:
    "M12 6c-2-1.5-5-1.5-7 0v12c2-1.5 5-1.5 7 0m0-12c2-1.5 5-1.5 7 0v12c-2-1.5-5-1.5-7 0m0-12v12",
  // basket
  Grocery: "M5 9h14l-1.5 10H6.5L5 9zm3 0 2-5m6 5-2-5M9 13v3m6-3v3",
  // mortar / cross
  Pharmacy: "M12 7v10m-5-5h10M6 4h12v3H6z",
  // tote bag
  Retail: "M6 8h12l1 12H5L6 8zm3 0a3 3 0 0 1 6 0",
  // cupcake
  Dessert: "M6 11h12l-1.5 8h-9L6 11zm0 0a4 4 0 0 1 12 0M12 4v3",
  // scissors
  Barber:
    "M6 6l12 12M6 18L18 6M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  // mirror / comb
  Salon: "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 8v10M5 17h8",
  // dumbbell
  Fitness: "M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10",
  // flower
  Florist:
    "M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0-4v2m0 8v8m-4-7l-2-1m12 1l-2-1M9 9 6 8m12 1l-3 1",
  // gear
  Services:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0-5v2m0 12v2m8-8h-2M6 12H4m12.5-5.5-1.5 1.5m-6 6-1.5 1.5m9 0-1.5-1.5m-6-6L7.5 6.5",
};

const STOREFRONT = "M4 9l1.5-4h13L20 9M4 9h16v11H4V9zm5 11v-6h6v6";

export function CategoryIcon({
  name,
  size = 22,
}: {
  name: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? STOREFRONT} />
    </svg>
  );
}
