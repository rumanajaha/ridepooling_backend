import Payment from '../models/paymentModel.js';
import Ride from '../models/rideModel.js';
import User from '../models/userModel.js';
import { getIO } from '../socket/socketHandler.js';

export const createPayment = async (req, res) => {
  try {
    const { rideId, paymentMethod } = req.body;
    const passengerId = req.userId;

    // Only allow UPI payment method
    if (paymentMethod !== 'upi') {
      return res.status(400).json({ message: 'Only UPI payment method is allowed' });
    }

    // Get ride details with driver
    const ride = await Ride.findById(rideId).populate('driver', 'name email phone');
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Check if passenger has booked this ride and get their booking details
    const passengerEntry = ride.passengers.find((p) => p.userId?.toString() === passengerId);
    if (!passengerEntry) {
      return res.status(403).json({ message: 'Only booked passengers can pay for this ride' });
    }

    // Check if both driver and passenger have confirmed completion
    if (!ride.completedByDriver || !passengerEntry.completedByPassenger) {
      return res.status(400).json({ message: 'Both driver and passenger must confirm ride completion before payment' });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      ride: rideId,
      passenger: passengerId,
    });

    if (existingPayment && existingPayment.status !== 'failed') {
      return res.status(400).json({ message: 'Payment already exists for this booking' });
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
      data: payment,
      message: 'Payment initiated via UPI',
      clientSecret: `sk_test_${transactionId}`, // Placeholder for Stripe-like integration
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const { paymentId, transactionId } = req.body;
    const passengerId = req.userId;

    const payment = await Payment.findById(paymentId).populate('ride');
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify payment belongs to user
    if (payment.passenger.toString() !== passengerId) {
      return res.status(403).json({ message: 'Unauthorized payment confirmation' });
    }

    // Simulate payment gateway verification
    // In production, verify with actual payment gateway (Razorpay UPI webhook + signature)
    if (!transactionId.startsWith('TXN_')) {
      return res.status(400).json({ message: 'Invalid transaction ID' });
    }

    if (payment.status === 'completed') {
      return res.status(400).json({ message: 'Payment already completed' });
    }

    // Update payment status
    payment.status = 'completed';
    payment.transactionId = transactionId;
    payment.completedAt = new Date();
    await payment.save();

    // Update passenger payment status in ride
    const ride = await Ride.findById(payment.ride);
    const passengerIndex = ride.passengers.findIndex((p) => p.userId.toString() === passengerId);
    if (passengerIndex !== -1) {
      ride.passengers[passengerIndex].paymentStatus = 'paid';
      ride.passengers[passengerIndex].paymentAmount = payment.amount;
    }

    // Credit driver's wallet (platform-collected escrow credit)
    try {
      const Wallet = (await import('../models/walletModel.js')).default;
      const driverId = payment.driver.toString();
      const driverWallet = await Wallet.createWallet(driverId);
      await driverWallet.addCredit(
        payment.amount,
        'Ride earnings (UPI, platform-collected)',
        ride._id,
        passengerId
      );
    } catch (walletErr) {
      // Wallet errors should not block payment confirmation response
      console.error('Wallet credit error:', walletErr?.message || walletErr);
    }

    // Always increment driver's earnings per passenger payment
    try {
      await User.findByIdAndUpdate(
        ride.driver,
        { $inc: { totalEarnings: payment.amount } },
        { new: true }
      );
    } catch (userErr) {
      console.error('Driver earnings update error:', userErr?.message || userErr);
    }

    // Increment passenger's completed rides count
    try {
      await User.findByIdAndUpdate(
        passengerId,
        { $inc: { completedRides: 1 } },
        { new: true }
      );
    } catch (userErr) {
      console.error('Passenger stats update error:', userErr?.message || userErr);
    }

    // If all passengers have paid, mark ride as completed and increment driver's ride count once
    const allPaid = ride.passengers.every((p) => p.paymentStatus === 'paid');
    if (allPaid && ride.rideStatus !== 'completed') {
      ride.rideStatus = 'completed';
      try {
        await User.findByIdAndUpdate(
          ride.driver,
          { $inc: { completedRides: 1 } },
          { new: true }
        );
      } catch (userErr) {
        console.error('Driver completed rides update error:', userErr?.message || userErr);
      }
    }

    await ride.save();

    // Emit payment-completed event to driver via Socket.IO
    try {
      const io = getIO();
      if (io) {
        const rideId = payment.ride.toString();
        console.log(`\n🔔 Emitting payment-completed event:`);
        console.log(`   Room: ride:${rideId}`);
        console.log(`   Driver ID: ${payment.driver}`);
        console.log(`   Amount: ₹${payment.amount}`);
        console.log(`   Passenger ID: ${passengerId}`);
        
        io.to(`ride:${rideId}`).emit('payment-completed', {
          passengerId,
          amount: payment.amount,
          driverId: payment.driver.toString(),
          rideId,
          timestamp: new Date(),
          message: 'Passenger payment confirmed'
        });
        
        console.log(`✅ Payment-completed event emitted successfully to ride:${rideId}\n`);
      } else {
        console.error('❌ IO instance not available for socket emission');
      }
    } catch (socketErr) {
      console.error('Socket emission error:', socketErr?.message || socketErr);
      // Don't block response if socket emit fails
    }

    res.status(200).json({
      data: payment,
      message: 'Payment confirmed via UPI; earnings credited to driver wallet',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.body;
    const passengerId = req.userId;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify payment belongs to user
    if (payment.passenger.toString() !== passengerId) {
      return res.status(403).json({ message: 'Unauthorized refund request' });
    }

    // Prevent duplicate refunds
    if (payment.status === 'refunded') {
      return res.status(400).json({ message: 'Payment already refunded' });
    }

    // Can only refund completed payments
    if (payment.status !== 'completed') {
      return res.status(400).json({ message: 'Can only refund completed payments' });
    }

    // Check if ride is still active (can refund if booking is cancelled before ride starts)
    const ride = await Ride.findById(payment.ride);
    if (ride && ride.rideStatus !== 'active') {
      return res.status(400).json({ message: 'Cannot refund for completed or cancelled rides' });
    }

    // Update payment status
    payment.status = 'refunded';
    await payment.save();

    res.status(200).json({
      data: payment,
      message: 'Refund processed successfully',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { type } = req.query; // 'passenger' or 'driver'

    const query = type === 'driver' ? { driver: userId } : { passenger: userId };

    const payments = await Payment.find(query)
      .populate('ride', 'startLocation endLocation rideStatus departureTime pricePerSeat')
      .populate('passenger', 'name')
      .populate('driver', 'name')
      .sort({ createdAt: -1 });

    // Calculate summary
    const summary = {
      totalTransactions: payments.length,
      completed: payments.filter((p) => p.status === 'completed').length,
      pending: payments.filter((p) => p.status === 'pending').length,
      refunded: payments.filter((p) => p.status === 'refunded').length,
      totalAmount: payments
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0),
    };

    res.status(200).json({
      data: payments,
      summary,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify user is either passenger or driver
    if (
      payment.passenger._id.toString() !== userId &&
      payment.driver._id.toString() !== userId
    ) {
      return res.status(403).json({ message: 'Unauthorized access to payment details' });
    }

    res.status(200).json({ data: payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
