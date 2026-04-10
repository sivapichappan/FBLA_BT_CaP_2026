import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const addFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, collectionName, notes } = req.body;
    const userId = req.user!.userId;

    const businessCheck = await query('SELECT id FROM businesses WHERE id = $1', [businessId]);
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

    const result = await query(
      `INSERT INTO favorites (user_id, business_id, collection_name, notes)
       VALUES ($1, $2, COALESCE($3, 'Favorites'), $4)
       RETURNING *`,
      [userId, businessId, collectionName || null, notes || null]
    );

    res.status(201).json({ message: 'Business added to favorites', favorite: result.rows[0] });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId, 10);
    if (!Number.isInteger(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }
    const userId = req.user!.userId;

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
    const userId = req.user!.userId;

    const result = await query(
      `SELECT
         b.*,
         f.created_at AS favorited_at,
         f.collection_name,
         f.notes
       FROM favorites f
       JOIN businesses b ON f.business_id = b.id
       WHERE f.user_id = $1
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
    const businessId = parseInt(req.params.businessId, 10);
    if (!Number.isInteger(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }
    const userId = req.user!.userId;

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
