import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
  createReview,
  getReviewsByRide,
  getReviewsByDriver,
  getDriverAverageRating,
  deleteReview,
} from '../controllers/reviewController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { createReviewSchema } from '../validation/schemas.js';

const router = express.Router();

// Create review (protected)
router.post('/', authMiddleware, validateRequest(createReviewSchema), createReview);

// Get reviews for a ride
router.get('/ride/:rideId', getReviewsByRide);

// Get average rating for a driver
router.get('/driver/:driverId/rating', getDriverAverageRating);

// Get all reviews for a driver
router.get('/driver/:driverId', getReviewsByDriver);

// Delete review (protected)
router.delete('/:reviewId', authMiddleware, deleteReview);

export default router;
