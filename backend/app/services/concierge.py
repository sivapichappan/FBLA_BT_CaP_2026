"""The AI concierge — three stages, online-first with deterministic fallback (§10).

    1. INTENT    — LLM classifier (Gemini); falls back to the keyword classifier.
    2. FETCH+RANK — always deterministic: search candidates, then the 8-factor
                    intent-weighted composite ranker (§9.3). The LLM never
                    chooses WHICH businesses to recommend — ranking is ours,
                    inspectable, and identical online or offline.
    3. REPLY     — LLM writes the prose, grounded in (and only in) the ranked
                    rows; falls back to a template populated from the same rows.

Every fallback is silent. The response carries ``mode`` ("llm" or
"deterministic") so the UI/demo can show resilience working live.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from app.config import settings
from app.models.business import SearchParams
from app.repositories import chat as chat_repo
from app.services import intent as intent_clf
from app.services import llm, ranker, search_service

# Intent → hard search FILTERS only. Ordering is no longer decided here —
# the composite ranker (§9.3) re-weights its 8 factors per intent instead.
_INTENT_FILTERS: dict[str, dict[str, Any]] = {
    "CHEAP_BUDGET":      {"price_levels": [1, 2]},
    "OPEN_NOW":          {"open_now": True},
    # SUPPORT_LOCAL needs no filter — every search is independent-only by
    # pipeline; the ranker's ×4 independence multiplier still shapes the order.
}

# Reply openers per intent — friendly, specific, no hype.
_OPENERS = {
    "CHEAP_BUDGET": "Here are some wallet-friendly picks near you:",
    "NEARBY_CLOSEST": "These are the closest spots to you:",
    "HIGHLY_RATED": "The best-rated places nearby:",
    "SPECIFIC_CATEGORY": "Here's what I found nearby:",
    "OPEN_NOW": "Open right now near you:",
    "SUPPORT_LOCAL": "Great independent, local spots near you:",
    "EXPLORATORY": "A few neighborhood ideas to explore:",
}

_GENERAL_REPLY = (
    "Hi! I'm the LocalLens concierge. Ask me things like “cheap lunch near me”, "
    "“best coffee that's open now”, or “independent bookstores nearby” — "
    "I'll pull real local businesses and rank them for you."
)

_EMPTY_REPLY = (
    "I couldn't find a match for that nearby. Try widening the search — "
    "for example “coffee”, “bakery”, or “bookstore” — or ask for what's open now."
)


_MD_BOLD = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")        # **x** / __x__  → x
_MD_BULLET = re.compile(r"^[ \t]*[*\-+][ \t]+", re.M)    # leading "* "/"- " → "• "


def _strip_markdown(text: str) -> str:
    """Flatten the model's stray Markdown to plain text — the concierge is a
    chat bubble, not a Markdown view, so raw '**' must never reach the user. We
    instruct the model to write plain text (prompt rule 6); this is the belt-and-
    suspenders so a slip never shows asterisks."""
    text = _MD_BOLD.sub(lambda m: m.group(1) or m.group(2), text)
    text = _MD_BULLET.sub("• ", text)
    return text


def _describe(b: dict[str, Any]) -> str:
    """One human line per pick: name, rating, distance, price, independence."""
    bits = [f"{b['name']}"]
    if b.get("review_count"):
        bits.append(f"{b['average_rating']:.1f}★ ({b['review_count']} reviews)")
    if b.get("distance_km") is not None:
        bits.append(f"{b['distance_km']} km away")
    if b.get("price_level"):
        bits.append("$" * int(b["price_level"]))
    if b.get("local_badge") == "verified_local":
        bits.append("verified local")
    return " — ".join(bits)


def _templated_reply(intent: dict, businesses: list[dict]) -> str:
    """Deterministic prose from the ranked rows — grounded by construction."""
    if not businesses:
        return _EMPTY_REPLY
    opener = _OPENERS.get(intent["intent"], _OPENERS["EXPLORATORY"])
    lines = [f"{i + 1}. {_describe(b)}" for i, b in enumerate(businesses)]
    return "\n".join([opener, *lines, "Want more options, or details on one of these?"])


async def chat(user: dict, message: str, session_id: Optional[int],
               lat: Optional[float], lng: Optional[float]) -> dict:
    """Handle one concierge turn; returns reply + cards + session id + mode."""
    # 0) Session: resume the user's session or start a new one; log the message.
    session = chat_repo.get_session(session_id, user["id"]) if session_id else None
    sid = session["id"] if session else chat_repo.create_session(user["id"])
    chat_repo.add_message(sid, "user", message)
    mode = "deterministic"

    # 1) INTENT — try the LLM, fall back to the keyword classifier (same schema).
    intent = await llm.classify_intent(message)
    if intent is not None:
        mode = "llm"
    else:
        intent = intent_clf.classify(message)

    # 2) FETCH + RANK — always deterministic and inspectable.
    businesses: list[dict] = []
    if intent["intent"] != "GENERAL_CHAT":
        params = SearchParams(
            q=intent.get("search_query"),
            lat=lat if lat is not None else settings.demo_lat,
            lng=lng if lng is not None else settings.demo_lng,
            radius_m=5000,
            **_INTENT_FILTERS.get(intent["intent"], {}),
        )
        result = await search_service.search(params)
        candidates = [b.model_dump() for b in result.results]
        # Intent-weighted composite (§9.3): OPEN_NOW ×5 open, SUPPORT_LOCAL ×4
        # independence, etc. The top 3 become the recommendation set.
        businesses = ranker.rank_businesses(candidates, intent)[:3]

    # 3) REPLY — LLM prose grounded in the ranked rows, else the template.
    if intent["intent"] == "GENERAL_CHAT":
        reply = (await llm.generate_reply(message, chat_repo.recent_messages(sid), [])
                 if mode == "llm" else None) or _GENERAL_REPLY
    else:
        llm_reply = await llm.generate_reply(message, chat_repo.recent_messages(sid), businesses)
        if llm_reply:
            reply, mode = llm_reply, "llm"
        else:
            reply = _templated_reply(intent, businesses)
            mode = "deterministic"

    # 4) Persist the assistant turn and respond. Strip any stray Markdown so the
    #    chat bubble never shows raw '**' / bullet asterisks.
    reply = _strip_markdown(reply)
    chat_repo.add_message(sid, "assistant", reply)
    return {"reply": reply, "businesses": businesses, "session_id": sid,
            "intent": intent, "mode": mode}
