import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getBusinessAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const { startDate, endDate } = req.query;
    const userId = req.user?.userId;

    const businessCheck = await query(
      'SELECT owner_id FROM businesses WHERE id = $1',
      [businessId]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view analytics for this business' });
    }

    const dateFilter = startDate && endDate
      ? 'AND created_at BETWEEN $2 AND $3'
      : '';
    const params = dateFilter
      ? [businessId, startDate, endDate]
      : [businessId];

    const profileViews = await query(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE business_id = $1 AND event_type = 'profile_view' ${dateFilter}`,
      params
    );

    const searchAppearances = await query(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE business_id = $1 AND event_type = 'search_result' ${dateFilter}`,
      params
    );

    const reviewsPosted = await query(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE business_id = $1 AND event_type = 'review_posted' ${dateFilter}`,
      params
    );

    const favorites = await query(
      `SELECT COUNT(*) as count
       FROM favorites
       WHERE business_id = $1`,
      [businessId]
    );

    const dealsRedeemed = await query(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE business_id = $1 AND event_type = 'deal_redeemed' ${dateFilter}`,
      params
    );

    const avgRating = await query(
      `SELECT COALESCE(AVG(rating), 0) as avg_rating
       FROM reviews
       WHERE business_id = $1`,
      [businessId]
    );

    const ratingDistribution = await query(
      `SELECT rating, COUNT(*) as count
       FROM reviews
       WHERE business_id = $1
       GROUP BY rating
       ORDER BY rating DESC`,
      [businessId]
    );

    const viewsTrend = await query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as count
       FROM analytics_events
       WHERE business_id = $1 AND event_type = 'profile_view' ${dateFilter}
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );

    res.json({
      analytics: {
        profileViews: parseInt(profileViews.rows[0].count),
        searchAppearances: parseInt(searchAppearances.rows[0].count),
        reviewsPosted: parseInt(reviewsPosted.rows[0].count),
        totalFavorites: parseInt(favorites.rows[0].count),
        dealsRedeemed: parseInt(dealsRedeemed.rows[0].count),
        averageRating: parseFloat(avgRating.rows[0].avg_rating).toFixed(2),
        ratingDistribution: ratingDistribution.rows,
        viewsTrend: viewsTrend.rows,
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDealAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const userId = req.user?.userId;

    const businessCheck = await query(
      'SELECT owner_id FROM businesses WHERE id = $1',
      [businessId]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view analytics for this business' });
    }

    const result = await query(
      `SELECT
        d.id,
        d.title,
        d.times_redeemed,
        d.redemption_limit,
        d.created_at,
        d.expiration_date,
        d.is_active
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
