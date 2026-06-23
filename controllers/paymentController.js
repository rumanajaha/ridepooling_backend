import Payment from '../models/paymentModel.js';
import Ride from '../models/rideModel.js';
import User from '../models/userModel.js';
import Wallet from '../models/walletModel.js';
import mongoose from 'mongoose';
import { getIO } from '../socket/socketHandler.js';
import axios from 'axios';
import crypto from 'crypto';
import { CASHFREE, getAuthHeaders } from '../config/cashfree.js';
import { canTransitionRideStatus } from '../utils/rideStateMachine.js';
import logger from '../utils/logger.js';
import locationService from '../services/locationService.js';

const CASHFREE_REQUEST_TIMEOUT_MS = Number(process.env.CASHFREE_TIMEOUT_MS || 10000);

// --- Cashfree PG: Create Order (UPI only) - Production Ready ---
export const createCashfreeOrder = async (req, res) => {
  try {
    const { rideId } = req.body;
    const passengerId = req.userId;

    // 1. VALIDATE INPUTS
    if (!rideId || !passengerId) {
      return res.status(400).json({ success: false, message: 'Missing rideId or passenger info' });
    }

    // 2. FETCH & VALIDATE RIDE
    const ride = await Ride.findById(rideId).populate('driver', 'name email phone');
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    // 3. VALIDATE PASSENGER BOOKING
    const passengerEntry = ride.passengers.find((p) => p.userId?.toString() === passengerId);
    if (!passengerEntry) {
      return res.status(403).json({ success: false, message: 'You are not booked on this ride' });
    }

    // 4. VALIDATE BOTH COMPLETED RIDE
    if (!ride.completedByDriver) {
      return res.status(400).json({ success: false, message: 'Driver has not completed the ride yet' });
    }
    if (!passengerEntry.completedByPassenger) {
      return res.status(400).json({ success: false, message: 'You must mark ride as complete first' });
    }

    // 5. CHECK FOR DUPLICATE PAYMENT
    const existingPayment = await Payment.findOne({
      ride: rideId,
      passenger: passengerId,
      status: { $in: ['processing', 'completed'] }
    });
    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'Payment already in progress for this booking' });
    }

    // 6. CALCULATE AMOUNT
    const bookedSeats = passengerEntry.bookedSeats || 1;
    const amount = Math.round(Number(ride.pricePerSeat) * Number(bookedSeats));

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    // 7. GET PASSENGER DETAILS
    const passengerUser = await User.findById(passengerId).select('email name phone');
    const customerEmail = passengerUser?.email || 'user@ridepooling.com';
    const customerPhone = passengerUser?.phone || '9999999999';

    // 8. CREATE ORDER ID
    const orderId = `${rideId}_${passengerId}_${Date.now()}`;

    // 9. PREPARE CASHFREE PAYLOAD
    const payload = {
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: passengerId.toString(),
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment-callback?order_id=${orderId}`,
        notify_url: `${process.env.BACKEND_URL || 'http://localhost:5003'}/api/payments/webhook`,
      },
    };

    // 10. CALL CASHFREE API
    const cashfreeUrl = `${CASHFREE.baseUrl}/orders`;
    logger.info('Creating Cashfree order', {
      requestId: req.requestId,
      rideId,
      passengerId,
      amount,
      orderId,
    });

    const headers = getAuthHeaders();
    const response = await axios.post(cashfreeUrl, payload, {
      headers,
      timeout: CASHFREE_REQUEST_TIMEOUT_MS,
    });

    if (!response.data?.payment_session_id) {
      throw new Error('No payment_session_id in Cashfree response');
    }

    const { payment_session_id } = response.data;

    // 11. SAVE PAYMENT RECORD
    const payment = await Payment.create({
      ride: rideId,
      passenger: passengerId,
      driver: ride.driver._id,
      amount,
      currency: 'INR',
      status: 'processing',
      paymentMethod: 'upi',
      paymentGateway: 'cashfree',
      orderId,
      paymentSessionId: payment_session_id,
    });

    // 12. UPDATE RIDE STATUS
    if (ride.rideStatus !== 'payment_pending') {
      ride.rideStatus = 'payment_pending';
      await ride.save();
    }

    logger.info('Cashfree session created', {
      requestId: req.requestId,
      orderId,
      paymentSessionId: payment_session_id,
    });

    // 13. SEND RESPONSE
    return res.status(201).json({
      success: true,
      data: {
        paymentSessionId: payment_session_id,
        orderId,
        amount,
        environment: CASHFREE.env,
      },
      message: 'Payment session created successfully',
      requestId: req.requestId,
    });

  } catch (err) {
    logger.error('Failed to create Cashfree order', {
      requestId: req.requestId,
      userId: req.userId,
      error: err.message,
      status: err.response?.status,
    });
    
    if (err.response?.data) {
      return res.status(err.response.status || 502).json({
        success: false,
        message: err.response.data?.message || 'Payment service error',
        requestId: req.requestId,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create payment session',
      requestId: req.requestId,
    });
  }
};

// --- Smart UPI: Direct Intent Link Generation ---
export const getUpiPaymentIntent = async (req, res) => {
  try {
    const { rideId } = req.body;
    const passengerId = req.userId;

    const ride = await Ride.findById(rideId).populate('driver', 'name upiId phone');
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const passengerEntry = ride.passengers.find((p) => p.userId?.toString() === passengerId);
    if (!passengerEntry) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Not a passenger' });
    }

    if (!ride.driver.upiId) {
      return res.status(400).json({ success: false, message: 'Driver has not set up a UPI ID for direct payment' });
    }

    // Calculate amount
    const amt = Math.round(Number(ride.pricePerSeat) * (passengerEntry.bookedSeats || 1));
    const transactionId = `URL_${rideId.slice(-6)}_${Date.now().toString().slice(-6)}`;
    
    // Construct UPI Intent Link
    // format: upi://pay?pa=VPA&pn=NAME&am=AMOUNT&tr=TXNID&tn=NOTE&cu=INR
    const upiLink = `upi://pay?pa=${ride.driver.upiId}&pn=${encodeURIComponent(ride.driver.name)}&am=${amt}&tr=${transactionId}&tn=${encodeURIComponent(`Ride payment for ${rideId.slice(-6)}`)}&cu=INR`;

    // Initialize a pending payment record for tracking
    await Payment.create({
      ride: rideId,
      passenger: passengerId,
      driver: ride.driver._id,
      amount: amt,
      status: 'pending',
      paymentMethod: 'upi',
      paymentGateway: 'direct_upi',
      transactionId: transactionId,
    });

    res.status(200).json({
      success: true,
      data: {
        upiLink,
        amount: amt,
        receiverName: ride.driver.name,
        receiverUpi: ride.driver.upiId,
      }
    });
  } catch (error) {
    logger.error('Failed to generate UPI intent', { error: error.message });
    res.status(500).json({ success: false, message: 'Server error generating payment link' });
  }
};

