import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import * as googlePlaces from '../services/googlePlaces';

export const addFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      businessId,         // local DB integer ID (optional)
      googlePlaceId,      // Google Place ID string (optional)
      placeName,          // cached display data
      placeAddress,
      placeRating,
      placePhotoUrl,
      placeType,
      collectionName,
      notes,
    } = req.body;

    if (!businessId && !googlePlaceId) {
      return res.status(400).json({ error: 'Either businessId or googlePlaceId is required' });
    }

    // Check for duplicate
    if (googlePlaceId) {
      const existing = await query(
        'SELECT id FROM favorites WHERE user_id = $1 AND google_place_id = $2',
        [userId, googlePlaceId]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Already in favorites' });
      }
    } else {
      const existing = await query(
        'SELECT id FROM favorites WHERE user_id = $1 AND business_id = $2',
        [userId, businessId]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Already in favorites' });
      }
    }

    const result = await query(
      `INSERT INTO favorites (
         user_id, business_id, google_place_id,
         place_name, place_address, place_rating, place_photo_url, place_type,
         collection_name, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'Favorites'), $10)
       RETURNING *`,
      [
        userId,
        businessId || null,
        googlePlaceId || null,
        placeName || null,
        placeAddress || null,
        placeRating || null,
        placePhotoUrl || null,
        placeType || null,
        collectionName || null,
        notes || null,
      ]
    );

    res.status(201).json({ message: 'Added to favorites', favorite: result.rows[0] });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id: rawId } = req.params;

    let result;
    if (rawId.startsWith('gp_')) {
      const googlePlaceId = rawId.slice(3);
      result = await query(
        'DELETE FROM favorites WHERE user_id = $1 AND google_place_id = $2 RETURNING *',
        [userId, googlePlaceId]
      );
    } else {
      const businessId = parseInt(rawId, 10);
      if (!Number.isInteger(businessId)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }
      result = await query(
        'DELETE FROM favorites WHERE user_id = $1 AND business_id = $2 RETURNING *',
        [userId, businessId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    res.json({ message: 'Removed from favorites' });
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
         f.id, f.user_id, f.business_id, f.google_place_id,
         f.place_name, f.place_address, f.place_rating, f.place_photo_url, f.place_type,
         f.collection_name, f.notes, f.created_at,
         b.name AS local_name, b.address_line_1 AS local_address,
         b.average_rating AS local_rating, b.slug AS local_slug
       FROM favorites f
       LEFT JOIN businesses b ON f.business_id = b.id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );

    const favorites = result.rows.map(f => ({
      id: f.google_place_id ? `gp_${f.google_place_id}` : f.business_id,
      name: f.place_name || f.local_name || 'Unknown',
      address_line_1: f.place_address || f.local_address || '',
      average_rating: f.place_rating || f.local_rating || 0,
      photo_url: f.place_photo_url || null,
      primary_type_display_name: f.place_type || null,
      source: f.google_place_id ? 'google_places' : 'local',
      favorited_at: f.created_at,
      collection_name: f.collection_name,
      notes: f.notes,
    }));

    res.json({ favorites });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const checkFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id: rawId } = req.params;

    let result;
    if (rawId.startsWith('gp_')) {
      const googlePlaceId = rawId.slice(3);
      result = await query(
        'SELECT id FROM favorites WHERE user_id = $1 AND google_place_id = $2',
        [userId, googlePlaceId]
      );
    } else {
      const businessId = parseInt(rawId, 10);
      if (!Number.isInteger(businessId)) {
        return res.json({ isFavorite: false });
      }
      result = await query(
        'SELECT id FROM favorites WHERE user_id = $1 AND business_id = $2',
        [userId, businessId]
      );
    }

    res.json({ isFavorite: result.rows.length > 0 });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
