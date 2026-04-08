import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const createReview = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, rating, comment } = req.body;
    const userId = req.user?.userId;

    const businessCheck = await query(
      'SELECT id FROM businesses WHERE id = $1',
      [businessId]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const existingReview = await query(
      'SELECT id FROM reviews WHERE user_id = $1 AND business_id = $2',
      [userId, businessId]
    );

    if (existingReview.rows.length > 0) {
      return res.status(400).json({ error: 'You have already reviewed this business' });
    }

    const result = await query(
      `INSERT INTO reviews (user_id, business_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, businessId, rating, comment]
    );

    await query(
      `INSERT INTO analytics_events (business_id, event_type, user_id, metadata)
       VALUES ($1, 'review_posted', $2, $3)`,
      [businessId, userId, JSON.stringify({ rating })]
    );

    res.status(201).json({
      message: 'Review created successfully',
      review: result.rows[0],
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBusinessReviews = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const { limit = 20, offset = 0, sortBy = 'recent' } = req.query;

    let orderClause = 'r.created_at DESC';
    if (sortBy === 'rating_high') {
      orderClause = 'r.rating DESC, r.created_at DESC';
    } else if (sortBy === 'rating_low') {
      orderClause = 'r.rating ASC, r.created_at DESC';
    }

    const result = await query(
      `SELECT
        r.*,
        u.full_name,
        u.email
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.business_id = $1
       ORDER BY ${orderClause}
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset]
    );

    res.json({
      reviews: result.rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        userName: r.full_name || 'Anonymous',
      })),
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user?.userId;

    const reviewCheck = await query(
      'SELECT user_id FROM reviews WHERE id = $1',
      [id]
    );

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (reviewCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this review' });
    }

    const result = await query(
      `UPDATE reviews
       SET rating = COALESCE($1, rating),
           comment = COALESCE($2, comment)
       WHERE id = $3
       RETURNING *`,
      [rating, comment, id]
    );

    res.json({
      message: 'Review updated successfully',
      review: result.rows[0],
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const reviewCheck = await query(
      'SELECT user_id FROM reviews WHERE id = $1',
      [id]
    );

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (reviewCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this review' });
    }

    await query('DELETE FROM reviews WHERE id = $1', [id]);

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
