import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/business/:businessId', authMiddleware, analyticsController.getBusinessAnalytics);
router.get('/business/:businessId/deals', authMiddleware, analyticsController.getDealAnalytics);

export default router;
