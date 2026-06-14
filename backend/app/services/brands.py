"""Known chain-brand list + fuzzy matcher — the chain registry's seed data.

~800 US chain brands grouped by sector. Matching is multi-pass:
  1. normalize  — strip ®™, store numbers (#4271), location suffixes
                  ("- Downtown"), parentheticals, extra whitespace;
  2. exact      — hash lookup of the normalized name;
  3. possessive — "McDonald's" → "mcdonalds" and retry;
  4. prefix     — try the first 3, 2, then 1 words, so "Panera Bread Bakery"
                  still hits "panera".

Ambiguity guard: some brands are common English words ("Shell", "Target",
"Gap", "Apple"). For those, a *prefix* match is NOT enough — "Shell Beach
Seafood" must not be flagged — so they only match when the normalized name
equals the brand exactly.
"""

from __future__ import annotations

import re

FAST_FOOD = [
    "mcdonald's", "burger king", "wendy's", "subway", "taco bell", "chick-fil-a",
    "kfc", "popeyes", "sonic drive-in", "sonic", "jack in the box", "whataburger",
    "arby's", "carl's jr", "hardee's", "five guys", "in-n-out burger", "in-n-out",
    "shake shack", "checkers", "rally's", "wingstop", "raising cane's", "zaxby's",
    "culver's", "del taco", "church's chicken", "el pollo loco", "panda express",
    "chipotle", "chipotle mexican grill", "qdoba", "moe's southwest grill",
    "jimmy john's", "jersey mike's", "firehouse subs", "potbelly", "quiznos",
    "blaze pizza", "little caesars", "domino's", "pizza hut", "papa john's",
    "papa murphy's", "marco's pizza", "hungry howie's", "jet's pizza",
    "white castle", "steak 'n shake", "cook out", "bojangles", "captain d's",
    "long john silver's", "dairy queen", "dq", "baskin-robbins", "cold stone creamery",
    "auntie anne's", "cinnabon", "jamba", "jamba juice", "tropical smoothie cafe",
    "smoothie king", "waba grill", "noodles & company", "pei wei", "halal guys",
    "the halal guys",
]

COFFEE = [
    "starbucks", "dunkin'", "dunkin", "dunkin donuts", "peet's coffee", "peet's",
    "tim hortons", "caribou coffee", "the coffee bean & tea leaf", "dutch bros",
    "dutch bros coffee", "scooter's coffee", "biggby coffee", "black rifle coffee",
    "philz coffee", "blue bottle coffee", "intelligentsia", "gregorys coffee",
    "pret a manger", "le pain quotidien", "paris baguette", "tous les jours",
]

RETAIL = [
    "walmart", "target", "costco", "sam's club", "bj's wholesale club",
    "home depot", "the home depot", "lowe's", "menards", "ace hardware",
    "best buy", "staples", "office depot", "officemax",
    "bed bath & beyond", "pier 1", "crate & barrel", "pottery barn",
    "restoration hardware", "rh", "williams-sonoma", "west elm",
    "ikea", "big lots", "five below", "dollar tree", "dollar general",
    "family dollar", "99 cents only", "tuesday morning",
    "michaels", "hobby lobby", "joann", "jo-ann fabrics",
    "petco", "petsmart", "pet supplies plus",
    "bath & body works", "yankee candle", "hallmark",
    "gamestop", "barnes & noble", "books-a-million",
    "dick's sporting goods", "academy sports", "rei", "bass pro shops", "cabela's",
    "tractor supply", "tractor supply co",
    "apple store", "apple", "microsoft store", "tesla",
]

GAS_STATIONS = [
    "shell", "bp", "exxon", "exxonmobil", "mobil", "chevron", "texaco",
    "citgo", "sunoco", "marathon", "phillips 66", "conoco", "valero",
    "speedway", "quiktrip", "qt", "racetrac", "raceway", "murphy usa",
    "casey's", "casey's general store", "pilot", "pilot flying j",
    "love's", "love's travel stop", "ta travel center", "petro",
    "cumberland farms", "kwik trip", "maverik", "kum & go",
    "bucee's", "buc-ee's",
]

PHARMACY = [
    "cvs", "cvs pharmacy", "walgreens", "rite aid",
    "cvs health", "duane reade", "kinney drugs",
]

