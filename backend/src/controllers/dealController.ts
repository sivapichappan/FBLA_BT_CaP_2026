import { Response } from 'express';
import crypto from 'crypto';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const createDeal = async (req: AuthRequest, res: Response) => {
  try {
    const {
      businessId,
      title,
      description,
      code,
      discountType,
      discountValue,
      minimumPurchase,
      startDate,
      endDate,
      totalLimit,
      perUserLimit,
      pointsBonus,
      termsConditions,
      imageUrl,
    } = req.body;
    const userId = req.user!.userId;

    const businessCheck = await query('SELECT owner_id FROM businesses WHERE id = $1', [businessId]);

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to create deals for this business' });
    }

    const result = await query(
      `INSERT INTO deals (
         business_id, title, description, code,
         discount_type, discount_value, minimum_purchase,
         start_date, end_date,
         is_active, total_limit, per_user_limit, redemption_count,
         points_bonus, terms_conditions, image_url
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7,
         COALESCE($8, NOW()), $9,
         true, $10, COALESCE($11, 1), 0,
         COALESCE($12, 0), $13, $14
       )
       RETURNING *`,
      [
        businessId,
        title,
        description || null,
        code || null,
        discountType,
        discountValue,
        minimumPurchase || null,
        startDate || null,
        endDate,
        totalLimit || null,
        perUserLimit,
        pointsBonus,
        termsConditions || null,
        imageUrl || null,
      ]
    );

    res.status(201).json({ message: 'Deal created successfully', deal: result.rows[0] });
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBusinessDeals = async (req: AuthRequest, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId, 10);
    if (!Number.isInteger(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }

    const result = await query(
      `SELECT * FROM deals
       WHERE business_id = $1
         AND is_active = true
         AND (end_date IS NULL OR end_date > NOW())
         AND (total_limit IS NULL OR redemption_count < total_limit)
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
        b.name AS business_name,
        b.slug AS business_slug,
        b.latitude,
        b.longitude
      FROM deals d
      JOIN businesses b ON d.business_id = b.id
      WHERE d.is_active = true
        AND (d.end_date IS NULL OR d.end_date > NOW())
        AND (d.total_limit IS NULL OR d.redemption_count < d.total_limit)
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
  const client = await getClient();
  try {
    const dealId = parseInt(req.params.dealId, 10);
    if (!Number.isInteger(dealId)) {
      return res.status(400).json({ error: 'Invalid deal ID' });
    }
    const userId = req.user!.userId;

    const dealCheck = await query(`SELECT * FROM deals WHERE id = $1`, [dealId]);

    if (dealCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = dealCheck.rows[0];

    if (!deal.is_active) {
      return res.status(400).json({ error: 'Deal is no longer active' });
    }

    if (deal.end_date && new Date(deal.end_date) < new Date()) {
      return res.status(400).json({ error: 'Deal has expired' });
    }

    if (deal.total_limit && deal.redemption_count >= deal.total_limit) {
      return res.status(400).json({ error: 'Deal redemption limit reached' });
    }

    const userClaims = await query(
      'SELECT COUNT(*)::int AS count FROM deal_claims WHERE deal_id = $1 AND user_id = $2',
      [dealId, userId]
    );

    if (userClaims.rows[0].count >= (deal.per_user_limit || 1)) {
      return res.status(400).json({ error: 'You have already claimed this deal' });
    }

    const redemptionCode = crypto.randomBytes(6).toString('hex').toUpperCase();

    await client.query('BEGIN');

    const claim = await client.query(
      `INSERT INTO deal_claims (deal_id, user_id, status, redemption_code)
       VALUES ($1, $2, 'claimed', $3)
       RETURNING *`,
      [dealId, userId, redemptionCode]
    );

    await client.query(
      'UPDATE deals SET redemption_count = redemption_count + 1 WHERE id = $1',
      [dealId]
    );

    await client.query('COMMIT');

    res.json({ message: 'Deal claimed successfully', claim: claim.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Claim deal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const updateDeal = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid deal ID' });
    }
    const { title, description, discountType, discountValue, termsConditions, endDate, isActive } = req.body;
    const userId = req.user!.userId;

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

    if (dealCheck.rows[0].owner_id !== userId && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this deal' });
    }

    const result = await query(
      `UPDATE deals
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           discount_type = COALESCE($3, discount_type),
           discount_value = COALESCE($4, discount_value),
           terms_conditions = COALESCE($5, terms_conditions),
           end_date = COALESCE($6, end_date),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [title, description, discountType, discountValue, termsConditions, endDate, isActive, id]
    );

    res.json({ message: 'Deal updated successfully', deal: result.rows[0] });
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
