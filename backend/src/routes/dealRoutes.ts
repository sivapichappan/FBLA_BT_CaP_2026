import { Router } from 'express';
import * as dealController from '../controllers/dealController';
import { authMiddleware, businessOwnerMiddleware } from '../middleware/auth';
import { dealValidation } from '../middleware/validation';

const router = Router();

router.post('/', authMiddleware, businessOwnerMiddleware, dealValidation, dealController.createDeal);
router.get('/business/:businessId', dealController.getBusinessDeals);
router.get('/active', dealController.getAllActiveDeals);
router.post('/:dealId/redeem', authMiddleware, dealController.redeemDeal);
router.put('/:id', authMiddleware, businessOwnerMiddleware, dealController.updateDeal);

export default router;
