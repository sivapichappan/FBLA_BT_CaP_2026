import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';
import { authMiddleware, businessOwnerMiddleware } from '../middleware/auth';

const router = Router();

router.get('/business/:businessId', authMiddleware, businessOwnerMiddleware, analyticsController.getBusinessAnalytics);
router.get('/business/:businessId/deals', authMiddleware, businessOwnerMiddleware, analyticsController.getDealAnalytics);

export default router;
