import express from 'express';
import { 
  bookRide, 
  getMyBookings, 
  getMyBookingsAsDriver, 
  cancelBooking, 
  acceptBooking,
  rejectBooking,
  verifyPickupCode,
  markCompletedByDriver, 
  forceCompleteByDriver,
  markCompletedByPassenger 
} from '../controllers/bookingController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { bookRideSchema } from '../validation/schemas.js';

const router = express.Router();

// Book seats on a ride
router.post('/:id/book', authMiddleware, validateRequest(bookRideSchema), validateObjectIdParam('id'), bookRide);

// Get current user's bookings
router.get('/me', authMiddleware, getMyBookings);
// Get bookings for current user as driver (their offered rides with passengers)
router.get('/driver', authMiddleware, getMyBookingsAsDriver);

// Cancel a booking
router.delete('/:id', authMiddleware, validateObjectIdParam('id'), cancelBooking);

// Accept booking by driver
router.post(
  '/:rideId/accept/:passengerId',
  authMiddleware,
  validateObjectIdParam('rideId'),
  validateObjectIdParam('passengerId'),
  acceptBooking
);

// Reject booking by driver
router.post(
  '/:rideId/reject/:passengerId',
  authMiddleware,
  validateObjectIdParam('rideId'),
  validateObjectIdParam('passengerId'),
  rejectBooking
);

// Verify pickup code
router.post('/:id/verify-pickup', authMiddleware, validateObjectIdParam('id'), verifyPickupCode);

// Mark ride as completed by driver
router.post('/:id/complete-driver', authMiddleware, validateObjectIdParam('id'), markCompletedByDriver);

// Force-complete ride after timeout if passengers don't complete
router.post('/:id/force-complete-driver', authMiddleware, validateObjectIdParam('id'), forceCompleteByDriver);

// Mark ride as completed by passenger
router.post('/:id/complete-passenger', authMiddleware, validateObjectIdParam('id'), markCompletedByPassenger);

export default router;
