import { Router, Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

router.get('/', async (req: Request, res: Response) => {
  try {
    const { name, maxWidth = '400' } = req.query;

    if (!name || typeof name !== 'string' || !name.startsWith('places/')) {
      return res.status(400).json({ error: 'Invalid photo name' });
    }

    if (!API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const response = await axios.get(
      `https://places.googleapis.com/v1/${name}/media`,
      {
        params: {
          maxWidthPx: parseInt(maxWidth as string, 10) || 400,
          key: API_KEY,
          skipHttpRedirect: true,
        },
      },
    );

    const photoUri = response.data.photoUri;
    if (!photoUri) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.redirect(302, photoUri);
  } catch (error: any) {
    console.error('Photo proxy error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

export default router;
