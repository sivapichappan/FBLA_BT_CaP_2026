import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

export const verifyRecaptcha = async (token: string): Promise<boolean> => {
  try {
    if (!RECAPTCHA_SECRET) {
      console.warn('reCAPTCHA secret not configured - skipping verification in development');
      return true;
    }

    if (process.env.NODE_ENV === 'development' && !token) {
      console.warn('reCAPTCHA token not provided - allowing in development mode');
      return true;
    }

    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      {
        params: {
          secret: RECAPTCHA_SECRET,
          response: token,
        },
      }
    );

    return response.data.success && response.data.score >= 0.5;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    if (process.env.NODE_ENV === 'development') {
      console.warn('Allowing request due to development mode');
      return true;
    }
    return false;
  }
};
