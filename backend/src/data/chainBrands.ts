// ~500 major chain brand names, normalized to lowercase.
// Used for O(1) dictionary lookup in the local business scorer.
// Sources: OSM Name Suggestion Index categories, SBA Franchise Directory, public knowledge.

const FAST_FOOD = [
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
  "smoothie king", "waba grill", "noodles & company", "pei wei",
];

const COFFEE = [
  "starbucks", "dunkin'", "dunkin donuts", "peet's coffee", "peet's",
  "tim hortons", "caribou coffee", "the coffee bean & tea leaf", "dutch bros",
  "dutch bros coffee", "scooter's coffee", "biggby coffee", "black rifle coffee",
  "philz coffee", "blue bottle coffee", "intelligentsia", "gregorys coffee",
];

const RETAIL = [
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
];

const GAS_STATIONS = [
  "shell", "bp", "exxon", "exxonmobil", "mobil", "chevron", "texaco",
  "citgo", "sunoco", "marathon", "phillips 66", "conoco", "valero",
  "speedway", "quiktrip", "qt", "racetrac", "raceway", "murphy usa",
  "casey's", "casey's general store", "pilot", "pilot flying j",
  "love's", "love's travel stop", "ta travel center", "petro",
  "cumberland farms", "kwik trip", "maverik", "kum & go",
  "bucee's", "buc-ee's",
];

const PHARMACY = [
  "cvs", "cvs pharmacy", "walgreens", "rite aid",
  "cvs health", "duane reade", "kinney drugs",
];

const BANKING = [
  "chase", "jpmorgan chase", "bank of america", "wells fargo",
  "citibank", "citi", "us bank", "u.s. bank", "pnc bank", "pnc",
  "truist", "td bank", "td", "capital one", "citizens bank",
  "fifth third bank", "regions bank", "m&t bank", "huntington bank",
  "keybank", "bmo", "bmo harris", "santander", "hsbc",
  "charles schwab", "fidelity", "edward jones", "merrill lynch",
  "morgan stanley", "goldman sachs", "ameriprise",
];

const FITNESS = [
  "planet fitness", "la fitness", "anytime fitness", "24 hour fitness",
  "gold's gym", "crunch fitness", "crunch", "equinox", "lifetime fitness",
  "life time", "orangetheory", "orangetheory fitness", "f45 training",
  "snap fitness", "youfit", "club fitness", "retro fitness",
  "blink fitness", "barry's", "soulcycle", "pure barre",
  "crossfit", "burn boot camp",
];

const HOTELS = [
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
];

const GROCERY = [
  "kroger", "safeway", "albertsons", "publix", "h-e-b", "heb",
  "whole foods", "whole foods market", "trader joe's", "aldi",
  "lidl", "food lion", "giant", "giant food", "giant eagle",
  "stop & shop", "shoprite", "wegmans", "meijer",
  "winn-dixie", "bi-lo", "piggly wiggly", "save-a-lot",
  "food city", "harris teeter", "sprouts", "sprouts farmers market",
  "natural grocers", "fresh market", "the fresh market",
  "market basket", "stater bros", "vons", "ralphs",
  "fred meyer", "king soopers", "fry's food", "smith's",
];

const CONVENIENCE = [
  "7-eleven", "7 eleven", "circle k", "wawa", "sheetz",
  "quiktrip", "qt", "royal farms", "rutters", "rutter's",
  "kwik trip", "thorntons", "stripes", "kum & go",
  "ampm", "am pm", "allsup's", "loaf 'n jug",
  "plaid pantry", "kangaroo express", "gate",
];

const RESTAURANT_CHAINS = [
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
  "jason's deli", "mcalister's deli", "bob evans",
  "sweetgreen", "cava", "chipotle", "mod pizza", "blaze pizza",
  "nando's", "wingstop", "buffalo wild wings",
];

const AUTO = [
  "autozone", "o'reilly auto parts", "o'reilly", "advance auto parts",
  "napa auto parts", "napa", "jiffy lube", "valvoline",
  "valvoline instant oil change", "midas", "firestone",
  "firestone complete auto care", "goodyear", "pep boys",
  "maaco", "meineke", "take 5 oil change", "caliber collision",
  "safelite", "batteries plus", "discount tire", "les schwab",
  "tire kingdom", "ntb", "national tire",
  "enterprise rent-a-car", "enterprise", "hertz", "avis", "budget",
  "u-haul", "penske",
];

const CLOTHING_MISC = [
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
];

// Combine all arrays and normalize
const ALL_CHAINS: string[] = [
  ...FAST_FOOD, ...COFFEE, ...RETAIL, ...GAS_STATIONS,
  ...PHARMACY, ...BANKING, ...FITNESS, ...HOTELS,
  ...GROCERY, ...CONVENIENCE, ...RESTAURANT_CHAINS,
  ...AUTO, ...CLOTHING_MISC,
];

export const CHAIN_BRANDS: Set<string> = new Set(
  ALL_CHAINS.map(name => name.toLowerCase().trim())
);

/**
 * Normalize a business name for chain matching.
 * Strips store numbers, trademark symbols, location suffixes, and extra whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[®™©]/g, '')                    // trademark symbols
    .replace(/#\s*\d+/g, '')                   // store numbers (#1234)
    .replace(/\bstore\s*\d+/gi, '')            // "Store 1234"
    .replace(/\bno\.?\s*\d+/gi, '')            // "No. 42"
    .replace(/\s*-\s*(downtown|midtown|uptown|north|south|east|west|central|main st|drive|plaza|square|village|center|mall|airport|station).*$/i, '')
    .replace(/\s*\(.*\)$/, '')                 // trailing parenthetical
    .replace(/\s+/g, ' ')                      // collapse whitespace
    .trim();
}

/**
 * Check if a business name matches a known chain brand.
 * Returns the matched brand name or null.
 */
export function matchChain(name: string): string | null {
  const normalized = normalizeName(name);

  // Exact match
  if (CHAIN_BRANDS.has(normalized)) return normalized;

  // Try without trailing "'s" (handles "McDonald's" → "mcdonald's")
  // Already in the set, but catch variants like "Mcdonalds" without apostrophe
  const noApostrophe = normalized.replace(/'s\b/g, 's').replace(/[']/g, '');
  if (CHAIN_BRANDS.has(noApostrophe)) return noApostrophe;

  // Try matching first N words (catches "Starbucks Coffee" → "starbucks")
  const words = normalized.split(' ');
  for (let i = Math.min(words.length, 3); i >= 1; i--) {
    const partial = words.slice(0, i).join(' ');
    if (CHAIN_BRANDS.has(partial)) return partial;
  }

  return null;
}
