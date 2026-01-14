import express from 'express';
import {
  createRide,
  getAllRides,
  getRideById,
  getMyRides,
  updateRide,
  cancelRide,
  searchRides,
} from '../controllers/rideController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Create a new ride (authenticated users only)
router.post('/', authMiddleware, createRide);

// Get all rides with filters
router.get('/', getAllRides);

// Search rides (with filters)
router.get('/search', searchRides);

// Get user's rides (authenticated)
router.get('/my-rides', authMiddleware, getMyRides);

// Get ride by ID
router.get('/:id', getRideById);

// Update ride (authenticated, driver only)
router.put('/:id', authMiddleware, updateRide);

// Cancel ride (authenticated, driver only)
router.delete('/:id', authMiddleware, cancelRide);

export default router;
