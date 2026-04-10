import { Router } from 'express';
import * as businessController from '../controllers/businessController';
import { authMiddleware } from '../middleware/auth';
import { businessValidation } from '../middleware/validation';
import { searchLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/', authMiddleware, businessValidation, businessController.createBusiness);
router.get('/search', searchLimiter, businessController.searchBusinesses);
router.get('/categories', businessController.getCategories);
router.get('/:id', businessController.getBusinessById);
router.put('/:id', authMiddleware, businessController.updateBusiness);

export default router;
