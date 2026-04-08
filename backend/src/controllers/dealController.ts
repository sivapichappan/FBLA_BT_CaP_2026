import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const createDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, title, description, discountAmount, terms, expirationDate, redemptionLimit } = req.body;
    const userId = req.user?.userId;

    const businessCheck = await query(
      'SELECT owner_id FROM businesses WHERE id = $1',
      [businessId]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to create deals for this business' });
    }

    const result = await query(
      `INSERT INTO deals (business_id, title, description, discount_amount, terms, expiration_date, redemption_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [businessId, title, description, discountAmount, terms, expirationDate, redemptionLimit]
    );

    res.status(201).json({
      message: 'Deal created successfully',
      deal: result.rows[0],
    });
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBusinessDeals = async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;

    const result = await query(
      `SELECT * FROM deals
       WHERE business_id = $1
         AND is_active = true
         AND (expiration_date IS NULL OR expiration_date > NOW())
         AND (redemption_limit IS NULL OR times_redeemed < redemption_limit)
       ORDER BY created_at DESC`,
      [businessId]
    );

    res.json({ deals: result.rows });
  } catch (error) {
    console.error('Get deals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllActiveDeals = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, radius = 10, limit = 20 } = req.query;

    let sql = `
      SELECT
        d.*,
        b.name as business_name,
        b.category,
        b.latitude,
        b.longitude
      FROM deals d
      JOIN businesses b ON d.business_id = b.id
      WHERE d.is_active = true
        AND (d.expiration_date IS NULL OR d.expiration_date > NOW())
        AND (d.redemption_limit IS NULL OR d.times_redeemed < d.redemption_limit)
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (latitude && longitude && radius) {
      sql += ` AND (
        6371 * acos(
          cos(radians($${paramIndex})) * cos(radians(b.latitude)) *
          cos(radians(b.longitude) - radians($${paramIndex + 1})) +
          sin(radians($${paramIndex})) * sin(radians(b.latitude))
        )
      ) <= $${paramIndex + 2}`;
      params.push(latitude, longitude, radius);
      paramIndex += 3;
    }

    sql += ` ORDER BY d.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(sql, params);

    res.json({ deals: result.rows });
  } catch (error) {
    console.error('Get all deals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const redeemDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { dealId } = req.params;
    const userId = req.user?.userId;

    const dealCheck = await query(
      `SELECT * FROM deals WHERE id = $1`,
      [dealId]
    );

    if (dealCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = dealCheck.rows[0];

    if (!deal.is_active) {
      return res.status(400).json({ error: 'Deal is no longer active' });
    }

    if (deal.expiration_date && new Date(deal.expiration_date) < new Date()) {
      return res.status(400).json({ error: 'Deal has expired' });
    }

    if (deal.redemption_limit && deal.times_redeemed >= deal.redemption_limit) {
      return res.status(400).json({ error: 'Deal redemption limit reached' });
    }

    const alreadyRedeemed = await query(
      'SELECT id FROM deal_redemptions WHERE deal_id = $1 AND user_id = $2',
      [dealId, userId]
    );

    if (alreadyRedeemed.rows.length > 0) {
      return res.status(400).json({ error: 'You have already redeemed this deal' });
    }

    await query(
      'INSERT INTO deal_redemptions (deal_id, user_id) VALUES ($1, $2)',
      [dealId, userId]
    );

    await query(
      'UPDATE deals SET times_redeemed = times_redeemed + 1 WHERE id = $1',
      [dealId]
    );

    await query(
      `INSERT INTO analytics_events (business_id, event_type, user_id, metadata)
       VALUES ($1, 'deal_redeemed', $2, $3)`,
      [deal.business_id, userId, JSON.stringify({ dealId, title: deal.title })]
    );

    res.json({ message: 'Deal redeemed successfully' });
  } catch (error) {
    console.error('Redeem deal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, discountAmount, terms, expirationDate, isActive } = req.body;
    const userId = req.user?.userId;

    const dealCheck = await query(
      `SELECT d.*, b.owner_id
       FROM deals d
       JOIN businesses b ON d.business_id = b.id
       WHERE d.id = $1`,
      [id]
    );

    if (dealCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    if (dealCheck.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this deal' });
    }

    const result = await query(
      `UPDATE deals
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           discount_amount = COALESCE($3, discount_amount),
           terms = COALESCE($4, terms),
           expiration_date = COALESCE($5, expiration_date),
           is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING *`,
      [title, description, discountAmount, terms, expirationDate, isActive, id]
    );

    res.json({
      message: 'Deal updated successfully',
      deal: result.rows[0],
    });
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
