import { Router } from 'express';
import * as dealController from '../controllers/dealController';
import { authMiddleware } from '../middleware/auth';
import { dealValidation } from '../middleware/validation';

const router = Router();

router.post('/', authMiddleware, dealValidation, dealController.createDeal);
router.get('/business/:businessId', dealController.getBusinessDeals);
router.get('/active', dealController.getAllActiveDeals);
router.post('/:dealId/redeem', authMiddleware, dealController.redeemDeal);
router.put('/:id', authMiddleware, dealController.updateDeal);

export default router;
