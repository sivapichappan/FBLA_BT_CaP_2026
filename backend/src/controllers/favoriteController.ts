import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const addFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.body;
    const userId = req.user?.userId;

    const businessCheck = await query(
      'SELECT id FROM businesses WHERE id = $1',
      [businessId]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const existingFavorite = await query(
      'SELECT id FROM favorites WHERE user_id = $1 AND business_id = $2',
      [userId, businessId]
    );

    if (existingFavorite.rows.length > 0) {
      return res.status(400).json({ error: 'Business already in favorites' });
    }

    await query(
      'INSERT INTO favorites (user_id, business_id) VALUES ($1, $2)',
      [userId, businessId]
    );

    await query(
      `INSERT INTO analytics_events (business_id, event_type, user_id)
       VALUES ($1, 'favorited', $2)`,
      [businessId, userId]
    );

    res.status(201).json({ message: 'Business added to favorites' });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const userId = req.user?.userId;

    const result = await query(
      'DELETE FROM favorites WHERE user_id = $1 AND business_id = $2 RETURNING *',
      [userId, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    res.json({ message: 'Business removed from favorites' });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserFavorites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const result = await query(
      `SELECT
        b.*,
        f.created_at as favorited_at,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as review_count
       FROM favorites f
       JOIN businesses b ON f.business_id = b.id
       LEFT JOIN reviews r ON b.id = r.business_id
       WHERE f.user_id = $1
       GROUP BY b.id, f.created_at
       ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json({ favorites: result.rows });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const checkFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const userId = req.user?.userId;

    const result = await query(
      'SELECT id FROM favorites WHERE user_id = $1 AND business_id = $2',
      [userId, businessId]
    );

    res.json({ isFavorite: result.rows.length > 0 });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
