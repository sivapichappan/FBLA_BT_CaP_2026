import { Router } from 'express';
import * as favoriteController from '../controllers/favoriteController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/', authMiddleware, favoriteController.addFavorite);
router.delete('/:id', authMiddleware, favoriteController.removeFavorite);
router.get('/', authMiddleware, favoriteController.getUserFavorites);
router.get('/check/:id', authMiddleware, favoriteController.checkFavorite);

export default router;
