import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { registerValidation, loginValidation } from '../middleware/validation';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login', authLimiter, loginValidation, authController.login);
router.get('/profile', authMiddleware, authController.getProfile);
router.put('/location', authMiddleware, authController.updateLocation);

export default router;
