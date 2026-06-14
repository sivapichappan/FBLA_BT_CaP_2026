"""Deterministic intent classifier — the concierge's always-available brain.

Classifies a chat message into one of 8 intents using keyword/regex rules and
extracts a search query + price direction. In Phase 2 an LLM classifier is
layered on top; it returns the SAME schema, so the concierge can fall from LLM
to this classifier with zero downstream changes (BUILD_SPEC §10).

Output schema (stable contract):
    {"intent": <one of INTENTS>, "search_query": str|None,
     "price_direction": "cheap"|"expensive"|None, "confidence": float}
"""

from __future__ import annotations

import re

INTENTS = {
    "CHEAP_BUDGET", "NEARBY_CLOSEST", "HIGHLY_RATED", "SPECIFIC_CATEGORY",
    "OPEN_NOW", "SUPPORT_LOCAL", "EXPLORATORY", "GENERAL_CHAT",
}

# Ordered (pattern, intent) rules — FIRST match wins, so more specific intents
# (open-now, budget) are listed before broad ones (exploratory).
_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(open (now|late|right now)|still open|24.?hour|tonight)\b", re.I), "OPEN_NOW"),
    (re.compile(r"\b(cheap|budget|affordable|inexpensive|deal|student|broke|under \$?\d+)\b", re.I), "CHEAP_BUDGET"),
    (re.compile(r"\b(closest|nearest|near(by| me)?|walking distance|around here|close by)\b", re.I), "NEARBY_CLOSEST"),
    (re.compile(r"\b(best|top.?rated|highest.?rated|amazing|great(est)?|favorite|most popular)\b", re.I), "HIGHLY_RATED"),
    (re.compile(r"\b(local|independent|indie|small business|family.?(owned|run)|non.?chain|support)\b", re.I), "SUPPORT_LOCAL"),
    (re.compile(r"\b(hi|hello|hey|thanks|thank you|who are you|what can you do|help)\b", re.I), "GENERAL_CHAT"),
]

# Business nouns that signal a category search (also used to extract the query).
_CATEGORY_WORDS = re.compile(
    r"\b(coffee|cafe|espresso|pizza|bagel|bakery|brunch|breakfast|lunch|dinner|"
    r"restaurant|food|ramen|sushi|tacos?|burgers?|sandwich|dessert|ice cream|"
    r"books?(store|shop)?|grocery|cheese|spice|pharmacy|flowers?|florist|"
    r"barber|haircut|salon|gym|fitness|yoga|bar|pub|wine|beer)\b",
    re.I,
)

_PRICE_CHEAP = re.compile(r"\b(cheap|budget|affordable|inexpensive|broke|student)\b", re.I)
_PRICE_FANCY = re.compile(r"\b(fancy|upscale|nice|splurge|expensive|date night|treat)\b", re.I)

# Filler stripped when deriving a search query from the raw message.
_STOPWORDS = re.compile(
    r"\b(find|me|a|an|the|some|good|best|cheap|nearby|near|place|places|for|to|"
    r"get|eat|grab|want|i|need|looking|show|spots?|whats|what's|around|here|"
    r"open|now|that|is|are|and|or|in|of|with)\b",
    re.I,
)


def _extract_query(message: str) -> str | None:
    """Pull the searchable noun out of the message ('find me cheap ramen' → 'ramen')."""
    nouns = _CATEGORY_WORDS.findall(message)
    if nouns:
        # findall returns tuple groups when the pattern has groups; normalize.
        first = nouns[0] if isinstance(nouns[0], str) else nouns[0][0]
        return first.lower()
    # No known noun — strip filler and keep what remains, if anything meaningful.
    cleaned = _STOPWORDS.sub(" ", message)
    cleaned = re.sub(r"[^A-Za-z0-9 ]", " ", cleaned)
    cleaned = " ".join(cleaned.split())
    return cleaned.lower() or None


def classify(message: str) -> dict:
    """Classify a message (see module docstring for the schema)."""
    text = (message or "").strip()
    if not text:
        return {"intent": "GENERAL_CHAT", "search_query": None, "price_direction": None, "confidence": 1.0}

    intent = None
    for pattern, name in _RULES:
        if pattern.search(text):
            intent = name
            break

    has_category = bool(_CATEGORY_WORDS.search(text))
    if intent is None:
        # A bare category word ('ramen?') is a category search; otherwise browse.
        intent = "SPECIFIC_CATEGORY" if has_category else "EXPLORATORY"
    elif intent == "GENERAL_CHAT" and has_category:
        # 'hi, any good pizza?' — the category outranks the greeting.
        intent = "SPECIFIC_CATEGORY"

    price = "cheap" if _PRICE_CHEAP.search(text) else ("expensive" if _PRICE_FANCY.search(text) else None)
    query = None if intent == "GENERAL_CHAT" else _extract_query(text)

    # Rule hits are precise; pure fallbacks are a guess — reflect that honestly.
    confidence = 0.9 if intent not in ("EXPLORATORY",) else 0.5
    return {"intent": intent, "search_query": query, "price_direction": price, "confidence": confidence}
