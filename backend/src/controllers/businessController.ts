import { Request, Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const createBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      category,
      description,
      address,
      city,
      state,
      zipCode,
      phone,
      website,
      email,
      latitude,
      longitude,
      priceRange,
      hoursOfOperation,
      photoUrls,
    } = req.body;

    const ownerId = req.user?.userId;

    const result = await query(
      `INSERT INTO businesses (
        owner_id, name, category, description, address, city, state, zip_code,
        phone, website, email, latitude, longitude, price_range, hours_of_operation, photo_urls
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        ownerId,
        name,
        category,
        description,
        address,
        city,
        state,
        zipCode,
        phone,
        website,
        email,
        latitude,
        longitude,
        priceRange,
        JSON.stringify(hoursOfOperation),
        photoUrls,
      ]
    );

    res.status(201).json({
      message: 'Business created successfully',
      business: result.rows[0],
    });
  } catch (error) {
    console.error('Create business error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const searchBusinesses = async (req: Request, res: Response) => {
  try {
    const {
      query: searchQuery,
      category,
      latitude,
      longitude,
      radius = 10,
      priceRange,
      minRating,
      openNow,
      sortBy,
      limit = 50,
      offset = 0,
    } = req.query;

    let sql = `
      SELECT
        b.*,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as review_count,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(b.latitude))
          )
        ) as distance_km
      FROM businesses b
      LEFT JOIN reviews r ON b.id = r.business_id
      WHERE 1=1
    `;

    const params: any[] = [latitude || 0, longitude || 0];
    let paramIndex = 3;

    if (latitude && longitude && radius) {
      sql += ` AND (
        6371 * acos(
          cos(radians($1)) * cos(radians(b.latitude)) *
          cos(radians(b.longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(b.latitude))
        )
      ) <= $${paramIndex}`;
      params.push(radius);
      paramIndex++;
    }

    if (searchQuery) {
      sql += ` AND (
        b.name ILIKE $${paramIndex} OR
        b.description ILIKE $${paramIndex} OR
        b.category ILIKE $${paramIndex}
      )`;
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    if (category) {
      sql += ` AND b.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (priceRange) {
      sql += ` AND b.price_range = $${paramIndex}`;
      params.push(priceRange);
      paramIndex++;
    }

    sql += ` GROUP BY b.id`;

    if (minRating) {
      sql += ` HAVING AVG(r.rating) >= $${paramIndex}`;
      params.push(minRating);
      paramIndex++;
    }

    const sortOptions: Record<string, string> = {
      rating: 'avg_rating DESC',
      review_count: 'review_count DESC',
      distance: 'distance_km ASC',
    };
    const orderClause = sortOptions[sortBy as string] || 'distance_km ASC';
    sql += ` ORDER BY ${orderClause}`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    await query(
      `INSERT INTO analytics_events (business_id, event_type, metadata)
       SELECT id, 'search_result', $1 FROM businesses WHERE id = ANY($2)`,
      [JSON.stringify({ searchQuery, category }), result.rows.map((b) => b.id)]
    );

    res.json({
      businesses: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Search businesses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBusinessById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
        b.*,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as review_count
       FROM businesses b
       LEFT JOIN reviews r ON b.id = r.business_id
       WHERE b.id = $1
       GROUP BY b.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    await query(
      `INSERT INTO analytics_events (business_id, event_type)
       VALUES ($1, 'profile_view')`,
      [id]
    );

    res.json({ business: result.rows[0] });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const businessCheck = await query(
      'SELECT owner_id FROM businesses WHERE id = $1',
      [id]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this business' });
    }

    const {
      name,
      category,
      description,
      address,
      phone,
      website,
      hoursOfOperation,
      photoUrls,
    } = req.body;

    const result = await query(
      `UPDATE businesses
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           description = COALESCE($3, description),
           address = COALESCE($4, address),
           phone = COALESCE($5, phone),
           website = COALESCE($6, website),
           hours_of_operation = COALESCE($7, hours_of_operation),
           photo_urls = COALESCE($8, photo_urls)
       WHERE id = $9
       RETURNING *`,
      [name, category, description, address, phone, website, JSON.stringify(hoursOfOperation), photoUrls, id]
    );

    res.json({
      message: 'Business updated successfully',
      business: result.rows[0],
    });
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT DISTINCT category FROM businesses ORDER BY category'
    );

    res.json({ categories: result.rows.map((r) => r.category) });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
