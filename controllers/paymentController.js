import Payment from '../models/paymentModel.js';
import Ride from '../models/rideModel.js';

export const createPayment = async (req, res) => {
  try {
    const { rideId, paymentMethod } = req.body;
    const passengerId = req.userId;

    // Get ride details
    const ride = await Ride.findById(rideId).populate('driverId');
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Check if passenger has booked this ride
    const isPassenger = ride.passengers.includes(passengerId);
    if (!isPassenger) {
      return res.status(403).json({ message: 'Only passengers can pay for this ride' });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      ride: rideId,
      passenger: passengerId,
    });

    if (existingPayment && existingPayment.status !== 'failed') {
      return res.status(400).json({ message: 'Payment already exists for this booking' });
    }

    // Calculate amount (price per seat)
    const amount = ride.pricePerSeat;

    // Generate transaction ID
    const transactionId = `TXN_${Date.now()}_${passengerId}`;

    // Create payment
    const payment = new Payment({
      ride: rideId,
      passenger: passengerId,
      driver: ride.driverId._id,
      amount,
      paymentMethod,
      transactionId,
      status: 'pending',
    });

    await payment.save();

    // Return payment details for frontend integration with payment gateway
    res.status(201).json({
      data: payment,
      message: 'Payment initiated',
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

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify payment belongs to user
    if (payment.passenger.toString() !== passengerId) {
      return res.status(403).json({ message: 'Unauthorized payment confirmation' });
    }

    // Simulate payment gateway verification
    // In production, verify with actual payment gateway (Stripe, Razorpay, etc)
    if (!transactionId.startsWith('TXN_')) {
      return res.status(400).json({ message: 'Invalid transaction ID' });
    }

    // Update payment status
    payment.status = 'completed';
    payment.transactionId = transactionId;
    payment.completedAt = new Date();
    await payment.save();

    res.status(200).json({
      data: payment,
      message: 'Payment confirmed successfully',
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

    let query = {};
    if (type === 'driver') {
      query = { driver: userId };
    } else {
      query = { passenger: userId };
    }

    const payments = await Payment.find(query)
      .populate('ride', 'origin destination rideStatus')
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
