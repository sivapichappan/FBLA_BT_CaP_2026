/**
 * Mobile-only segmented control for the list+map pages (Search, Plan). It lets a
 * phone user flip between the results/itinerary list and a full-width map, since
 * the two can't sit side-by-side on a narrow screen. Hidden at >=lg, where the
 * page shows both columns at once.
 */

export type MapView = "list" | "map";

export function MapListToggle({
  view,
  onChange,
}: {
  view: MapView;
  onChange: (v: MapView) => void;
}) {
  const base =
    "flex-1 rounded-md px-4 py-2.5 font-serif text-sm transition-colors";
  const active = "bg-accent-700 text-cream";
  const idle = "text-ink-soft hover:text-ink";
  return (
    <div
      role="group"
      aria-label="Show list or map"
      className="mb-3 flex gap-1 rounded-lg border border-border bg-surface p-1 lg:hidden"
    >
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-pressed={view === "list"}
        className={`${base} ${view === "list" ? active : idle}`}
      >
        List
      </button>
      <button
        type="button"
        onClick={() => onChange("map")}
        aria-pressed={view === "map"}
        className={`${base} ${view === "map" ? active : idle}`}
      >
        Map
      </button>
    </div>
  );
}
