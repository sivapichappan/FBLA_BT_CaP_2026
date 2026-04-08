import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('fullName').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  validate,
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

export const businessValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Business name must be at least 2 characters'),
  body('category').notEmpty().withMessage('Category is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  body('phone').optional().isMobilePhone('any').withMessage('Valid phone number required'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  validate,
];

export const reviewValidation = [
  body('businessId').isUUID().withMessage('Valid business ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 1000 }).withMessage('Comment must be under 1000 characters'),
  validate,
];

export const dealValidation = [
  body('businessId').isUUID().withMessage('Valid business ID is required'),
  body('title').trim().isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters'),
  body('description').optional().trim(),
  body('expirationDate').optional().isISO8601().withMessage('Valid date required'),
  validate,
];
