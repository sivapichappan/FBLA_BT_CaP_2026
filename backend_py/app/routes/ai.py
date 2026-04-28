import os
import secrets
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from groq import Groq

from app.config.database import query
from app.middleware.auth import get_current_user
from app.utils.intent_classifier import classify_intent
from app.utils.ai_business_ranker import rank_businesses
from app.services import google_places
from app.utils.local_business_scorer import filter_and_score_businesses

router = APIRouter(prefix="/api/ai", tags=["ai"])

_groq_client = None


def _get_groq():
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _groq_client


SYSTEM_PROMPT = """You are LocalDiscover, a friendly neighborhood concierge who helps people find great independent, locally-owned businesses in their area. You speak like a knowledgeable local friend — warm, enthusiastic about the community, and genuinely interested in connecting people with the right spot.

## YOUR TASK
Help users discover local, independent, customer-facing businesses based on their needs, preferences, and location. Present recommendations conversationally — like sharing your favorite spots with a friend, not listing search results.

## CRITICAL RULES
1. ONLY recommend businesses from the <business_data> provided to you. NEVER invent or fabricate business names, addresses, ratings, hours, reviews, or any other details.
2. If no businesses match the user's request, say so honestly. Suggest broadening their criteria or offer the closest alternatives from the data.
3. When you don't have specific information (like real-time availability or menu items not in the data), say "I don't have that information in my current data" rather than guessing.
4. Reference specific data when recommending: mention actual ratings, distances, and price levels.
5. Stay focused on local business discovery. Politely redirect off-topic questions: "I'm best at finding local businesses — is there a type of shop, restaurant, or service I can help you find?"

## CONVERSATION STYLE
- Present recommendations editorially. Use phrases like "I'd check out…", "Locals love…", "If you're in the mood for…, you can't go wrong with…"
- Show genuine enthusiasm for places with strong reviews or unique qualities — but never exaggerate beyond the data.
- Use 1-2 contextual emojis per message (☕ 📍 🍽 ⭐) for warmth. Never use 🔥💡🎯 or more than 2 emojis per message.
- Keep responses concise for mobile: 2-3 options with specific reasons, 60-80 words for a single recommendation, 120-180 words for comparisons.
- Ask ONE clarifying question at a time if the request is vague. Don't overwhelm with multiple questions.
- Remember preferences the user mentions across the conversation and apply them without asking the user to repeat themselves.

## WHEN RECOMMENDING
- Present 2-3 options with a specific reason each is a good fit.
- For each business, mention: what makes it special, its rating, distance, and price level.
- End with an invitation: offer to narrow down, explore more options, or provide details.
- When a business has few reviews, note it: "They're newer with just a handful of reviews, but early feedback is promising."
- Businesses marked as "verified_local" or "likely_local" are independent — you can highlight this naturally.

## BUSINESS DATA FORMAT
Business data will be provided in <business_data> tags as a JSON array. Each object contains: name, category, distance_km, rating, review_count, price_level (1-4), independence_score (0-1), local_badge, is_open, description, and relevance_score. Base ALL recommendations solely on this data.

## EXAMPLE
User: "Know any good brunch places?"
Assistant: "I've got a couple great ones! I'd start with Sunrise Kitchen over in the Arts District — they've got a 4.7 with 89 reviews, and it's just 0.4 miles away. ☕ They're independently owned and won't break the bank at $$.

If you want something quieter, Maplewood Café is about 0.8 miles out with a 4.4 — it's a bit more intimate, family-owned for 15 years.

Want me to find more options, or are you looking for a specific vibe?\""""


def _build_business_context(businesses: list[dict]) -> str:
    top = businesses[:10]
    if not top:
        return ""
    entries = [
        {
            "name": b["name"], "category": b.get("category_name", ""),
            "distance_km": b.get("distance_km", 0), "rating": b.get("average_rating", 0),
            "review_count": b.get("review_count", 0), "price_level": b.get("price_level"),
            "independence_score": b.get("independence_score"), "local_badge": b.get("local_badge"),
            "is_open": b.get("is_open_now"), "description": b.get("editorial_summary") or b.get("description"),
            "relevance_score": b.get("composite_score", 0), "score_rank": i + 1,
        }
        for i, b in enumerate(top)
    ]
    return f"\n\n<business_data>\n{json.dumps(entries, indent=2)}\n</business_data>"


async def _fetch_businesses(groq_client, intent: dict, lat: float, lng: float) -> list[dict]:
    try:
        if intent.get("search_query"):
            places = await google_places.search_text(intent["search_query"], lat, lng, 5000)
        else:
            places = await google_places.search_nearby_diverse(lat, lng, 2000)

        formatted = [google_places.format_place(p) for p in places]
        scored = filter_and_score_businesses(formatted)
        return rank_businesses(scored, lat, lng, intent)
    except Exception as e:
        print(f"Google Places fetch failed, falling back to local DB: {e}")
        return _fetch_local_businesses(lat, lng)


