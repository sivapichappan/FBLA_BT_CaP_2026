import { Response } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const recomputeBusinessRating = async (businessId: number, client: any) => {
  await client.query(
    `UPDATE businesses
     SET review_count = (SELECT COUNT(*) FROM reviews WHERE business_id = $1 AND is_hidden = false),
         average_rating = COALESCE(
           (SELECT AVG(rating)::float FROM reviews WHERE business_id = $1 AND is_hidden = false),
           0
         )
     WHERE id = $1`,
    [businessId]
  );
};

export const createReview = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const { businessId, rating, title, content } = req.body;
    const userId = req.user!.userId;

    const businessCheck = await query('SELECT id FROM businesses WHERE id = $1', [businessId]);
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

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO reviews (user_id, business_id, rating, title, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, businessId, rating, title || null, content || null]
    );

    await recomputeBusinessRating(businessId, client);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Review created successfully',
      review: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const getBusinessReviews = async (req: AuthRequest, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId, 10);
    if (!Number.isInteger(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }

    const { limit = 20, offset = 0, sortBy = 'recent' } = req.query;

    let orderClause = 'r.created_at DESC';
    if (sortBy === 'rating_high') {
      orderClause = 'r.rating DESC, r.created_at DESC';
    } else if (sortBy === 'rating_low') {
      orderClause = 'r.rating ASC, r.created_at DESC';
    } else if (sortBy === 'helpful') {
      orderClause = 'r.helpful_count DESC, r.created_at DESC';
    }

    const result = await query(
      `SELECT
         r.id, r.rating, r.title, r.content, r.helpful_count, r.not_helpful_count,
         r.is_verified_purchase, r.created_at, r.updated_at,
         u.id AS user_id, u.username, u.first_name, u.last_name, u.profile_image_url
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.business_id = $1 AND r.is_hidden = false
       ORDER BY ${orderClause}
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset]
    );

    res.json({
      reviews: result.rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        content: r.content,
        helpfulCount: r.helpful_count,
        notHelpfulCount: r.not_helpful_count,
        isVerifiedPurchase: r.is_verified_purchase,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        user: {
          id: r.user_id,
          username: r.username,
          firstName: r.first_name,
          lastName: r.last_name,
          profileImageUrl: r.profile_image_url,
        },
      })),
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateReview = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid review ID' });
    }
    const { rating, title, content } = req.body;
    const userId = req.user!.userId;

    const reviewCheck = await query('SELECT user_id, business_id FROM reviews WHERE id = $1', [id]);

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (reviewCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this review' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE reviews
       SET rating = COALESCE($1, rating),
           title = COALESCE($2, title),
           content = COALESCE($3, content),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [rating, title, content, id]
    );

    await recomputeBusinessRating(reviewCheck.rows[0].business_id, client);

    await client.query('COMMIT');

    res.json({
      message: 'Review updated successfully',
      review: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const deleteReview = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid review ID' });
    }
    const userId = req.user!.userId;

    const reviewCheck = await query('SELECT user_id, business_id FROM reviews WHERE id = $1', [id]);

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (reviewCheck.rows[0].user_id !== userId && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this review' });
    }

    const businessId = reviewCheck.rows[0].business_id;

    await client.query('BEGIN');
    await client.query('DELETE FROM reviews WHERE id = $1', [id]);
    await recomputeBusinessRating(businessId, client);
    await client.query('COMMIT');

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};
