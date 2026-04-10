import { Response } from 'express';
import crypto from 'crypto';
import OpenAI from 'openai';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import dotenv from 'dotenv';

dotenv.config();

let openaiClient: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

export const chatWithAssistant = async (req: AuthRequest, res: Response) => {
  try {
    const { message, latitude, longitude, sessionToken: incomingToken } = req.body;
    const userId = req.user?.userId || null;

    let nearbyBusinesses: any = { rows: [] };

    if (latitude && longitude) {
      nearbyBusinesses = await query(
        `SELECT
           b.id, b.name, b.slug, b.description, b.price_level,
           b.average_rating, b.review_count,
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
        [latitude, longitude]
      );
    }

    let contextData = '';
    if (nearbyBusinesses.rows.length > 0) {
      contextData = `Here are nearby businesses:\n${nearbyBusinesses.rows
        .map(
          (b: any) =>
            `- ${b.name} (${b.category_names || 'uncategorized'}): ${b.description || 'No description'}, Price: ${
              b.price_level || 'N/A'
            }, Rating: ${parseFloat(b.average_rating || 0).toFixed(1)}/5, Distance: ${parseFloat(
              b.distance_km
            ).toFixed(2)}km`
        )
        .join('\n')}`;
    }

    const systemPrompt = `You are a helpful local business discovery assistant. Help users find businesses based on their needs, preferences, and location. Be conversational and provide specific recommendations.

${contextData}

When answering:
1. Recommend specific businesses from the list above when relevant
2. Consider price level, ratings, and distance
3. Ask clarifying questions if needed
4. Be friendly and conversational`;

    let sessionToken = incomingToken;
    let sessionId: number;

    if (sessionToken) {
      const existing = await query('SELECT id FROM chat_sessions WHERE session_token = $1', [sessionToken]);
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
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, sessionToken, latitude && longitude ? JSON.stringify({ latitude, longitude }) : null]
      );
      sessionId = newSession.rows[0].id;
    }

    await query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
      [sessionId!, message]
    );

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0].message.content || '';
    const recommendedIds = nearbyBusinesses.rows.slice(0, 5).map((b: any) => b.id);

    await query(
      `INSERT INTO chat_messages (session_id, role, content, recommended_business_ids)
       VALUES ($1, 'assistant', $2, $3)`,
      [sessionId!, response, recommendedIds.length > 0 ? JSON.stringify(recommendedIds) : null]
    );

    res.json({
      response,
      sessionToken,
      suggestions: nearbyBusinesses.rows.slice(0, 5).map((b: any) => ({
        id: b.id,
        name: b.name,
        category: b.category_names,
        rating: parseFloat(b.average_rating || 0).toFixed(1),
      })),
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