def _fetch_local_businesses(lat: float, lng: float) -> list[dict]:
    result = query(
        """SELECT b.id, b.name, b.slug, b.description, b.price_level,
                  b.average_rating, b.review_count, b.latitude, b.longitude,
                  (6371 * acos(cos(radians($1)) * cos(radians(b.latitude)) *
                   cos(radians(b.longitude) - radians($2)) +
                   sin(radians($1)) * sin(radians(b.latitude)))) AS distance_km,
                  (SELECT string_agg(c.name, ', ') FROM business_categories bc
                   JOIN categories c ON bc.category_id = c.id WHERE bc.business_id = b.id) AS category_names
           FROM businesses b WHERE b.is_active = true
             AND (6371 * acos(cos(radians($1)) * cos(radians(b.latitude)) *
              cos(radians(b.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(b.latitude)))) <= 10
           ORDER BY distance_km LIMIT 20""",
        [lat, lng],
    )
    return [
        {
            "id": r["id"], "name": r["name"], "description": r.get("description"),
            "editorial_summary": None, "address_line_1": "", "city": "", "state": "",
            "latitude": r["latitude"], "longitude": r["longitude"],
            "average_rating": float(r.get("average_rating") or 0),
            "review_count": r.get("review_count", 0), "price_level": r.get("price_level"),
            "primary_type": None, "primary_type_display_name": None,
            "category_name": r.get("category_names", "Business"),
            "is_open_now": None, "independence_score": None, "customer_facing_score": None,
            "local_badge": None, "photo_url": None, "source": "local",
            "distance_km": round(float(r["distance_km"]), 2), "composite_score": 0,
        }
        for r in result["rows"]
    ]


@router.post("/chat")
async def chat_with_assistant(request: Request, user: dict = Depends(get_current_user)):
    try:
        body = await request.json()
        message = body.get("message", "")
        latitude = body.get("latitude")
        longitude = body.get("longitude")
        incoming_token = body.get("sessionToken")
        user_id = user["userId"]
        groq = _get_groq()

        # Session management
        session_token = incoming_token
        session_id = None

        if session_token:
            # Atomic lookup-and-touch — RETURNING confirms the row still exists.
            # If the session was deleted (e.g. cascade from a removed user, or DB reset),
            # rows is empty and we fall through to creating a new one.
            touched = query(
                "UPDATE chat_sessions SET last_activity = NOW() WHERE session_token = $1 RETURNING id",
                [session_token],
            )
            if touched["rows"]:
                session_id = touched["rows"][0]["id"]
            else:
                session_token = None

        if not session_token:
            session_token = secrets.token_hex(16)
            context_json = json.dumps({"latitude": latitude, "longitude": longitude}) if latitude and longitude else None
            new_session = query(
                "INSERT INTO chat_sessions (user_id, session_token, context) VALUES ($1, $2, $3) RETURNING id",
                [user_id, session_token, context_json],
            )
            session_id = new_session["rows"][0]["id"]

        # Store user message
        query("INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)", [session_id, message])

        # Load conversation history
        history_result = query(
            "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10",
            [session_id],
        )
        history = [{"role": r["role"], "content": r["content"]} for r in reversed(history_result["rows"])]

        # Stage 1: Intent classification
        recent_user_msgs = " | ".join(m["content"] for m in history if m["role"] == "user")[-200:]
        intent = classify_intent(groq, message, recent_user_msgs or None)

        # Fetch & rank businesses
        ranked = []
        if intent["intent"] != "GENERAL_CHAT" and latitude and longitude:
            ranked = await _fetch_businesses(groq, intent, latitude, longitude)

        # Build context
        biz_context = _build_business_context(ranked)
        system_prompt = SYSTEM_PROMPT + biz_context

        messages = [
            {"role": "system", "content": system_prompt},
            *history[-8:],
            {"role": "user", "content": message},
        ]

        # Stage 2: Response generation
        completion = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.6,
            max_tokens=600,
        )

        response_text = completion.choices[0].message.content or ""

        # Store response
        rec_ids = [b["id"] for b in ranked[:5]]
        query(
            "INSERT INTO chat_messages (session_id, role, content, recommended_business_ids) VALUES ($1, 'assistant', $2, $3)",
            [session_id, response_text, json.dumps(rec_ids) if rec_ids else None],
        )

        return {
            "response": response_text,
            "sessionToken": session_token,
            "suggestions": [
                {
                    "id": b["id"], "name": b["name"], "category": b.get("category_name", ""),
                    "rating": f"{b.get('average_rating', 0):.1f}",
                    "review_count": b.get("review_count", 0),
                    "price_level": b.get("price_level"),
                    "distance_km": f"{b.get('distance_km', 0):.1f}",
                    "is_open_now": b.get("is_open_now"),
                    "local_badge": b.get("local_badge"),
                    "photo_url": b.get("photo_url"),
                }
                for b in ranked[:5]
            ],
        }
    except Exception as e:
        print(f"AI chat error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