// --- Cashfree PG: Webhook ---
export const cashfreeWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'] || req.headers['x-verify'];
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    // Verify HMAC SHA256 signature
    const hmac = crypto.createHmac('sha256', CASHFREE.webhookSecret);
    hmac.update(rawBody);
    const expected = hmac.digest('base64');

    if (!signature || signature !== expected) {
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(rawBody);
    // Cashfree PG sends different payloads; normalize
    const orderId = event?.data?.order?.order_id || event?.order_id || event?.data?.order_id || event?.order?.order_id;
    const orderStatus = event?.data?.order?.order_status || event?.order_status || event?.data?.order_status;
    const txAmount = Number(event?.data?.order?.order_amount || event?.order_amount || 0);

    if (!orderId) return res.status(400).send('Missing order_id');

    let payment = await Payment.findOne({ orderId });
    if (!payment) return res.status(404).send('Payment not found');

    // Validate amount
    if (txAmount && Number(payment.amount) !== txAmount) {
      logger.warn('Cashfree amount mismatch', {
        orderId,
        webhookAmount: txAmount,
        expectedAmount: payment.amount,
      });
    }

    if (orderStatus === 'PAID' || orderStatus === 'SUCCESS' || event?.type === 'PAYMENT_SUCCESS') {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const dbPayment = await Payment.findOne({ orderId }).session(session);
        if (!dbPayment) throw new Error('PAYMENT_NOT_FOUND');

        if (dbPayment.status === 'completed') {
          logger.info('Payment already completed, skipping webhook processing', { orderId });
          await session.commitTransaction();
          session.endSession();
          return res.status(200).send('OK');
        }

        dbPayment.status = 'completed';
        dbPayment.completedAt = new Date();
        await dbPayment.save({ session });
        payment = dbPayment;

        const ride = await Ride.findById(payment.ride).session(session);
        if (!ride) throw new Error('Ride not found while processing payment webhook');

        const pIdx = ride.passengers.findIndex((p) => p.userId.toString() === payment.passenger.toString());
        if (pIdx !== -1) {
          ride.passengers[pIdx].paymentStatus = 'paid';
          ride.passengers[pIdx].paymentAmount = payment.amount;
        }

        const allPaid = ride.passengers.every((p) => p.paymentStatus === 'paid');
        if (allPaid) {
          if (!canTransitionRideStatus(ride.rideStatus, 'completed')) {
            throw new Error(`Invalid ride status transition from '${ride.rideStatus}' to 'completed'`);
          }
          ride.rideStatus = 'completed';
        }
        await ride.save({ session });

        await Wallet.findOneAndUpdate(
          { userId: payment.driver },
          {
            $setOnInsert: { userId: payment.driver, balance: 0 },
            $inc: { balance: payment.amount },
            $push: {
              transactions: {
                type: 'credit',
                amount: payment.amount,
                description: 'Ride earnings (UPI via Cashfree)',
                rideId: payment.ride,
                relatedUserId: payment.passenger,
                status: 'completed',
                transactionDate: new Date(),
              },
            },
          },
          { upsert: true, session }
        );

        await session.commitTransaction();
      } catch (txErr) {
        await session.abortTransaction();
        throw txErr;
      } finally {
        session.endSession();
      }

        // Emit socket event to ride room (driver + passenger listeners)
        try {
          const io = getIO();
          if (io) {
            const rideId = payment.ride.toString();
            io.to(`ride:${rideId}`).emit('payment-completed', {
              passengerId: payment.passenger.toString(),
              amount: payment.amount,
              driverId: payment.driver.toString(),
              rideId,
              timestamp: new Date(),
              message: 'Passenger payment confirmed (Cashfree)',
            });

            if (allPaid) {
              await locationService.clearRideData(rideId);
              io.to(`ride:${rideId}`).emit('ride-finalized', {
                rideId,
                timestamp: new Date(),
                message: 'Ride finalized and live tracking cleaned up',
              });
            }
          }
        } catch (sErr) {
          logger.error('Socket emit failed in payment webhook', {
            orderId,
            error: sErr?.message || String(sErr),
          });
        }
      }
      return res.status(200).send('OK');

    if (orderStatus === 'FAILED' || event?.type === 'PAYMENT_FAILED') {
      payment.status = 'failed';
      await payment.save();
      return res.status(200).send('OK');
    }

    // Ignore other events
    return res.status(200).send('IGNORED');
  } catch (err) {
    logger.error('Cashfree webhook processing failed', { error: err.message });
    return res.status(500).send('ERROR');
  }
};

