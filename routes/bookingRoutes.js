import express from 'express';
import { bookRide, getMyBookings, getMyBookingsAsDriver, cancelBooking, markCompletedByDriver, markCompletedByPassenger } from '../controllers/bookingController.js';
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

// Mark ride as completed by driver
router.post('/:id/complete-driver', authMiddleware, markCompletedByDriver);

// Mark ride as completed by passenger
router.post('/:id/complete-passenger', authMiddleware, markCompletedByPassenger);

export default router;