BANKING = [
    "chase", "chase bank", "jpmorgan chase", "bank of america", "wells fargo",
    "citibank", "citi", "us bank", "u.s. bank", "pnc bank", "pnc",
    "truist", "td bank", "td", "capital one", "citizens bank",
    "fifth third bank", "regions bank", "m&t bank", "huntington bank",
    "keybank", "bmo", "bmo harris", "santander", "hsbc",
    "charles schwab", "fidelity", "edward jones", "merrill lynch",
    "morgan stanley", "goldman sachs", "ameriprise",
]

FITNESS = [
    "planet fitness", "la fitness", "anytime fitness", "24 hour fitness",
    "gold's gym", "crunch fitness", "crunch", "equinox", "lifetime fitness",
    "life time", "orangetheory", "orangetheory fitness", "f45 training",
    "snap fitness", "youfit", "club fitness", "retro fitness",
    "blink fitness", "barry's", "soulcycle", "pure barre",
    "crossfit", "burn boot camp",
]

HOTELS = [
    "marriott", "hilton", "hyatt", "ihg", "wyndham", "choice hotels",
    "best western", "holiday inn", "holiday inn express", "hampton inn",
    "hampton by hilton", "courtyard by marriott", "courtyard",
    "fairfield inn", "fairfield by marriott", "residence inn",
    "springhill suites", "towneplace suites", "embassy suites",
    "doubletree", "homewood suites", "hilton garden inn",
    "hyatt place", "hyatt house", "hyatt regency",
    "sheraton", "westin", "w hotel", "le meridien", "aloft",
    "four points", "comfort inn", "comfort suites", "quality inn",
    "sleep inn", "clarion", "econo lodge", "rodeway inn",
    "days inn", "super 8", "motel 6", "la quinta", "red roof inn",
    "extended stay america", "wingate", "baymont", "microtel",
    "candlewood suites", "staybridge suites", "home2 suites",
    "tru by hilton", "ac hotels", "moxy hotels",
]

GROCERY = [
    "kroger", "safeway", "albertsons", "publix", "h-e-b", "heb",
    "whole foods", "whole foods market", "trader joe's", "aldi",
    "lidl", "food lion", "giant", "giant food", "giant eagle",
    "stop & shop", "shoprite", "wegmans", "meijer",
    "winn-dixie", "bi-lo", "piggly wiggly", "save-a-lot",
    "food city", "harris teeter", "sprouts", "sprouts farmers market",
    "natural grocers", "fresh market", "the fresh market",
    "market basket", "stater bros", "vons", "ralphs",
    "fred meyer", "king soopers", "fry's food", "smith's",
    "key food", "gristedes", "westside market", "fairway market",
    "morton williams", "d'agostino", "c-town", "associated supermarket",
]

CONVENIENCE = [
    "7-eleven", "7 eleven", "circle k", "wawa", "sheetz",
    "quiktrip", "qt", "royal farms", "rutters", "rutter's",
    "kwik trip", "thorntons", "stripes", "kum & go",
    "ampm", "am pm", "allsup's", "loaf 'n jug",
    "plaid pantry", "kangaroo express", "gate",
]

RESTAURANT_CHAINS = [
    "applebee's", "olive garden", "chili's", "red lobster",
    "outback steakhouse", "longhorn steakhouse", "texas roadhouse",
    "cracker barrel", "denny's", "ihop", "perkins",
    "bob evans", "waffle house", "golden corral",
    "the cheesecake factory", "cheesecake factory", "p.f. chang's",
    "red robin", "ruby tuesday", "tgi friday's", "tgi fridays",
    "buffalo wild wings", "hooters", "twin peaks",
    "cheddar's scratch kitchen", "bonefish grill", "carrabbas",
    "carrabba's italian grill", "yard house", "bj's restaurant",
    "dave & buster's", "topgolf", "main event",
    "benihana", "the melting pot", "ruth's chris",
    "morton's", "fleming's", "capital grille", "the capital grille",
    "panera bread", "panera", "au bon pain", "corner bakery",
    "jason's deli", "mcalister's deli",
    "sweetgreen", "cava", "mod pizza", "dig", "dig inn",
    "nando's", "chopt", "just salad", "xi'an famous foods",
]

AUTO = [
    "autozone", "o'reilly auto parts", "o'reilly", "advance auto parts",
    "napa auto parts", "napa", "jiffy lube", "valvoline",
    "valvoline instant oil change", "midas", "firestone",
    "firestone complete auto care", "goodyear", "pep boys",
    "maaco", "meineke", "take 5 oil change", "caliber collision",
    "safelite", "batteries plus", "discount tire", "les schwab",
    "tire kingdom", "ntb", "national tire",
    "enterprise rent-a-car", "enterprise", "hertz", "avis", "budget",
    "u-haul", "penske",
]

