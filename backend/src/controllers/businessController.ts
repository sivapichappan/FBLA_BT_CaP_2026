import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import * as googlePlaces from '../services/googlePlaces';
import { filterAndScoreBusinesses } from '../utils/localBusinessScorer';

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
      latitude,
      longitude,
      radius = 1000,
      type,
    } = req.query;

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);

    if (!lat || !lng) {
      return res.json({ businesses: [], total: 0 });
    }

    const radiusMeters = Math.min(parseInt(radius as string, 10) || 1000, 50000);
    let places: any[];

    if (searchQuery) {
      // Text search for keyword queries
      places = await googlePlaces.searchText(searchQuery as string, lat, lng, radiusMeters);
    } else if (type) {
      // Single type filter
      places = await googlePlaces.searchNearby(lat, lng, radiusMeters, [type as string], 20);
    } else {
      // Default: diverse 3-way parallel search
      places = await googlePlaces.searchNearbyDiverse(lat, lng, radiusMeters);
    }

    const formatted = places.map(googlePlaces.formatPlace);
    const businesses = filterAndScoreBusinesses(formatted);

    // CDN cache for 5 minutes
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    res.json({
      businesses,
      total: businesses.length,
    });
  } catch (error) {
    console.error('Search businesses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBusinessById = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;

    // Google Places business
    if (rawId.startsWith('gp_')) {
      const placeId = rawId.slice(3);
      const detail = await googlePlaces.getPlaceDetails(placeId);
      if (!detail) {
        return res.status(404).json({ error: 'Business not found' });
      }
      return res.json({ business: googlePlaces.formatPlaceDetail(detail) });
    }

    // Local database business
    const id = parseInt(rawId, 10);
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
        source: 'local',
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

export const autocompleteLocation = async (req: Request, res: Response) => {
  try {
    const { input } = req.query;
    if (!input || typeof input !== 'string' || input.length < 2) {
      return res.json({ predictions: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.json({ predictions: [] });

    const { default: axios } = await import('axios');
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        input,
        includedPrimaryTypes: ['locality', 'sublocality', 'postal_code', 'administrative_area_level_1', 'route', 'street_address'],
      },
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      },
    );

    const predictions = (response.data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .slice(0, 5)
      .map((s: any) => ({
        place_id: s.placePrediction.placeId,
        description: s.placePrediction.text?.text || '',
        main_text: s.placePrediction.structuredFormat?.mainText?.text || '',
        secondary_text: s.placePrediction.structuredFormat?.secondaryText?.text || '',
      }));

    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.json({ predictions });
  } catch (error: any) {
    console.error('Autocomplete error:', error.response?.data || error.message);
    res.json({ predictions: [] });
  }
};

export const geocodeLocation = async (req: Request, res: Response) => {
  try {
    const { address } = req.query;
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Address is required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const { default: axios } = await import('axios');
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: apiKey },
    });

    if (response.data.status !== 'OK' || !response.data.results?.length) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const result = response.data.results[0];
    res.json({
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formatted_address: result.formatted_address,
    });
  } catch (error) {
    console.error('Geocode error:', error);
    res.status(500).json({ error: 'Failed to geocode location' });
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
