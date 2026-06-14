"""LLM client — any OpenAI-compatible chat endpoint (configured for Gemini).

Design rules (§10, §13):
* **Never raises into a request.** Every function returns ``None`` on any
  failure (no key, timeout, quota, bad JSON) and the caller falls through to
  the deterministic path. A network hiccup must be invisible on stage.
* **Short timeouts.** A hung LLM call would freeze the concierge; better to
  answer deterministically in 50 ms than beautifully in never.
* Provider-agnostic: swap Gemini→Groq/OpenAI by changing env vars only.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx

from app.config import settings

log = logging.getLogger("locallens.llm")

_TIMEOUT = 9.0  # seconds — generous for a 70B-class model, still demo-safe


async def _chat(model: str, messages: list[dict], *, json_mode: bool = False,
                max_tokens: int = 600, temperature: float = 0.6,
                timeout: float = _TIMEOUT) -> Optional[str]:
    """One chat-completion call. Returns the text, or None on ANY failure.

    ``timeout`` defaults to the short demo-safe budget; batch jobs (the chain
    harvester) pass a longer one because their batches generate for longer.
    """
    if not settings.online or not settings.llm_api_key:
        return None
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    # Gemini 2.5 models "think" by default and the reasoning tokens count
    # against max_tokens — which silently truncates replies. Disable thinking
    # for these short, factual tasks (Gemini-specific knob; other providers
    # would reject the unknown field, so only send it to Google).
    if "googleapis.com" in settings.llm_base_url:
        body["reasoning_effort"] = "none"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                json=body,
            )
        if resp.status_code != 200:
            log.warning("LLM %s → %s: %s", model, resp.status_code, resp.text[:300])
            return None
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        log.warning("LLM call failed (%s): %s", model, exc)
        return None


_INTENT_PROMPT = """You classify messages for a local-business discovery app.
Return ONLY a JSON object: {"intent": <one of CHEAP_BUDGET, NEARBY_CLOSEST,
HIGHLY_RATED, SPECIFIC_CATEGORY, OPEN_NOW, SUPPORT_LOCAL, EXPLORATORY,
GENERAL_CHAT>, "search_query": <the business type/food to search for, or null>,
"price_direction": <"cheap"|"expensive"|null>}.
GENERAL_CHAT is for greetings/thanks/meta questions only."""

_VALID_INTENTS = {
    "CHEAP_BUDGET", "NEARBY_CLOSEST", "HIGHLY_RATED", "SPECIFIC_CATEGORY",
    "OPEN_NOW", "SUPPORT_LOCAL", "EXPLORATORY", "GENERAL_CHAT",
}


async def classify_intent(message: str) -> Optional[dict]:
    """LLM intent classification → the SAME schema as services/intent.classify,
    so the deterministic classifier is a drop-in fallback. None on failure."""
    raw = await _chat(
        settings.llm_intent_model,
        [{"role": "system", "content": _INTENT_PROMPT},
         {"role": "user", "content": message}],
        json_mode=True, max_tokens=120, temperature=0.0,
    )
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        intent = parsed.get("intent")
        if intent not in _VALID_INTENTS:
            return None
        query = parsed.get("search_query")
        price = parsed.get("price_direction")
        return {
            "intent": intent,
            "search_query": query if isinstance(query, str) and query.lower() != "null" else None,
            "price_direction": price if price in ("cheap", "expensive") else None,
            "confidence": 0.95,
        }
    except (json.JSONDecodeError, AttributeError, TypeError):
        return None


_CLASSIFY_PROMPT = """You audit business listings for LocalLens, an app that ONLY shows small,
independently-owned businesses. You receive a JSON array of businesses;
classify each as "chain" or "small".

