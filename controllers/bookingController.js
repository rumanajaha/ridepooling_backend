import Ride from '../models/rideModel.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateRideCode } from '../utils/codeGenerator.js';
import { encryptCode, decryptCode } from '../utils/secureCode.js';
import { canTransitionRideStatus } from '../utils/rideStateMachine.js';

const { ObjectId } = mongoose.Types;

// Book seats on a ride
export const bookRide = async (req, res) => {
  try {
    const rideId = req.params.id;
    const parsedSeats = Number(req.body.seats ?? 1);

    if (!Number.isInteger(parsedSeats) || parsedSeats < 1 || parsedSeats > 7) {
      return res.status(400).json({ success: false, message: 'Seats must be an integer between 1 and 7' });
    }

    const seatsRequested = parsedSeats;

    const ride = await Ride.findById(rideId).populate('driver', 'name email phone city rating profileImage');

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.rideStatus !== 'active') {
      return res.status(400).json({ success: false, message: 'Ride is not active' });
    }

    if (new Date(ride.departureTime) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Cannot book a past ride' });
    }

    // Prevent driver from booking own ride
    if (ride.driver.toString() === req.userId) {
      return res.status(400).json({ success: false, message: 'Drivers cannot book their own ride' });
    }

    // Check if already booked
    const existingPassenger = ride.passengers.find((p) => p.userId.toString() === req.userId);
    if (existingPassenger) {
      return res.status(400).json({ success: false, message: 'You have already requested this ride' });
    }

    // Atomic update prevents overselling seats under concurrent booking requests
    const updatedRide = await Ride.findOneAndUpdate(
      {
        _id: rideId,
        rideStatus: 'active',
        departureTime: { $gt: new Date() },
        driver: { $ne: req.userId },
        'passengers.userId': { $ne: req.userId },
        $expr: { $gte: [{ $subtract: ['$availableSeats', '$seatsBooked'] }, seatsRequested] },
      },
      {
        $push: { passengers: { userId: req.userId, bookedSeats: seatsRequested, status: 'pending' } },
        $inc: { seatsBooked: seatsRequested },
      },
      { new: true }
    )
      .populate('driver', 'name email phone city rating profileImage')
      .populate('passengers.userId', 'name email phone city rating profileImage');

    if (!updatedRide) {
      const freshRide = await Ride.findById(rideId);
      if (!freshRide) {
        return res.status(404).json({ success: false, message: 'Ride not found' });
      }

      const freshSeatsLeft = Math.max(0, freshRide.availableSeats - freshRide.seatsBooked);
      if (seatsRequested > freshSeatsLeft) {
        return res.status(400).json({ success: false, message: `Only ${freshSeatsLeft} seat(s) left` });
      }

      return res.status(409).json({ success: false, message: 'Booking request could not be completed. Please try again.' });
    }

    return res.status(201).json({
      success: true,
      message: 'Ride booked successfully',
      requestId: req.requestId,
      data: {
        ride: updatedRide,
        seats: seatsRequested,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to book ride', requestId: req.requestId });
  }
};

// Get bookings for current user (as passenger)
export const getMyBookings = async (req, res) => {
  try {
    const userId = new ObjectId(req.userId);
    
    const rides = await Ride.find({ 'passengers.userId': userId })
      .populate('driver', 'name email phone city rating profileImage')
      .populate('passengers.userId', 'name email phone city rating profileImage')
      .sort({ departureTime: -1 });

    const bookings = [];
    rides.forEach((ride) => {
      ride.passengers
        .filter((p) => p.userId && p.userId._id.toString() === userId.toString())
        .forEach((p) => {
          bookings.push({
            _id: p._id,
            rideId: ride._id,
            startLocation: ride.startLocation,
            endLocation: ride.endLocation,
            departureTime: ride.departureTime,
            status: p.status,
            seats: p.bookedSeats,
            driver: ride.driver,
            pricePerSeat: ride.pricePerSeat,
            rideStatus: ride.rideStatus,
            pickupCode:
              p.status === 'accepted' && !ride.pickupVerified && ride.pickupCodeExpiry > new Date()
                ? decryptCode(ride.pickupCodeEncrypted)
                : null,
            pickupVerified: ride.pickupVerified,
          });
        });
    });

    return res.status(200).json({ success: true, data: { bookings }, requestId: req.requestId });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch bookings', requestId: req.requestId });
  }
};

// Get bookings for current user as driver (their offered rides with passengers)
export const getMyBookingsAsDriver = async (req, res) => {
  try {
    const driverId = new ObjectId(req.userId);

    const rides = await Ride.find({ driver: driverId })
      .populate('driver', 'name email phone city rating profileImage')
      .populate('passengers.userId', 'name email phone city rating profileImage')
      .sort({ departureTime: -1 });

    // Shape data per ride, include passengers list
    const driverBookings = rides.map((ride) => ({
      rideId: ride._id,
      startLocation: ride.startLocation,
      endLocation: ride.endLocation,
      departureTime: ride.departureTime,
      rideStatus: ride.rideStatus,
      completedByDriver: ride.completedByDriver,
      driverCompletedAt: ride.driverCompletedAt,
      pricePerSeat: ride.pricePerSeat,
      driver: ride.driver,
      pickupVerified: ride.pickupVerified,
      passengers: ride.passengers.map((p) => ({
        userId: p.userId?._id,
        name: p.userId?.name,
        email: p.userId?.email,
        phone: p.userId?.phone,
        seats: p.bookedSeats,
        status: p.status,
        completedByPassenger: p.completedByPassenger,
        paymentStatus: p.paymentStatus,
      })),
    }));

    return res.status(200).json({ success: true, data: { bookings: driverBookings }, requestId: req.requestId });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch driver bookings', requestId: req.requestId });
  }
};

// Cancel booking by passenger
export const cancelBooking = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const rideId = req.params.id;
    const userId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId).session(session);

    if (!ride) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const passengerIndex = ride.passengers.findIndex((p) => p.userId.toString() === userId.toString());
    if (passengerIndex === -1) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Booking not found for this user' });
    }

    const passenger = ride.passengers[passengerIndex];
    ride.seatsBooked = Math.max(0, ride.seatsBooked - (passenger.bookedSeats || 0));
    ride.passengers.splice(passengerIndex, 1);
    await ride.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ success: true, message: 'Booking cancelled', requestId: req.requestId });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: 'Failed to cancel booking', requestId: req.requestId });
  }
};

