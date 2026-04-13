import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/database';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const generateUsername = (email: string): string => {
  const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  return `${base}${Math.floor(Math.random() * 10000)}`;
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, username } = req.body;

    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    let finalUsername = username || generateUsername(email);
    const existingUsername = await query('SELECT id FROM users WHERE username = $1', [finalUsername]);
    if (existingUsername.rows.length > 0) {
      finalUsername = generateUsername(email);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (
         email, username, password_hash, first_name, last_name,
         trust_score, total_points, level, is_active, is_admin
       )
       VALUES ($1, $2, $3, $4, $5, 50.0, 0, 1, true, false)
       RETURNING id, email, username, first_name, last_name, is_admin, created_at`,
      [email, finalUsername, passwordHash, firstName || null, lastName || null]
    );

    const user = result.rows[0];
    const token = generateToken({
      userId: user.id,
      email: user.email,
      isAdmin: user.is_admin,
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: user.is_admin,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      `SELECT id, email, username, password_hash, first_name, last_name, is_admin,
              failed_login_attempts, locked_until, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;
      await query(
        `UPDATE users
         SET failed_login_attempts = $1,
             locked_until = $2
         WHERE id = $3`,
        [
          newAttempts,
          shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
          user.id,
        ]
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    const token = generateToken({
      userId: user.id,
      email: user.email,
      isAdmin: user.is_admin,
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: user.is_admin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const result = await query(
      `SELECT id, email, username, first_name, last_name, profile_image_url,
              default_latitude, default_longitude, default_city, default_state,
              trust_score, total_points, level, is_admin, created_at, last_login_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { latitude, longitude, city, state } = req.body;

    await query(
      `UPDATE users
       SET default_latitude = $1,
           default_longitude = $2,
           default_city = COALESCE($3, default_city),
           default_state = COALESCE($4, default_state)
       WHERE id = $5`,
      [latitude, longitude, city || null, state || null, userId]
    );

    res.json({ message: 'Location updated successfully' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