CLOTHING_MISC = [
    "h&m", "zara", "uniqlo", "forever 21", "gap", "old navy",
    "banana republic", "j.crew", "express", "american eagle",
    "aeropostale", "abercrombie & fitch", "hollister",
    "victoria's secret", "pink", "lululemon", "athleta",
    "nike", "adidas", "foot locker", "finish line", "champs sports",
    "burlington", "ross", "ross dress for less", "tj maxx", "t.j. maxx",
    "marshalls", "homegoods", "nordstrom rack", "saks off 5th",
    "levi's", "guess", "coach", "kate spade", "michael kors",
    "sephora", "ulta", "ulta beauty", "mac cosmetics",
    "supercuts", "great clips", "sport clips", "fantastic sams",
    "massage envy", "european wax center", "hand & stone",
    "verizon", "at&t", "t-mobile", "sprint", "boost mobile",
    "cricket wireless", "metro by t-mobile",
    "fedex", "ups", "ups store", "the ups store",
    "h&r block", "liberty tax", "jackson hewitt",
    "kumon", "mathnasium", "sylvan learning",
    "servpro", "servicemaster", "stanley steemer",
]

CHAIN_BRANDS: set[str] = {
    name.lower().strip()
    for names in [
        FAST_FOOD, COFFEE, RETAIL, GAS_STATIONS, PHARMACY, BANKING, FITNESS,
        HOTELS, GROCERY, CONVENIENCE, RESTAURANT_CHAINS, AUTO, CLOTHING_MISC,
    ]
    for name in names
}

# Brands that are everyday English words. A prefix hit on these is too weak
# ("Shell Beach Seafood" ≠ Shell) — they require an EXACT normalized match.
AMBIGUOUS_BRANDS: set[str] = {
    "shell", "target", "gap", "apple", "express", "pink", "guess", "coach",
    "giant", "marathon", "pilot", "petro", "gate", "stripes", "crunch",
    "budget", "enterprise", "sonic", "checkers", "subway", "chase", "citi",
    "td", "rh", "qt", "dq", "sprint", "ross", "courtyard",
}


def normalize_name(name: str) -> str:
    """Lowercase + strip decorations a storefront listing adds to a brand name."""
    result = name.lower()
    result = re.sub(r"[®™©]", "", result)
    result = re.sub(r"#\s*\d+", "", result)                      # "Starbucks #4271"
    result = re.sub(r"\bstore\s*\d+", "", result)                 # "Store 12"
    result = re.sub(r"\bno\.?\s*\d+", "", result)                 # "No. 5"
    result = re.sub(                                              # "- Downtown", "- Airport"
        r"\s*[-–]\s*(downtown|midtown|uptown|north|south|east|west|central|"
        r"main st|drive|plaza|square|village|center|mall|airport|station).*$",
        "", result,
    )
    result = re.sub(r"\s*\(.*\)$", "", result)                    # trailing "(24h)"
    return re.sub(r"\s+", " ", result).strip()


def match_against(name: str, brand_set: set[str], *, fuzzy: bool = True) -> str | None:
    """Multi-pass match of a storefront name against an arbitrary brand set.

    Passes: exact normalized → apostrophe-collapsed → (fuzzy only) word-prefix,
    longest first, guarded by AMBIGUOUS_BRANDS. `fuzzy=False` is used for
    LLM-learned registry names: those are single observations, so they may
    only ever match the exact same name — never swallow look-alikes.
    """
    normalized = normalize_name(name)

    if normalized in brand_set:
        return normalized

    # "McDonald's" → "mcdonalds"
    no_apostrophe = re.sub(r"'s\b", "s", normalized).replace("'", "")
    if no_apostrophe in brand_set:
        return no_apostrophe

    if fuzzy:
        # Prefix passes: longest first so "the home depot" wins over "the".
        words = normalized.split(" ")
        for i in range(min(len(words), 3), 0, -1):
            partial = " ".join(words[:i])
            if partial in brand_set and partial not in AMBIGUOUS_BRANDS:
                return partial

    return None


def match_chain(name: str) -> str | None:
    """Return the matched canonical brand from the curated list, or None."""
    return match_against(name, CHAIN_BRANDS)
