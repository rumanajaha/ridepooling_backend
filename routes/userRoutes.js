import express from 'express';
import {
	registerUser,
	loginUser,
	getProfile,
	updateProfile,
	changePassword,
	uploadKYC,
	verifyUserKYC
} from '../controllers/userController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import upload from '../config/multer.js';
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
router.get('/me', authMiddleware, getProfile);
router.put('/profile', authMiddleware, validateRequest(updateProfileSchema), updateProfile);
router.put('/change-password', authMiddleware, validateRequest(changePasswordSchema), changePassword);

// KYC Document Uploads
const kycUploadMiddleware = upload.fields([
	{ name: 'licensePhoto', maxCount: 1 },
	{ name: 'idPhoto', maxCount: 1 },
	{ name: 'vehiclePhoto', maxCount: 1 },
	{ name: 'platePhoto', maxCount: 1 }
]);

router.post('/kyc', authMiddleware, (req, res, next) => {
	kycUploadMiddleware(req, res, (err) => {
		if (err) {
			return res.status(400).json({
				success: false,
				message: err.message || 'KYC upload failed',
			});
		}

		next();
	});
}, uploadKYC);

// Admin KYC Verification
router.put('/kyc/verify', authMiddleware, verifyUserKYC);
router.patch('/admin/verify-user/:id', authMiddleware, (req, res, next) => {
	req.body.userId = req.params.id;
	next();
}, verifyUserKYC);

export default router;
