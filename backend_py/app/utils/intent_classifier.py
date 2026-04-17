import json
from groq import Groq

VALID_INTENTS = {
    "CHEAP_BUDGET", "NEARBY_CLOSEST", "HIGHLY_RATED", "SPECIFIC_CATEGORY",
    "OPEN_NOW", "SUPPORT_LOCAL", "EXPLORATORY", "GENERAL_CHAT",
}

CLASSIFIER_PROMPT = """You are an intent classifier for a local business discovery app. Analyze the user's message and classify it into exactly ONE intent category and extract relevant entities.

INTENT CATEGORIES:
- CHEAP_BUDGET: User wants affordable/cheap/budget-friendly options. E.g. "cheap eats", "budget friendly lunch"
- NEARBY_CLOSEST: User prioritizes proximity, wants the closest option. E.g. "closest coffee shop", "nearest pizza"
- HIGHLY_RATED: User wants top-rated/best options. E.g. "best sushi", "top rated salon", "highest reviewed"
- SPECIFIC_CATEGORY: User asks for a specific type of business. E.g. "Italian restaurant", "pet store", "bookshop"
- OPEN_NOW: User needs something open right now, urgency implied. E.g. "what's open", "open late", "24 hour"
- SUPPORT_LOCAL: User explicitly wants independent/local/small businesses. E.g. "local shops", "non-chain", "independent"
- EXPLORATORY: User is browsing, exploring, or has a vague query. E.g. "what's around here", "things to do", "any suggestions"
- GENERAL_CHAT: Greeting, thanks, follow-up question about a previously mentioned business, or non-business query. E.g. "hi", "thanks", "tell me more about that one", "what's the weather"

RULES:
- Choose the STRONGEST intent. If multiple apply, pick the dominant one.
- Extract the business category/type if mentioned as search_query (e.g. "restaurant", "cafe", "hardware store", "Italian food").
- For follow-up questions like "tell me more" or "what about that place", use GENERAL_CHAT.
- Extract price direction: "cheap"/"budget"/"affordable" -> "cheap", "fancy"/"upscale"/"expensive" -> "expensive", otherwise null.

Respond with ONLY this JSON, no other text:
{"intent": "<INTENT>", "search_query": "<extracted search term or null>", "price_direction": "cheap"|"expensive"|null, "confidence": <0.0-1.0>}"""

DEFAULT_INTENT = {
    "intent": "EXPLORATORY",
    "search_query": None,
    "price_direction": None,
    "confidence": 0,
}


def classify_intent(client: Groq, user_message: str, recent_context: str | None = None) -> dict:
    try:
        content = f"Recent conversation context: {recent_context}\n\nCurrent message: {user_message}" if recent_context else user_message

        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": CLASSIFIER_PROMPT},
                {"role": "user", "content": content},
            ],
            temperature=0,
            max_tokens=100,
            response_format={"type": "json_object"},
            stream=False,
        )

        raw = completion.choices[0].message.content or ""
        parsed = json.loads(raw)

        intent = parsed.get("intent", "EXPLORATORY")
        if intent not in VALID_INTENTS:
            intent = "EXPLORATORY"

        search_query = parsed.get("search_query")
        if search_query == "null" or not isinstance(search_query, str):
            search_query = None

        price_dir = parsed.get("price_direction")
        if price_dir not in ("cheap", "expensive"):
            price_dir = None

        confidence = parsed.get("confidence", 0.5)
        if not isinstance(confidence, (int, float)):
            confidence = 0.5
        confidence = max(0.0, min(1.0, float(confidence)))

        return {"intent": intent, "search_query": search_query, "price_direction": price_dir, "confidence": confidence}
    except Exception as e:
        print(f"Intent classification failed: {e}")
        return {**DEFAULT_INTENT, "search_query": user_message}
