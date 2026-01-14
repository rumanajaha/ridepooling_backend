import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
  createPayment,
  confirmPayment,
  refundPayment,
  getPaymentHistory,
  getPaymentDetails,
  getPaymentStats,
} from '../controllers/paymentController.js';

const router = express.Router();

// Create payment (protected)
router.post('/', authMiddleware, createPayment);

// Confirm payment (protected)
router.put('/confirm', authMiddleware, confirmPayment);

// Refund payment (protected)
router.post('/refund', authMiddleware, refundPayment);

// Get payment history (protected)
router.get('/history', authMiddleware, getPaymentHistory);

// Get payment stats/earnings (protected)
router.get('/stats', authMiddleware, getPaymentStats);

// Get payment details (protected)
router.get('/:paymentId', authMiddleware, getPaymentDetails);

export default router;
