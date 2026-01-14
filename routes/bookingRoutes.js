import express from 'express';
import { bookRide, getMyBookings, cancelBooking } from '../controllers/bookingController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Book seats on a ride
router.post('/:id/book', authMiddleware, bookRide);

// Get current user's bookings
router.get('/me', authMiddleware, getMyBookings);

// Cancel a booking
router.delete('/:id', authMiddleware, cancelBooking);

export default router;
