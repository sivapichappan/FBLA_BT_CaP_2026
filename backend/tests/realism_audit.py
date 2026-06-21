"""Trip-planner realism audit harness (one-shot, deterministic, offline).

Runs ~100 trip plans across varied inputs + candidate-pool geographies, scores
each itinerary against a realism checklist, and prints a violation summary with
examples. No network/DB/LLM — search + narration are monkeypatched to canned
pools / None, exactly like test_trip_planner.py.

Run:  cd backend && PYTHONPATH=. .venv/bin/python tests/realism_audit.py
"""
from __future__ import annotations

import itertools
import math
from app.services import trip_planner as tp

# ─────────────────────────── fake candidates / pools ────────────────────────
class _Biz:
    def __init__(self, d): self._d = d
    def model_dump(self): return dict(self._d)

class _Res:
    def __init__(self, rows): self.results = rows

# primary category each chip fetches under (CHIP_SLOTS[chip]["cats"][0])
PRIMARY = {c: v["cats"][0] for c, v in tp.CHIP_SLOTS.items()}
ALL_CHIPS = list(tp.CHIP_SLOTS.keys())

def _at(km, bearing_deg, base=(40.0, -74.0)):
    """A point `km` from base on a bearing (deg) — rough flat-earth offset."""
    dlat = (km / 111.0) * math.cos(math.radians(bearing_deg))
    dlng = (km / (111.0 * math.cos(math.radians(base[0])))) * math.sin(math.radians(bearing_deg))
    return base[0] + dlat, base[1] + dlng

def _pools(geography: str, density: int):
    """Build a pool per primary-category, placing `density` candidates per kind
    at distances/bearings set by `geography` (clustered/mixed/scattered)."""
    ranges = {"clustered": (0.15, 0.6), "mixed": (0.2, 2.2), "scattered": (1.5, 4.0)}
    lo, hi = ranges[geography]
    pools = {}
    for ci, chip in enumerate(ALL_CHIPS):
        rows = []
        for k in range(density):
            frac = 0 if density == 1 else k / (density - 1)
            km = lo + (hi - lo) * frac
            bearing = (ci * 53 + k * 97) % 360            # deterministic spread
            lat, lng = _at(km, bearing)
            rating = 4.0 + ((ci * 3 + k * 7) % 11) / 10.0  # 4.0–5.0 spread
            reviews = 30 + (k * 90)
            rows.append(_Biz({
                "ref": f"{chip[:2]}{ci}{k}", "name": f"{chip} {k}", "lat": lat, "lng": lng,
                "average_rating": round(rating, 1), "review_count": reviews,
                "photo_url": None, "photo_focus_x": 50, "photo_focus_y": 50,
                "local_badge": "verified_local",
            }))
        pools[PRIMARY[chip]] = rows
    return pools

def _wire(pools):
    async def fake_search(params):
        return _Res(pools.get(params.categories[0], []))
    async def fake_none(*a, **k):
        return None
    tp.search_service.search = fake_search
    tp.llm.interpret_trip_goals = fake_none
    tp.llm.generate_trip_narrative = fake_none

# ─────────────────────────── realism scoring ────────────────────────────────
import datetime as _dt

def _hm(s):  # "HH:MM" → minutes
    h, m = s.split(":"); return int(h) * 60 + int(m)

def _fmt(mins):  # minutes-from-midnight → "HH:MM"
    return f"{mins // 60:02d}:{mins % 60:02d}"

def _arr_min(s):  # the planner's "%-I:%M %p" label → minutes-from-midnight
    t = _dt.datetime.strptime(s.strip(), "%I:%M %p")
    return t.hour * 60 + t.minute

# Each "shape" is a window LENGTH (hours after the start) + a stop target — the
# explicit start/end/num_stops replacement for the old duration presets. The
# audit derives an end_time = start + hours (capped) so every start time gets a
# sensible window.
SHAPES = {
    "quick": {"hours": 3, "stops": 3, "walk_cap": 4.0},
    "half":  {"hours": 5, "stops": 4, "walk_cap": 6.0},
    "full":  {"hours": 8, "stops": 6, "walk_cap": 9.0},
}
DAY_CAP_MIN = 22 * 60 + 30          # never run a window past 22:30, whatever the start
MAX_LEG_KM = 1.6
LATE = 21 * 60 + 30                                          # 21:30
MEAL_OK = [(11 * 60, 21 * 60)]   # a meal any time 11am–9pm is fine (no 9am "dinner")

def _end_min(start_min, shape):
    return min(start_min + SHAPES[shape]["hours"] * 60, DAY_CAP_MIN)