export const createPayment = async (req, res) => {
  try {
    const { rideId, paymentMethod } = req.body;
    const passengerId = req.userId;

    // Only allow UPI payment method
    if (paymentMethod !== 'upi') {
      return res.status(400).json({ success: false, message: 'Only UPI payment method is allowed' });
    }

    // Get ride details with driver
    const ride = await Ride.findById(rideId).populate('driver', 'name email phone');
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    // Check if passenger has booked this ride and get their booking details
    const passengerEntry = ride.passengers.find((p) => p.userId?.toString() === passengerId);
    if (!passengerEntry) {
      return res.status(403).json({ success: false, message: 'Only booked passengers can pay for this ride' });
    }

    // Check if both driver and passenger have confirmed completion
    if (!ride.completedByDriver || !passengerEntry.completedByPassenger) {
      return res.status(400).json({ success: false, message: 'Both driver and passenger must confirm ride completion before payment' });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      ride: rideId,
      passenger: passengerId,
    });

    if (existingPayment && existingPayment.status !== 'failed') {
      return res.status(400).json({ success: false, message: 'Payment already exists for this booking' });
    }

    // Calculate amount based on seats booked for this passenger
    const bookedSeats = passengerEntry.bookedSeats || 1;
    const amount = ride.pricePerSeat * bookedSeats;

    // Generate transaction ID
    const transactionId = `TXN_${Date.now()}_${passengerId}`;

    // Create payment
    const payment = new Payment({
      ride: rideId,
      passenger: passengerId,
      driver: ride.driver,
      amount,
      paymentMethod,
      transactionId,
      status: 'pending',
    });

    await payment.save();

    // Return payment details for frontend integration with payment gateway
    res.status(201).json({
      success: true,
      data: payment,
      message: 'Payment initiated via UPI',
      clientSecret: `sk_test_${transactionId}`, // Placeholder for Stripe-like integration
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error('Failed to create payment', { requestId: req.requestId, userId: req.userId, error: err.message });
    res.status(500).json({ success: false, message: 'Failed to create payment', requestId: req.requestId });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const { paymentId, transactionId } = req.body;
    const passengerId = req.userId;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Verify payment belongs to user
    if (payment.passenger.toString() !== passengerId) {
      return res.status(403).json({ success: false, message: 'Unauthorized payment confirmation' });
    }

    // Validate payment with gateway where possible; otherwise reject insecure manual confirmation
    if (payment.orderId) {
      const verifyUrl = `${CASHFREE.baseUrl}/orders/${payment.orderId}`;
      const verifyResponse = await axios.get(verifyUrl, {
        headers: getAuthHeaders(),
        timeout: CASHFREE_REQUEST_TIMEOUT_MS,
      });

      const orderStatus = verifyResponse?.data?.order_status;
      if (!(orderStatus === 'PAID' || orderStatus === 'SUCCESS')) {
        return res.status(400).json({ success: false, message: 'Gateway payment not completed yet' });
      }
    } else if (!transactionId || !transactionId.startsWith('TXN_')) {
      return res.status(400).json({ success: false, message: 'Invalid transaction ID' });
    } else if (process.env.ALLOW_MANUAL_PAYMENT_CONFIRM !== 'true') {
      return res.status(400).json({ success: false, message: 'Manual confirmation is disabled. Use payment gateway verification.' });
    }

    const session = await mongoose.startSession();
    let ride;
    try {
      session.startTransaction();

      // Fetch payment inside the session to prevent race conditions
      const dbPayment = await Payment.findById(paymentId).session(session);
      if (!dbPayment) {
        throw new Error('PAYMENT_NOT_FOUND');
      }

      if (dbPayment.status === 'completed') {
        throw new Error('PAYMENT_ALREADY_COMPLETED');
      }

      dbPayment.status = 'completed';
      dbPayment.transactionId = transactionId;
      dbPayment.completedAt = new Date();
      await dbPayment.save({ session });

      // Copy values back to outer reference for subsequent code/response
      payment.status = dbPayment.status;
      payment.transactionId = dbPayment.transactionId;
      payment.completedAt = dbPayment.completedAt;

      ride = await Ride.findById(payment.ride).session(session);
      if (!ride) {
        throw new Error('Ride not found');
      }

      const passengerIndex = ride.passengers.findIndex((p) => p.userId.toString() === passengerId);
      if (passengerIndex !== -1) {
        ride.passengers[passengerIndex].paymentStatus = 'paid';
        ride.passengers[passengerIndex].paymentAmount = payment.amount;
      }

      await Wallet.findOneAndUpdate(
        { userId: ride.driver },
        {
          $setOnInsert: { userId: ride.driver, balance: 0 },
          $inc: { balance: payment.amount },
          $push: {
            transactions: {
              type: 'credit',
              amount: payment.amount,
              description: 'Ride earnings (UPI, platform-collected)',
              rideId: ride._id,
              relatedUserId: passengerId,
              status: 'completed',
              transactionDate: new Date(),
            },
          },
        },
        { upsert: true, session }
      );

      await User.findByIdAndUpdate(
        ride.driver,
        { $inc: { totalEarnings: payment.amount } },
        { session }
      );

      await User.findByIdAndUpdate(
        passengerId,
        { $inc: { completedRides: 1 } },
        { session }
      );

      const allPaid = ride.passengers.every((p) => p.paymentStatus === 'paid');
      if (allPaid && ride.rideStatus !== 'completed') {
        if (!canTransitionRideStatus(ride.rideStatus, 'completed')) {
          throw new Error(`Invalid ride status transition from '${ride.rideStatus}' to 'completed'`);
        }
        ride.rideStatus = 'completed';
        await User.findByIdAndUpdate(
          ride.driver,
          { $inc: { completedRides: 1 } },
          { session }
        );
      }

      await ride.save({ session });
      await session.commitTransaction();
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    // Emit payment-completed event to driver via Socket.IO
    try {
      const io = getIO();
      if (io) {
        const rideId = payment.ride.toString();
        logger.info('Emitting payment-completed socket event', {
          requestId: req.requestId,
          room: `ride:${rideId}`,
          driverId: payment.driver.toString(),
          passengerId,
          amount: payment.amount,
        });
        
        io.to(`ride:${rideId}`).emit('payment-completed', {
          passengerId,
          amount: payment.amount,
          driverId: payment.driver.toString(),
          rideId,
          timestamp: new Date(),
          message: 'Passenger payment confirmed'
        });

        if (ride?.rideStatus === 'completed') {
          await locationService.clearRideData(rideId);
          io.to(`ride:${rideId}`).emit('ride-finalized', {
            rideId,
            timestamp: new Date(),
            message: 'Ride finalized and live tracking cleaned up',
          });
        }
        
        logger.info('Payment-completed socket event emitted', { room: `ride:${rideId}` });
      } else {
        logger.error('Socket IO instance unavailable for payment emission', { requestId: req.requestId });
      }
    } catch (socketErr) {
      logger.error('Socket emission error while confirming payment', {
        requestId: req.requestId,
        error: socketErr?.message || String(socketErr),
      });
      // Don't block response if socket emit fails
    }

    res.status(200).json({
      success: true,
      data: payment,
      message: 'Payment confirmed via UPI; earnings credited to driver wallet',
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error('Failed to confirm payment', { requestId: req.requestId, userId: req.userId, error: err.message });
    if (err.message === 'PAYMENT_ALREADY_COMPLETED') {
      return res.status(400).json({ success: false, message: 'Payment already completed', requestId: req.requestId });
    }
    if (err.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Payment not found', requestId: req.requestId });
    }
    res.status(500).json({ success: false, message: 'Failed to confirm payment', requestId: req.requestId });
  }
};

export const refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.body;
    const passengerId = req.userId;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Verify payment belongs to user
    if (payment.passenger.toString() !== passengerId) {
      return res.status(403).json({ success: false, message: 'Unauthorized refund request' });
    }

    // Prevent duplicate refunds
    if (payment.status === 'refunded') {
      return res.status(400).json({ success: false, message: 'Payment already refunded' });
    }

    // Can only refund completed payments
    if (payment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only refund completed payments' });
    }

    // Check if ride is still active (can refund if booking is cancelled before ride starts)
    const ride = await Ride.findById(payment.ride);
    if (ride && ride.rideStatus !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot refund for completed or cancelled rides' });
    }

    // Update payment status
    payment.status = 'refunded';
    await payment.save();

    res.status(200).json({
      success: true,
      data: payment,
      message: 'Refund processed successfully',
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error('Failed to refund payment', { requestId: req.requestId, userId: req.userId, error: err.message });
    res.status(500).json({ success: false, message: 'Failed to refund payment', requestId: req.requestId });
  }
};

export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const normalizedType = (req.query?.type || 'passenger').toString().toLowerCase();

    if (!['driver', 'passenger'].includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment history type',
        requestId: req.requestId,
      });
    }

    const query = normalizedType === 'driver' ? { driver: userId } : { passenger: userId };

    let payments;
    try {
      payments = await Payment.find(query)
        .populate('ride', 'startLocation endLocation rideStatus departureTime pricePerSeat')
        .populate('passenger', 'name')
        .populate('driver', 'name')
        .sort({ createdAt: -1 });
    } catch (populateErr) {
      // Fallback for legacy/bad records that can break populate casting.
      logger.warn('Payment history populate fallback used', {
        requestId: req.requestId,
        userId: req.userId,
        error: populateErr.message,
      });

      payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .lean();
    }

    // Calculate summary
    const summary = {
      totalTransactions: payments.length,
      completed: payments.filter((p) => p.status === 'completed').length,
      pending: payments.filter((p) => p.status === 'pending').length,
      refunded: payments.filter((p) => p.status === 'refunded').length,
      totalAmount: payments
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0),
    };

    res.status(200).json({
      success: true,
      data: payments,
      summary,
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error('Failed to fetch payment history', { requestId: req.requestId, userId: req.userId, error: err.message });
    return res.status(200).json({
      success: true,
      data: [],
      summary: {
        totalTransactions: 0,
        completed: 0,
        pending: 0,
        refunded: 0,
        totalAmount: 0,
      },
      warning: 'Payment history temporarily unavailable',
      requestId: req.requestId,
    });
  }
};

export const getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.userId;

    const payment = await Payment.findById(paymentId)
      .populate('ride')
      .populate('passenger', 'name email phone')
      .populate('driver', 'name email phone');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Verify user is either passenger or driver
    if (
      payment.passenger._id.toString() !== userId &&
      payment.driver._id.toString() !== userId
    ) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to payment details' });
    }

    res.status(200).json({ success: true, data: payment, requestId: req.requestId });
  } catch (err) {
    logger.error('Failed to fetch payment details', {
      requestId: req.requestId,
      userId: req.userId,
      paymentId: req.params.paymentId,
      error: err.message,
    });
    res.status(500).json({ success: false, message: 'Failed to fetch payment details', requestId: req.requestId });
  }
};

export const getPaymentStats = async (req, res) => {
  try {
    const userId = req.userId;

    // Driver earnings
    const driverPayments = await Payment.find({
      driver: userId,
      status: 'completed',
    });

    const totalEarnings = driverPayments.reduce((sum, p) => sum + p.amount, 0);
    const completedRides = driverPayments.length;

    // Passenger spending
    const passengerPayments = await Payment.find({
      passenger: userId,
      status: 'completed',
    });

    const totalSpent = passengerPayments.reduce((sum, p) => sum + p.amount, 0);
    const bookedRides = passengerPayments.length;

    res.status(200).json({
      success: true,
      data: {
        driver: {
          totalEarnings,
          completedRides,
          averagePerRide: completedRides > 0 ? (totalEarnings / completedRides).toFixed(2) : 0,
        },
        passenger: {
          totalSpent,
          bookedRides,
          averagePerRide: bookedRides > 0 ? (totalSpent / bookedRides).toFixed(2) : 0,
        },
      },
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error('Failed to fetch payment stats', { requestId: req.requestId, userId: req.userId, error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch payment stats', requestId: req.requestId });
  }
};
