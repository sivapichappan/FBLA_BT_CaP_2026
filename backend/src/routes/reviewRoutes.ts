import { Router } from 'express';
import * as reviewController from '../controllers/reviewController';
import { authMiddleware } from '../middleware/auth';
import { reviewValidation } from '../middleware/validation';

const router = Router();

router.post('/', authMiddleware, reviewValidation, reviewController.createReview);
router.get('/business/:businessId', reviewController.getBusinessReviews);
router.put('/:id', authMiddleware, reviewController.updateReview);
router.delete('/:id', authMiddleware, reviewController.deleteReview);

export default router;
