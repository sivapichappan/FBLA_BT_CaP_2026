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
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name required'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name required'),
  body('username').optional().trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
  validate,
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

export const businessValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Business name must be at least 2 characters'),
  body('categoryIds').isArray({ min: 1 }).withMessage('At least one category is required'),
  body('categoryIds.*').isInt({ min: 1 }).withMessage('Category IDs must be integers'),
  body('addressLine1').trim().notEmpty().withMessage('Address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('zipCode').trim().notEmpty().withMessage('Zip code is required'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  body('phone').optional({ checkFalsy: true }).isMobilePhone('any').withMessage('Valid phone number required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email required'),
  body('priceLevel').optional().isInt({ min: 1, max: 4 }).withMessage('Price level must be 1-4'),
  validate,
];

export const reviewValidation = [
  body('businessId').isInt({ min: 1 }).withMessage('Valid business ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('title').optional().trim().isLength({ max: 255 }).withMessage('Title must be under 255 characters'),
  body('content').optional().trim().isLength({ max: 2000 }).withMessage('Content must be under 2000 characters'),
  validate,
];

export const dealValidation = [
  body('businessId').isInt({ min: 1 }).withMessage('Valid business ID is required'),
  body('title').trim().isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters'),
  body('description').optional().trim(),
  body('discountType').isIn(['percent', 'fixed']).withMessage('Discount type must be percent or fixed'),
  body('discountValue').isFloat({ min: 0 }).withMessage('Discount value must be positive'),
  body('endDate').isISO8601().withMessage('Valid end date required'),
  body('startDate').optional().isISO8601().withMessage('Valid start date required'),
  validate,
];