def audit_option(opt, shape, start_min, end_min, dense):
    """Score one itinerary using the planner's OWN scheduled arrival times."""
    stops = opt["stops"]
    v = set()
    if not stops:
        return v
    legs, total_walk = [], 0.0
    for s in stops:
        arr = _arr_min(s["arrive"])
        legs.append(s["walk_from_prev_km"]); total_walk += s["walk_from_prev_km"]
        role = s["slot"]
        if role == "eat" and not any(a <= arr <= b for a, b in MEAL_OK):
            v.add("meal_out_of_window")
        if role == "drinks" and arr < 15 * 60:
            v.add("bar_too_early")
        if arr > LATE:
            v.add("arrives_after_2130")
        if arr > end_min:                       # the window cap must be respected
            v.add("arrives_after_window_end")
    if dense and len(stops) < SHAPES[shape]["stops"]:
        v.add("under_filled_in_dense_area")
    if max(legs) > MAX_LEG_KM:
        v.add("walk_leg_over_1p6km")
    if total_walk > SHAPES[shape]["walk_cap"]:
        v.add("total_walk_too_high")
    return v

# ─────────────────────────── scenario grid (~104) ───────────────────────────
SHAPE_KEYS = list(SHAPES)
STARTS = ["08:00", "10:00", "13:00", "18:00"]
INTEREST_SETS = [
    ["Coffee", "Restaurant", "Dessert"],
    ["Retail"],                                              # single-emphasis
    ["Coffee", "Bar"],
    [],                                                      # default (has a meal)
    ["Bookstore", "Coffee", "Retail", "Restaurant", "Dessert", "Bar"],
    ["Restaurant"],                                          # single meal
    ["Coffee", "Retail", "Bookstore"],
    ["Bar"],                                                 # single bar
]
GEO = ["clustered", "mixed", "scattered"]

def run():
    import asyncio
    scenarios = []
    for i, (d, st, ints) in enumerate(itertools.product(SHAPE_KEYS, STARTS, INTEREST_SETS)):
        scenarios.append((d, st, ints, GEO[i % 3], 6, True))  # dense
    # a few sparse scenarios — graceful degradation, NOT counted as bugs
    for i, (d, ints) in enumerate(itertools.product(["half", "full"], INTEREST_SETS[:4])):
        scenarios.append((d, "10:00", ints, "mixed", 1, False))

    tally, examples, n_opts = {}, {}, 0
    by_geo = {g: 0 for g in ("clustered", "mixed", "scattered")}
    opts_geo = {g: 0 for g in by_geo}
    scen_with_any = 0
    for (d, st, ints, geo, dens, dense) in scenarios:
        _wire(_pools(geo, dens))
        smin = _hm(st)
        emin = _end_min(smin, d)
        out = asyncio.run(tp.plan(lat=40.0, lng=-74.0, interests=ints,
                                  start_time=st, end_time=_fmt(emin),
                                  num_stops=SHAPES[d]["stops"]))
        scen_bad = False
        COVERAGE = {"under_filled_in_dense_area"}  # a fewer-stops trade-off, not "unrealistic"
        for opt in out["options"]:
            n_opts += 1
            opts_geo[geo] = opts_geo.get(geo, 0) + 1
            vs = audit_option(opt, d, smin, emin, dense)
            if vs - COVERAGE:
                by_geo[geo] = by_geo.get(geo, 0) + 1
            for x in vs:
                tally[x] = tally.get(x, 0) + 1
                if x not in examples:
                    examples[x] = (d, st, ints, geo, opt["key"], len(opt["stops"]),
                                   round(opt["total_walk_km"], 2),
                                   [(s["arrive"], s["slot"], s["walk_from_prev_km"]) for s in opt["stops"]])
            scen_bad = scen_bad or bool(vs)
        scen_with_any += scen_bad

    print(f"\n===== TRIP-PLANNER REALISM AUDIT =====")
    print(f"scenarios: {len(scenarios)}  | itineraries scored: {n_opts}  | "
          f"scenarios with ≥1 violation: {scen_with_any}\n")
    print(f"{'violation':28} {'count':>6}  {'%opts':>6}")
    for k, c in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"{k:28} {c:>6}  {100*c/n_opts:>5.1f}%")
    print(f"\nitineraries with ≥1 violation, by candidate geography:")
    for g in ("clustered", "mixed", "scattered"):
        print(f"  {g:10} {by_geo[g]:>4} / {opts_geo[g]:<4}  ({100*by_geo[g]/max(opts_geo[g],1):.0f}%)")
    print("\n--- one example per violation ---")
    for k in sorted(tally, key=lambda kv: -tally[kv]):
        d, st, ints, geo, key, nstops, walk, stoplist = examples[k]
        print(f"\n[{k}]  shape={d} start={st} interests={ints} geo={geo} opt={key} "
              f"stops={nstops} walk={walk}km")
        for arr, slot, leg in stoplist:
            print(f"     {arr:>9}  {slot:8}  {leg}km leg")

if __name__ == "__main__":
    run()
