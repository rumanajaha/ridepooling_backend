import express from 'express';
import {
  getWallet,
  getBalance,
  getTransactionHistory,
  processRidePayment,
  addFunds,
} from '../controllers/walletController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  walletTransactionHistorySchema,
  addFundsSchema,
} from '../validation/schemas.js';

const router = express.Router();

// Get user's wallet
router.get('/', authMiddleware, getWallet);

// Get wallet balance
router.get('/balance', authMiddleware, getBalance);

// Get transaction history
router.get('/transactions', authMiddleware, validateRequest(walletTransactionHistorySchema), getTransactionHistory);

// Process payment for a ride
router.post('/pay/:rideId', authMiddleware, validateObjectIdParam('rideId'), processRidePayment);

// Add funds to wallet (for testing/top-up)
router.post('/add-funds', authMiddleware, validateRequest(addFundsSchema), addFunds);

export default router;
