import express from 'express';
import {
	registerUser,
	loginUser,
	getProfile,
	updateProfile,
	changePassword,
	getSystemStats
} from '../controllers/userController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
	registerSchema,
	loginSchema,
	updateProfileSchema,
	changePasswordSchema,
} from '../validation/schemas.js';

const router = express.Router();

router.post('/register', validateRequest(registerSchema), registerUser);
router.post('/login', validateRequest(loginSchema), loginUser);
router.get('/stats', getSystemStats);
router.get('/me', authMiddleware, getProfile);
router.put('/profile', authMiddleware, validateRequest(updateProfileSchema), updateProfile);
router.put('/change-password', authMiddleware, validateRequest(changePasswordSchema), changePassword);

export default router;
