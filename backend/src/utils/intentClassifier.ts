import Groq from 'groq-sdk';

export type IntentType =
  | 'CHEAP_BUDGET'
  | 'NEARBY_CLOSEST'
  | 'HIGHLY_RATED'
  | 'SPECIFIC_CATEGORY'
  | 'OPEN_NOW'
  | 'SUPPORT_LOCAL'
  | 'EXPLORATORY'
  | 'GENERAL_CHAT';

export interface ClassifiedIntent {
  intent: IntentType;
  search_query: string | null;
  price_direction: 'cheap' | 'expensive' | null;
  confidence: number;
}

const VALID_INTENTS: Set<string> = new Set([
  'CHEAP_BUDGET', 'NEARBY_CLOSEST', 'HIGHLY_RATED', 'SPECIFIC_CATEGORY',
  'OPEN_NOW', 'SUPPORT_LOCAL', 'EXPLORATORY', 'GENERAL_CHAT',
]);

const CLASSIFIER_PROMPT = `You are an intent classifier for a local business discovery app. Analyze the user's message and classify it into exactly ONE intent category and extract relevant entities.

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
- Extract price direction: "cheap"/"budget"/"affordable" → "cheap", "fancy"/"upscale"/"expensive" → "expensive", otherwise null.

Respond with ONLY this JSON, no other text:
{"intent": "<INTENT>", "search_query": "<extracted search term or null>", "price_direction": "cheap"|"expensive"|null, "confidence": <0.0-1.0>}`;

const DEFAULT_INTENT: ClassifiedIntent = {
  intent: 'EXPLORATORY',
  search_query: null,
  price_direction: null,
  confidence: 0,
};

export async function classifyIntent(
  groq: Groq,
  userMessage: string,
  recentContext?: string,
): Promise<ClassifiedIntent> {
  try {
    const userContent = recentContext
      ? `Recent conversation context: ${recentContext}\n\nCurrent message: ${userMessage}`
      : userMessage;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: CLASSIFIER_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' },
      stream: false,
    });

    const raw = completion.choices[0]?.message?.content || '';
    const parsed = JSON.parse(raw);

    const intent = VALID_INTENTS.has(parsed.intent) ? parsed.intent as IntentType : 'EXPLORATORY';
    const search_query = typeof parsed.search_query === 'string' && parsed.search_query !== 'null'
      ? parsed.search_query
      : null;
    const price_direction = parsed.price_direction === 'cheap' || parsed.price_direction === 'expensive'
      ? parsed.price_direction
      : null;
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

    return { intent, search_query, price_direction, confidence };
  } catch (error) {
    console.error('Intent classification failed, defaulting to EXPLORATORY:', error);
    return { ...DEFAULT_INTENT, search_query: userMessage };
  }
}
