import { Response } from 'express';
import OpenAI from 'openai';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const chatWithAssistant = async (req: AuthRequest, res: Response) => {
  try {
    const { message, latitude, longitude } = req.body;

    let contextData = '';

    if (latitude && longitude) {
      const nearbyBusinesses = await query(
        `SELECT
          b.name,
          b.category,
          b.description,
          b.price_range,
          b.hours_of_operation,
          COALESCE(AVG(r.rating), 0) as avg_rating,
          (
            6371 * acos(
              cos(radians($1)) * cos(radians(b.latitude)) *
              cos(radians(b.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(b.latitude))
            )
          ) as distance_km
         FROM businesses b
         LEFT JOIN reviews r ON b.id = r.business_id
         WHERE (
           6371 * acos(
             cos(radians($1)) * cos(radians(b.latitude)) *
             cos(radians(b.longitude) - radians($2)) +
             sin(radians($1)) * sin(radians(b.latitude))
           )
         ) <= 10
         GROUP BY b.id
         ORDER BY distance_km
         LIMIT 20`,
        [latitude, longitude]
      );

      if (nearbyBusinesses.rows.length > 0) {
        contextData = `Here are nearby businesses:\n${nearbyBusinesses.rows
          .map(
            (b) =>
              `- ${b.name} (${b.category}): ${b.description || 'No description'}, Price: ${
                b.price_range || 'N/A'
              }, Rating: ${parseFloat(b.avg_rating).toFixed(1)}/5, Distance: ${parseFloat(
                b.distance_km
              ).toFixed(2)}km`
          )
          .join('\n')}`;
      }
    }

    const systemPrompt = `You are a helpful local business discovery assistant. Help users find businesses based on their needs, preferences, and location. Be conversational and provide specific recommendations.

${contextData}

When answering:
1. Recommend specific businesses from the list above when relevant
2. Consider price range, ratings, and distance
3. Ask clarifying questions if needed
4. Be friendly and conversational
5. If the user asks about hours, mention them if available`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0].message.content;

    res.json({
      response,
      suggestions: nearbyBusinesses?.rows.slice(0, 5).map((b) => ({
        name: b.name,
        category: b.category,
        rating: parseFloat(b.avg_rating).toFixed(1),
      })),
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
