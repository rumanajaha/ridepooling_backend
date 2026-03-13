import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
  createCashfreeOrder,
  cashfreeWebhook,
  createPayment,
  confirmPayment,
  refundPayment,
  getPaymentHistory,
  getPaymentDetails,
  getPaymentStats,
  getUpiPaymentIntent,
} from '../controllers/paymentController.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  createCashfreeOrderSchema,
  upiIntentSchema,
  createPaymentSchema,
  confirmPaymentSchema,
  refundPaymentSchema,
  paymentHistoryQuerySchema,
} from '../validation/schemas.js';

const router = express.Router();

// Cashfree: create order (protected)
router.post('/create-order', authMiddleware, validateRequest(createCashfreeOrderSchema), createCashfreeOrder);

// Smart UPI: get direct intent link
router.post('/upi-intent', authMiddleware, validateRequest(upiIntentSchema), getUpiPaymentIntent);

// Cashfree: webhook (no auth; signature verified)
// NOTE: Raw body middleware is mounted in server.js for this path
router.post('/webhook', cashfreeWebhook);

// Create payment (protected)
router.post('/', authMiddleware, validateRequest(createPaymentSchema), createPayment);

// Confirm payment (protected)
router.put('/confirm', authMiddleware, validateRequest(confirmPaymentSchema), confirmPayment);

// Refund payment (protected)
router.post('/refund', authMiddleware, validateRequest(refundPaymentSchema), refundPayment);

// Get payment history (protected)
router.get('/history', authMiddleware, validateRequest(paymentHistoryQuerySchema), getPaymentHistory);

// Get payment stats/earnings (protected)
router.get('/stats', authMiddleware, getPaymentStats);

// Get payment details (protected)
router.get('/:paymentId', authMiddleware, validateObjectIdParam('paymentId'), getPaymentDetails);

export default router;
