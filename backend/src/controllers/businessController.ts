import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const ensureUniqueSlug = async (base: string): Promise<string> => {
  let slug = base || 'business';
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const r = await query('SELECT id FROM businesses WHERE slug = $1', [candidate]);
    if (r.rows.length === 0) return candidate;
    attempt++;
  }
};

export const createBusiness = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const {
      name,
      categoryIds,
      description,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      country,
      phone,
      website,
      email,
      latitude,
      longitude,
      priceLevel,
      hoursOfOperation,
      photoUrls,
      isLocal,
      isChain,
      chainName,
    } = req.body;

    const ownerId = req.user!.userId;
    const slug = await ensureUniqueSlug(slugify(name));

    await client.query('BEGIN');

    const businessResult = await client.query(
      `INSERT INTO businesses (
         owner_id, name, slug, description, phone, email, website,
         address_line_1, address_line_2, city, state, zip_code, country,
         latitude, longitude, price_level,
         is_local, is_chain, chain_name,
         is_verified, is_active, is_claimed,
         average_rating, review_count
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, COALESCE($13, 'USA'),
         $14, $15, $16,
         COALESCE($17, true), COALESCE($18, false), $19,
         false, true, true,
         0, 0
       )
       RETURNING *`,
      [
        ownerId,
        name,
        slug,
        description || null,
        phone || null,
        email || null,
        website || null,
        addressLine1,
        addressLine2 || null,
        city,
        state,
        zipCode,
        country || null,
        latitude,
        longitude,
        priceLevel || null,
        isLocal,
        isChain,
        chainName || null,
      ]
    );

    const business = businessResult.rows[0];

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const values: string[] = [];
      const params: any[] = [];
      categoryIds.forEach((cid: number, idx: number) => {
        values.push(`($${idx * 2 + 1}, $${idx * 2 + 2})`);
        params.push(business.id, cid);
      });
      await client.query(
        `INSERT INTO business_categories (business_id, category_id) VALUES ${values.join(', ')}`,
        params
      );
    }

    if (hoursOfOperation && typeof hoursOfOperation === 'object') {
      for (const [day, hours] of Object.entries<any>(hoursOfOperation)) {
        const dayNum = parseInt(day, 10);
        if (Number.isNaN(dayNum) || dayNum < 0 || dayNum > 6) continue;
        await client.query(
          `INSERT INTO business_hours (business_id, day_of_week, open_time, close_time, is_closed)
           VALUES ($1, $2, $3, $4, $5)`,
          [business.id, dayNum, hours?.open || null, hours?.close || null, !!hours?.closed]
        );
      }
    }

    if (Array.isArray(photoUrls) && photoUrls.length > 0) {
      for (let i = 0; i < photoUrls.length; i++) {
        await client.query(
          `INSERT INTO business_photos (business_id, url, is_primary, upload_order)
           VALUES ($1, $2, $3, $4)`,
          [business.id, photoUrls[i], i === 0, i]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Business created successfully',
      business,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create business error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const searchBusinesses = async (req: Request, res: Response) => {
  try {
    const {
      query: searchQuery,
      categoryId,
      latitude,
      longitude,
      radius = 10,
      priceLevel,
      minRating,
      sortBy,
      limit = 50,
      offset = 0,
    } = req.query;

    const lat = parseFloat((latitude as string) || '0');
    const lng = parseFloat((longitude as string) || '0');
    const hasLocation = !!latitude && !!longitude;

    let sql = `
      SELECT
        b.*,
        ${hasLocation ? `(
          6371 * acos(
            cos(radians($1)) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(b.latitude))
          )
        ) AS distance_km` : `NULL::float AS distance_km`}
      FROM businesses b
      WHERE b.is_active = true
    `;

    const params: any[] = hasLocation ? [lat, lng] : [];
    let paramIndex = params.length + 1;

    if (hasLocation && radius) {
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
        b.description ILIKE $${paramIndex}
      )`;
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    if (categoryId) {
      sql += ` AND EXISTS (
        SELECT 1 FROM business_categories bc
        WHERE bc.business_id = b.id AND bc.category_id = $${paramIndex}
      )`;
      params.push(parseInt(categoryId as string, 10));
      paramIndex++;
    }

    if (priceLevel) {
      sql += ` AND b.price_level = $${paramIndex}`;
      params.push(parseInt(priceLevel as string, 10));
      paramIndex++;
    }

    if (minRating) {
      sql += ` AND b.average_rating >= $${paramIndex}`;
      params.push(parseFloat(minRating as string));
      paramIndex++;
    }

    const sortOptions: Record<string, string> = {
      rating: 'b.average_rating DESC NULLS LAST',
      review_count: 'b.review_count DESC',
      distance: 'distance_km ASC NULLS LAST',
      newest: 'b.created_at DESC',
    };
    const orderClause = sortOptions[sortBy as string] || (hasLocation ? 'distance_km ASC NULLS LAST' : 'b.created_at DESC');
    sql += ` ORDER BY ${orderClause}`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

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
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }

    const result = await query(`SELECT * FROM businesses WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const categories = await query(
      `SELECT c.id, c.name, c.slug, c.icon
       FROM business_categories bc
       JOIN categories c ON bc.category_id = c.id
       WHERE bc.business_id = $1`,
      [id]
    );

    const hours = await query(
      `SELECT day_of_week, open_time, close_time, is_closed
       FROM business_hours WHERE business_id = $1
       ORDER BY day_of_week`,
      [id]
    );

    const photos = await query(
      `SELECT id, url, caption, alt_text, is_primary, upload_order
       FROM business_photos WHERE business_id = $1
       ORDER BY upload_order`,
      [id]
    );

    res.json({
      business: {
        ...result.rows[0],
        categories: categories.rows,
        hours: hours.rows,
        photos: photos.rows,
      },
    });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateBusiness = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }
    const userId = req.user!.userId;

    const businessCheck = await query('SELECT owner_id FROM businesses WHERE id = $1', [id]);

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (businessCheck.rows[0].owner_id !== userId && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this business' });
    }

    const {
      name,
      description,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      phone,
      website,
      email,
      priceLevel,
    } = req.body;

    const result = await query(
      `UPDATE businesses
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           address_line_1 = COALESCE($3, address_line_1),
           address_line_2 = COALESCE($4, address_line_2),
           city = COALESCE($5, city),
           state = COALESCE($6, state),
           zip_code = COALESCE($7, zip_code),
           phone = COALESCE($8, phone),
           website = COALESCE($9, website),
           email = COALESCE($10, email),
           price_level = COALESCE($11, price_level),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [name, description, addressLine1, addressLine2, city, state, zipCode, phone, website, email, priceLevel, id]
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

export const getCategories = async (_req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT id, name, slug, icon, parent_id FROM categories ORDER BY name'
    );
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
