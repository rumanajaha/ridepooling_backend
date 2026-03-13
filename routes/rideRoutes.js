import express from 'express';
import {
  createRide,
  getAllRides,
  getRideById,
  getMyRides,
  updateRide,
  cancelRide,
  searchRides,
  getFareEstimateController,
} from '../controllers/rideController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { createRideSchema } from '../validation/schemas.js';

const router = express.Router();

// Create a new ride (authenticated users only)
router.post('/', authMiddleware, validateRequest(createRideSchema), createRide);

// Get all rides with filters
router.get('/', getAllRides);

// Search rides (with filters)
router.get('/search', searchRides);

// Get fare estimate
router.post('/estimate', authMiddleware, getFareEstimateController);

// Get user's rides (authenticated)
router.get('/my-rides', authMiddleware, getMyRides);

// Get ride by ID
router.get('/:id', authMiddleware, validateObjectIdParam('id'), getRideById);

// Update ride (authenticated, driver only)
router.put('/:id', authMiddleware, validateObjectIdParam('id'), updateRide);

// Cancel ride (authenticated, driver only)
router.delete('/:id', authMiddleware, validateObjectIdParam('id'), cancelRide);

export default router;
