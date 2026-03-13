import Wallet from '../models/walletModel.js';
import Ride from '../models/rideModel.js';
import logger from '../utils/logger.js';

// Get user's wallet
export const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.userId });
    
    // Create wallet if doesn't exist
    if (!wallet) {
      wallet = await Wallet.createWallet(req.userId);
    }

    return res.status(200).json({
      success: true,
      data: { wallet },
    });
  } catch (error) {
    logger.error('Failed to fetch wallet', { userId: req.userId, error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet',
    });
  }
};

// Get wallet balance
export const getBalance = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.userId });
    
    if (!wallet) {
      wallet = await Wallet.createWallet(req.userId);
    }

    return res.status(200).json({
      success: true,
      data: { balance: wallet.balance },
    });
  } catch (error) {
    logger.error('Failed to fetch wallet balance', { userId: req.userId, error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet balance',
    });
  }
};

// Get transaction history
export const getTransactionHistory = async (req, res) => {
  try {
    const limit = req.query.limit ?? 50;
    const skip = req.query.skip ?? 0;
    const { type } = req.query;
    
    let wallet = await Wallet.findOne({ userId: req.userId })
      .populate('transactions.rideId', 'startLocation endLocation departureTime')
      .populate('transactions.relatedUserId', 'name email');
    
    if (!wallet) {
      wallet = await Wallet.createWallet(req.userId);
    }

    let transactions = wallet.transactions;
    
    // Filter by type if specified
    if (type && (type === 'credit' || type === 'debit')) {
      transactions = transactions.filter(t => t.type === type);
    }
    
    // Sort by date (newest first) and apply pagination
    transactions = transactions
      .sort((a, b) => b.transactionDate - a.transactionDate)
      .slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      data: { 
        transactions,
        total: wallet.transactions.length,
        balance: wallet.balance,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch wallet transactions', { userId: req.userId, error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history',
    });
  }
};

// Process payment for ride (called after both driver and passenger mark as done)
export const processRidePayment = async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await Ride.findById(rideId)
      .populate('driver', 'name email')
      .populate('passengers.userId', 'name email');

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Check if ride is in payment_pending status
    if (ride.rideStatus !== 'payment_pending') {
      return res.status(400).json({
        success: false,
        message: 'Ride is not ready for payment',
      });
    }

    // Find the passenger (must be the one making payment)
    const passenger = ride.passengers.find(p => p.userId._id.toString() === req.userId);
    if (!passenger) {
      return res.status(403).json({
        success: false,
        message: 'You are not a passenger on this ride',
      });
    }

    // Check if already paid
    if (passenger.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed',
      });
    }

    // Calculate payment amount
    const paymentAmount = ride.pricePerSeat * passenger.bookedSeats;

    // Get/create passenger wallet
    let passengerWallet = await Wallet.findOne({ userId: req.userId });
    if (!passengerWallet) {
      passengerWallet = await Wallet.createWallet(req.userId);
    }

    // Get/create driver wallet
    let driverWallet = await Wallet.findOne({ userId: ride.driver._id });
    if (!driverWallet) {
      driverWallet = await Wallet.createWallet(ride.driver._id);
    }

    // In real implementation, this would integrate with Razorpay
    // For now, we'll simulate the payment flow
    
    // Deduct from passenger (they paid via UPI to platform)
    await passengerWallet.deductAmount(
      paymentAmount,
      `Payment for ride from ${ride.startLocation.address} to ${ride.endLocation.address}`,
      rideId,
      ride.driver._id
    );

    // Credit to driver (platform pays driver)
    await driverWallet.addCredit(
      paymentAmount,
      `Earnings from ride to ${ride.endLocation.address}`,
      rideId,
      req.userId
    );

    // Update passenger payment status
    passenger.paymentStatus = 'paid';
    passenger.paymentAmount = paymentAmount;
    passenger.status = 'completed';

    // Check if all passengers have paid
    const allPassengersPaid = ride.passengers.every(p => p.paymentStatus === 'paid');
    if (allPassengersPaid) {
      ride.rideStatus = 'completed';
    }

    await ride.save();

    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        paymentAmount,
        rideStatus: ride.rideStatus,
        passengerBalance: passengerWallet.balance,
      },
    });
  } catch (error) {
    logger.error('Failed to process ride payment', {
      userId: req.userId,
      rideId: req.params.rideId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to process payment',
    });
  }
};

// Add funds to wallet (for testing/top-up)
export const addFunds = async (req, res) => {
  try {
    const amount = req.body.amount;

    let wallet = await Wallet.findOne({ userId: req.userId });
    if (!wallet) {
      wallet = await Wallet.createWallet(req.userId);
    }

    await wallet.addCredit(
      amount,
      'Wallet top-up',
      null,
      null
    );

    return res.status(200).json({
      success: true,
      message: 'Funds added successfully',
      data: { balance: wallet.balance },
    });
  } catch (error) {
    logger.error('Failed to add wallet funds', { userId: req.userId, error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to add funds',
    });
  }
};
