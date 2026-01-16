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
  markCompletedByPassenger 
} from '../controllers/bookingController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Book seats on a ride
router.post('/:id/book', authMiddleware, bookRide);

// Get current user's bookings
router.get('/me', authMiddleware, getMyBookings);
// Get bookings for current user as driver (their offered rides with passengers)
router.get('/driver', authMiddleware, getMyBookingsAsDriver);

// Cancel a booking
router.delete('/:id', authMiddleware, cancelBooking);

// Accept booking by driver
router.post('/:rideId/accept/:passengerId', authMiddleware, acceptBooking);

// Reject booking by driver
router.post('/:rideId/reject/:passengerId', authMiddleware, rejectBooking);

// Verify pickup code
router.post('/:id/verify-pickup', authMiddleware, verifyPickupCode);

// Mark ride as completed by driver
router.post('/:id/complete-driver', authMiddleware, markCompletedByDriver);

// Mark ride as completed by passenger
router.post('/:id/complete-passenger', authMiddleware, markCompletedByPassenger);

export default router;
