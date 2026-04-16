import { Response } from 'express';
import crypto from 'crypto';
import Groq from 'groq-sdk';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { classifyIntent, ClassifiedIntent } from '../utils/intentClassifier';
import { rankBusinesses, RankedBusiness } from '../utils/aiBusinessRanker';
import * as googlePlaces from '../services/googlePlaces';
import { filterAndScoreBusinesses } from '../utils/localBusinessScorer';
import dotenv from 'dotenv';

dotenv.config();

let groqClient: Groq | null = null;
const getGroq = (): Groq => {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
};

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are LocalDiscover, a friendly neighborhood concierge who helps people find great independent, locally-owned businesses in their area. You speak like a knowledgeable local friend — warm, enthusiastic about the community, and genuinely interested in connecting people with the right spot.

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

Want me to find more options, or are you looking for a specific vibe?"`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildBusinessContext(businesses: RankedBusiness[]): string {
  const top = businesses.slice(0, 10);
  if (top.length === 0) return '';

  const entries = top.map((b, i) => ({
    name: b.name,
    category: b.category_name,
    distance_km: b.distance_km,
    rating: b.average_rating,
    review_count: b.review_count,
    price_level: b.price_level,
    independence_score: b.independence_score,
    local_badge: b.local_badge,
    is_open: b.is_open_now,
    description: b.editorial_summary || b.description || null,
    relevance_score: b.composite_score,
    score_rank: i + 1,
  }));

  return `\n\n<business_data>\n${JSON.stringify(entries, null, 2)}\n</business_data>`;
}

async function loadConversationHistory(
  sessionId: number,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const result = await query(
    `SELECT role, content FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at DESC LIMIT 10`,
    [sessionId],
  );
  return result.rows.reverse().map((r: any) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));
}

async function fetchBusinesses(
  groq: Groq,
  intent: ClassifiedIntent,
  latitude: number,
  longitude: number,
): Promise<RankedBusiness[]> {
  try {
    let places: any[];

    if (intent.search_query) {
      places = await googlePlaces.searchText(intent.search_query, latitude, longitude, 5000);
    } else {
      places = await googlePlaces.searchNearbyDiverse(latitude, longitude, 2000);
    }

    const formatted = places.map(googlePlaces.formatPlace);
    const scored = filterAndScoreBusinesses(formatted);
    return rankBusinesses(scored, latitude, longitude, intent);
  } catch (error) {
    console.error('Google Places fetch failed, falling back to local DB:', error);
    return fetchLocalBusinesses(latitude, longitude, intent);
  }
}

async function fetchLocalBusinesses(
  latitude: number,
  longitude: number,
  intent: ClassifiedIntent,
): Promise<RankedBusiness[]> {
  const result = await query(
    `SELECT
       b.id, b.name, b.slug, b.description, b.price_level,
       b.average_rating, b.review_count, b.latitude, b.longitude,
       (
         6371 * acos(
           cos(radians($1)) * cos(radians(b.latitude)) *
           cos(radians(b.longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(b.latitude))
         )
       ) AS distance_km,
       (
         SELECT string_agg(c.name, ', ')
         FROM business_categories bc
         JOIN categories c ON bc.category_id = c.id
         WHERE bc.business_id = b.id
       ) AS category_names
     FROM businesses b
     WHERE b.is_active = true
       AND (
         6371 * acos(
           cos(radians($1)) * cos(radians(b.latitude)) *
           cos(radians(b.longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(b.latitude))
         )
       ) <= 10
     ORDER BY distance_km
     LIMIT 20`,
    [latitude, longitude],
  );

  return result.rows.map((b: any) => ({
    id: b.id,
    name: b.name,
    description: b.description || null,
    editorial_summary: null,
    address_line_1: '',
    city: '',
    state: '',
    latitude: b.latitude,
    longitude: b.longitude,
    average_rating: parseFloat(b.average_rating) || 0,
    review_count: b.review_count || 0,
    price_level: b.price_level || null,
    primary_type: null,
    primary_type_display_name: null,
    category_name: b.category_names || 'Business',
    is_open_now: null,
    independence_score: null,
    customer_facing_score: null,
    local_badge: null,
    photo_url: null,
    source: 'local',
    distance_km: Math.round(parseFloat(b.distance_km) * 100) / 100,
    composite_score: 0,
  }));
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export const chatWithAssistant = async (req: AuthRequest, res: Response) => {
  try {
    const { message, latitude, longitude, sessionToken: incomingToken } = req.body;
    const userId = req.user?.userId || null;
    const groq = getGroq();

    // ── Session management ──────────────────────────────────────────────

    let sessionToken = incomingToken;
    let sessionId: number;

    if (sessionToken) {
      const existing = await query(
        'SELECT id FROM chat_sessions WHERE session_token = $1',
        [sessionToken],
      );
      if (existing.rows.length > 0) {
        sessionId = existing.rows[0].id;
        await query('UPDATE chat_sessions SET last_activity = NOW() WHERE id = $1', [sessionId]);
      } else {
        sessionToken = null;
      }
    }

    if (!sessionToken) {
      sessionToken = crypto.randomBytes(16).toString('hex');
      const newSession = await query(
        `INSERT INTO chat_sessions (user_id, session_token, context)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId, sessionToken, latitude && longitude ? JSON.stringify({ latitude, longitude }) : null],
      );
      sessionId = newSession.rows[0].id;
    }

    // ── Store user message ──────────────────────────────────────────────

    await query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
      [sessionId!, message],
    );

    // ── Load conversation history for multi-turn ────────────────────────

    const history = await loadConversationHistory(sessionId!);

    // ── Stage 1: Intent Classification ──────────────────────────────────

    const recentUserMessages = history
      .filter(m => m.role === 'user')
      .slice(-2)
      .map(m => m.content)
      .join(' | ');

    const intent = await classifyIntent(groq, message, recentUserMessages || undefined);

    // ── Fetch & rank businesses ─────────────────────────────────────────

    let rankedBusinesses: RankedBusiness[] = [];

    if (intent.intent !== 'GENERAL_CHAT' && latitude && longitude) {
      rankedBusinesses = await fetchBusinesses(groq, intent, latitude, longitude);
    }

    // ── Build context & prompt ──────────────────────────────────────────

    const businessContext = buildBusinessContext(rankedBusinesses);
    const systemPrompt = SYSTEM_PROMPT + businessContext;

    // Build messages array: system + history + current message
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8), // last 8 messages for context (keep token budget reasonable)
      { role: 'user', content: message },
    ];

    // ── Stage 2: Response Generation ────────────────────────────────────

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.6,
      max_tokens: 600,
    });

    const response = completion.choices[0].message.content || '';

    // ── Store assistant response ────────────────────────────────────────

    const recommendedIds = rankedBusinesses.slice(0, 5).map(b => b.id);
    await query(
      `INSERT INTO chat_messages (session_id, role, content, recommended_business_ids)
       VALUES ($1, 'assistant', $2, $3)`,
      [sessionId!, response, recommendedIds.length > 0 ? JSON.stringify(recommendedIds) : null],
    );

    // ── Return response ─────────────────────────────────────────────────

    res.json({
      response,
      sessionToken,
      suggestions: rankedBusinesses.slice(0, 5).map(b => ({
        id: b.id,
        name: b.name,
        category: b.category_name,
        rating: b.average_rating.toFixed(1),
        review_count: b.review_count,
        price_level: b.price_level,
        distance_km: b.distance_km.toFixed(1),
        is_open_now: b.is_open_now,
        local_badge: b.local_badge,
        photo_url: b.photo_url,
      })),
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