// Accept booking by driver
export const acceptBooking = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { rideId, passengerId } = req.params;
    const driverId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId).populate('passengers.userId', 'name email phone').session(session);

    if (!ride) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== driverId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Only the driver can accept bookings' });
    }

    const passengerIndex = ride.passengers.findIndex((p) => {
      const passengerObjectId = p.userId?._id ? p.userId._id : p.userId;
      return passengerObjectId?.toString() === passengerId;
    });

    if (passengerIndex === -1) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Passenger not found in this ride' });
    }

    if (ride.passengers[passengerIndex].status === 'accepted') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Booking already accepted' });
    }

    // Generate ride code word when accepting
    const rideCode = generateRideCode();
    const codeHash = await bcrypt.hash(rideCode, 10);
    
    ride.passengers[passengerIndex].status = 'accepted';
    ride.pickupCodeEncrypted = encryptCode(rideCode);
    ride.pickupCodeHash = codeHash;
    ride.pickupCodeExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min expiry
    ride.pickupVerified = false;
    
    await ride.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'Booking accepted successfully',
      requestId: req.requestId,
      data: {
        rideCode, // Send to frontend to show passenger
        ride,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: 'Failed to accept booking', requestId: req.requestId });
  }
};

// Reject booking by driver
export const rejectBooking = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { rideId, passengerId } = req.params;
    const driverId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId).session(session);

    if (!ride) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== driverId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Only the driver can reject bookings' });
    }

    const passengerIndex = ride.passengers.findIndex((p) => p.userId?.toString() === passengerId);

    if (passengerIndex === -1) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Passenger not found in this ride' });
    }

    const passenger = ride.passengers[passengerIndex];
    ride.seatsBooked = Math.max(0, ride.seatsBooked - (passenger.bookedSeats || 0));
    ride.passengers.splice(passengerIndex, 1);
    
    await ride.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'Booking rejected',
      requestId: req.requestId,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: 'Failed to reject booking', requestId: req.requestId });
  }
};

// Verify pickup code
export const verifyPickupCode = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const rideId = req.params.id;
    const { code } = req.body;
    const driverId = new ObjectId(req.userId);
    
    if (!code) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Ride code is required' });
    }

    const ride = await Ride.findById(rideId).session(session);

    if (!ride) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== driverId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Only the driver can verify pickup' });
    }

    if (ride.pickupVerified) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Pickup already verified' });
    }

    if (!ride.pickupCodeHash) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'No pickup code set for this ride' });
    }

    // Check expiry
    if (ride.pickupCodeExpiry && new Date() > ride.pickupCodeExpiry) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Ride code has expired' });
    }

    // Verify code
    const isValid = await bcrypt.compare(code.trim(), ride.pickupCodeHash);

    if (!isValid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Invalid ride code' });
    }

    if (!canTransitionRideStatus(ride.rideStatus, 'in_progress')) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: `Cannot start ride from status '${ride.rideStatus}'` });
    }

    // Mark as verified and start ride
    ride.pickupVerified = true;
    ride.rideStatus = 'in_progress';
    ride.pickupCodeHash = null; // Invalidate after use
    ride.pickupCodeEncrypted = null;
    
    await ride.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'Pickup verified! Ride started.',
      requestId: req.requestId,
      data: {
        rideStatus: ride.rideStatus,
        pickupVerified: true,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: 'Failed to verify pickup code', requestId: req.requestId });
  }
};

