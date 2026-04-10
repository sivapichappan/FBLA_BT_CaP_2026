import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getBusinessAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId, 10);
    if (!Number.isInteger(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }

    const userId = req.user!.userId;

    const businessCheck = await query(
      'SELECT owner_id, average_rating, review_count FROM businesses WHERE id = $1',
      [businessId]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view analytics for this business' });
    }

    const favorites = await query(
      `SELECT COUNT(*)::int AS count FROM favorites WHERE business_id = $1`,
      [businessId]
    );

    const dealsClaimed = await query(
      `SELECT COUNT(*)::int AS count
       FROM deal_claims dc
       JOIN deals d ON dc.deal_id = d.id
       WHERE d.business_id = $1`,
      [businessId]
    );

    const ratingDistribution = await query(
      `SELECT rating, COUNT(*)::int AS count
       FROM reviews
       WHERE business_id = $1 AND is_hidden = false
       GROUP BY rating
       ORDER BY rating DESC`,
      [businessId]
    );

    const reviewsTrend = await query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*)::int AS count
       FROM reviews
       WHERE business_id = $1 AND is_hidden = false
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
      [businessId]
    );

    res.json({
      analytics: {
        averageRating: parseFloat(businessCheck.rows[0].average_rating || 0).toFixed(2),
        totalReviews: businessCheck.rows[0].review_count,
        totalFavorites: favorites.rows[0].count,
        dealsClaimed: dealsClaimed.rows[0].count,
        ratingDistribution: ratingDistribution.rows,
        reviewsTrend: reviewsTrend.rows,
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDealAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId, 10);
    if (!Number.isInteger(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }
    const userId = req.user!.userId;

    const businessCheck = await query('SELECT owner_id FROM businesses WHERE id = $1', [businessId]);

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view analytics for this business' });
    }

    const result = await query(
      `SELECT
         d.id,
         d.title,
         d.discount_type,
         d.discount_value,
         d.redemption_count,
         d.total_limit,
         d.per_user_limit,
         d.start_date,
         d.end_date,
         d.is_active,
         d.created_at
       FROM deals d
       WHERE d.business_id = $1
       ORDER BY d.created_at DESC`,
      [businessId]
    );

    res.json({ dealAnalytics: result.rows });
  } catch (error) {
    console.error('Get deal analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