"chain" means NOT a small business: corporate chains and franchises
(McDonald's, Starbucks), national or regional corporations, big-box and
department stores, supermarket / pharmacy / convenience-store chains, banks,
hotel brands, gas stations, telecom and shipping stores, and venture-backed
multi-city brands (fast-growing coffee or salad chains with locations across
many cities).

"small" means independently or family-owned. A beloved local business with a
HANDFUL of locations in ONE city or metro area is still small — Joe's Pizza
in NYC, Levain Bakery, a bakery with three storefronts in one town.

Decision rules, applied in order:
1. If you positively recognize the name as a national/regional chain or
   franchise brand, answer "chain".
2. If the evidence shows corporate multi-city operation (a store-locator
   website, a store number in the name, an editorial summary describing
   "locations nationwide"), answer "chain".
3. If it reads as a one-off or single-city operation, answer "small".
4. IF YOU ARE NOT SURE, answer "small". Hiding a real independent business
   is far worse than letting one chain through. Never answer "chain" from
   name style or review volume alone.

Set "confidence" to "high" ONLY when you positively recognize the brand or
the evidence is unambiguous; otherwise "low".

Example input:
[{"id":"a","name":"Sweetgreen","type":"restaurant","reviews":1400,"website":"https://www.sweetgreen.com"},
 {"id":"b","name":"Joe's Pizza","type":"pizza_restaurant","reviews":15200,"address":"7 Carmine St, New York"},
 {"id":"c","name":"Levain Bakery","type":"bakery","reviews":9800,"address":"167 W 74th St, New York"},
 {"id":"d","name":"Blank Street Coffee","type":"coffee_shop","reviews":310},
 {"id":"e","name":"Hilltop Hardware","type":"hardware_store","reviews":48}]
Example output:
{"a":{"verdict":"chain","confidence":"high","reason":"National fast-casual salad chain with locations across the US."},
 "b":{"verdict":"small","confidence":"high","reason":"Iconic independent NYC slice shop; its few locations are all in one city."},
 "c":{"verdict":"small","confidence":"high","reason":"Family-founded NYC bakery with a handful of locations in one city."},
 "d":{"verdict":"chain","confidence":"high","reason":"Venture-backed coffee chain expanding across multiple cities."},
 "e":{"verdict":"small","confidence":"low","reason":"No recognizable brand; reads as a one-off local hardware store."}}

Return ONLY a JSON object mapping every input id to
{"verdict": "chain"|"small", "confidence": "high"|"low",
 "reason": <one short factual sentence>}.
Include every id exactly once. No other keys, no prose, no markdown."""


async def classify_chains(rows: list[dict], model: Optional[str] = None,
                          timeout: float = _TIMEOUT) -> Optional[dict[str, dict]]:
    """Batched chain-vs-small audit of unknown businesses (ONE call per batch).

    Returns {id: {"verdict", "confidence", "reason"}} for the ids the model
    answered, or None on ANY failure — the caller then lets the unknowns pass
    as unverified small businesses (never hide what we can't check, §13).
    ``model``/``timeout`` overrides serve the harvester (flash-lite has its
    own — larger — rate-limit bucket, and big batches generate for longer
    than the live demo budget allows).
    """
    if not rows:
        return {}
    raw = await _chat(
        model or settings.llm_classify_model,
        [{"role": "system", "content": _CLASSIFY_PROMPT},
         {"role": "user", "content": json.dumps(rows)}],
        json_mode=True,
        temperature=0.0,
        # Scale the budget with the batch: ~110 tokens per verdict + headroom
        # (harvest batches carry dozens of unknowns; a too-small budget
        # truncates the JSON mid-object, which reads as a parse failure).
        max_tokens=min(8192, 300 + 110 * len(rows)),
        timeout=timeout,
    )
    if not raw:
        return None
    try:
        # Tolerant parse (some providers fence JSON), then strict validation.
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`").removeprefix("json").strip()
        parsed = json.loads(text)
        verdicts: dict[str, dict] = {}
        for key, value in parsed.items():
            if not isinstance(value, dict) or value.get("verdict") not in ("chain", "small"):
                continue
            verdicts[str(key)] = {
                "verdict": value["verdict"],
                "confidence": "high" if value.get("confidence") == "high" else "low",
                "reason": str(value.get("reason") or "")[:300],
            }
        return verdicts or None
    except (json.JSONDecodeError, AttributeError, TypeError):
        log.warning("Classifier returned unparseable JSON; passing unknowns through.")
        return None


_TRIP_PROMPT = """You narrate a one-day walking itinerary of independent local
businesses. You are given the EXACT ordered stops as JSON. Write a warm,
compact narration: one intro sentence, then one line per stop in order, each
mentioning the arrival time and ONE concrete detail from that stop's data
(rating, category, or walk). Mention ONLY the stops provided — never invent a
place. Under 130 words. No emojis."""


async def generate_trip_narrative(stops: list[dict]) -> Optional[str]:
    """Narrate a planned trip, grounded in its stops. None → caller's template."""
    if not stops:
        return None
    rows = [
        {
            "arrive": s["arrive"], "name": s["name"], "slot": s["slot"],
            "rating": s.get("average_rating"), "reviews": s.get("review_count"),
            "walk_min": s.get("walk_from_prev_min"), "badge": s.get("local_badge"),
        }
        for s in stops
    ]
    return await _chat(
        settings.llm_reply_model,
        [{"role": "system", "content": _TRIP_PROMPT},
         {"role": "user", "content": json.dumps(rows)}],
        max_tokens=400, temperature=0.5,
    )


_SUMMARY_PROMPT = """You summarize customer reviews for a local-business page.
Write EXACTLY two sentences (under 45 words total) capturing what reviewers
consistently love about this place. Mention only things the reviews actually
say — no invention, no superlatives the data doesn't support, no emojis.
Write in third person ("Regulars praise…", "Reviewers love…")."""


async def summarize_reviews(business_name: str, review_bodies: list[str]) -> Optional[str]:
    """“What people love here” — a 2-sentence digest of REAL review text.

    Grounded by construction (only the bodies are provided) and None on any
    failure, so the caller/UI simply hides the block offline (§13).
    """
    joined = "\n".join(f"- {b}" for b in review_bodies[:20])  # cap the context
    return await _chat(
        settings.llm_reply_model,
        [
            {"role": "system", "content": _SUMMARY_PROMPT},
            {"role": "user", "content": f"Business: {business_name}\nReviews:\n{joined}"},
        ],
        max_tokens=120,
        temperature=0.4,
    )


_REPLY_PROMPT = """You are the LocalLens concierge — a warm, knowledgeable local
friend helping people find independent, locally-owned businesses.

HARD RULES:
1. Recommend ONLY businesses from the <businesses> JSON. NEVER invent a name,
   address, rating, or detail. If the list is empty, say so and suggest
   broadening the search.
2. Mention real numbers from the data (rating, distance) when recommending.
3. 2-3 picks max, one short reason each. Under 110 words total. No emojis.
4. Businesses marked verified_local or likely_local are independent — that's
   worth highlighting; it's the point of this app.
5. End with one short follow-up question or offer."""


async def generate_reply(message: str, history: list[dict],
                         businesses: list[dict]) -> Optional[str]:
    """Grounded reply over the ranked businesses. None on failure → caller
    falls back to the deterministic template (which can't hallucinate)."""
    # Only the fields the model needs — small context, nothing inventable.
    rows = [
        {
            "name": b.get("name"), "rating": b.get("average_rating"),
            "reviews": b.get("review_count"), "distance_km": b.get("distance_km"),
            "price_level": b.get("price_level"), "badge": b.get("local_badge"),
            "open_now": b.get("is_open_now"), "categories": b.get("categories"),
        }
        for b in businesses
    ]
    system = _REPLY_PROMPT + f"\n\n<businesses>\n{json.dumps(rows)}\n</businesses>"
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history[-6:]]
    messages.append({"role": "user", "content": message})
    return await _chat(settings.llm_reply_model, messages, max_tokens=600)