// Mark ride as completed by driver
export const markCompletedByDriver = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const rideId = req.params.id;
    const userId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId).session(session);

    if (!ride) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Only the driver can mark the ride as completed' });
    }

    if (!['in_progress', 'payment_pending'].includes(ride.rideStatus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: `Cannot complete ride from status '${ride.rideStatus}'` });
    }

    ride.completedByDriver = true;
    ride.driverCompletedAt = new Date();
    
    // Check if ALL passengers have also marked as completed
    const allPassengersCompleted = ride.passengers.every(p => p.completedByPassenger === true);
    
    if (allPassengersCompleted && ride.passengers.length > 0) {
      // Both driver and all passengers are done → trigger payment
      if (!canTransitionRideStatus(ride.rideStatus, 'payment_pending')) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: `Cannot transition ride to payment pending from '${ride.rideStatus}'` });
      }
      ride.rideStatus = 'payment_pending';
    }
    
    await ride.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ 
      success: true, 
      message: ride.rideStatus === 'payment_pending' 
        ? 'Ride completed! Payment pending.' 
        : 'Marked as completed by driver. Waiting for passengers.',
      requestId: req.requestId,
      data: { 
        completedByDriver: true,
        rideStatus: ride.rideStatus,
        paymentPending: ride.rideStatus === 'payment_pending'
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: 'Failed to mark driver completion', requestId: req.requestId });
  }
};

// Force-complete ride by driver after passenger timeout
export const forceCompleteByDriver = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const rideId = req.params.id;
    const userId = new ObjectId(req.userId);
    const timeoutMinutes = Number(process.env.PASSENGER_COMPLETE_TIMEOUT_MINUTES || 30);

    const ride = await Ride.findById(rideId).session(session);

    if (!ride) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Only the driver can force-complete the ride' });
    }

    if (ride.rideStatus !== 'in_progress') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: `Force complete is only allowed from status 'in_progress'` });
    }

    if (!ride.completedByDriver || !ride.driverCompletedAt) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Driver must mark ride complete first before force-completing',
      });
    }

    const elapsedMs = Date.now() - new Date(ride.driverCompletedAt).getTime();
    const requiredMs = timeoutMinutes * 60 * 1000;

    if (elapsedMs < requiredMs) {
      await session.abortTransaction();
      session.endSession();
      const minutesLeft = Math.ceil((requiredMs - elapsedMs) / (60 * 1000));
      return res.status(400).json({
        success: false,
        message: `Please wait ${minutesLeft} more minute(s) before force-completing`,
      });
    }

    // Any accepted passenger who has not confirmed completion is auto-completed after timeout.
    ride.passengers = ride.passengers.map((p) => {
      if (p.status === 'accepted' && !p.completedByPassenger) {
        p.completedByPassenger = true;
        p.status = 'completed';
      }
      return p;
    });

    if (!canTransitionRideStatus(ride.rideStatus, 'payment_pending')) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: `Cannot transition ride to payment pending from '${ride.rideStatus}'` });
    }

    ride.rideStatus = 'payment_pending';
    await ride.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'Ride force-completed. Payment is now pending.',
      requestId: req.requestId,
      data: {
        rideStatus: ride.rideStatus,
        paymentPending: true,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: 'Failed to force-complete ride', requestId: req.requestId });
  }
};

// Mark ride as completed by passenger
export const markCompletedByPassenger = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const rideId = req.params.id;
    const userId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId).session(session);

    if (!ride) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const passengerIndex = ride.passengers.findIndex((p) => p.userId.toString() === userId.toString());
    if (passengerIndex === -1) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Booking not found for this user' });
    }

    if (!['in_progress', 'payment_pending'].includes(ride.rideStatus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: `Cannot complete ride from status '${ride.rideStatus}'` });
    }

    ride.passengers[passengerIndex].completedByPassenger = true;
    ride.passengers[passengerIndex].status = 'completed';
    
    // Check if driver has also marked as completed AND all passengers are done
    const allPassengersCompleted = ride.passengers.every(p => p.completedByPassenger === true);
    
    if (ride.completedByDriver && allPassengersCompleted) {
      // Both driver and all passengers are done → trigger payment
      if (!canTransitionRideStatus(ride.rideStatus, 'payment_pending')) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: `Cannot transition ride to payment pending from '${ride.rideStatus}'` });
      }
      ride.rideStatus = 'payment_pending';
    }
    
    await ride.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ 
      success: true, 
      message: ride.rideStatus === 'payment_pending'
        ? 'Ride completed! Please proceed to payment.'
        : 'Marked as completed by passenger. Waiting for driver.',
      requestId: req.requestId,
      data: { 
        completedByPassenger: true,
        rideStatus: ride.rideStatus,
        paymentPending: ride.rideStatus === 'payment_pending'
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: 'Failed to mark passenger completion', requestId: req.requestId });
  }
};
