import Ride from '../models/rideModel.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateRideCode } from '../utils/codeGenerator.js';

const { ObjectId } = mongoose.Types;

// Book seats on a ride
export const bookRide = async (req, res) => {
  try {
    const rideId = req.params.id;
    const seatsRequested = Math.max(1, parseInt(req.body.seats || 1));

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

    const seatsLeft = ride.availableSeats - ride.seatsBooked;
    if (seatsRequested > seatsLeft) {
      return res.status(400).json({ success: false, message: `Only ${seatsLeft} seat(s) left` });
    }

    ride.passengers.push({ userId: req.userId, bookedSeats: seatsRequested, status: 'pending' });
    ride.seatsBooked += seatsRequested;
    await ride.save();
    await ride.populate('passengers.userId', 'name email phone city rating profileImage');

    return res.status(201).json({
      success: true,
      message: 'Ride booked successfully',
      data: {
        ride,
        seats: seatsRequested,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
            pickupCode: p.status === 'accepted' ? ride.pickupCodePlain : null,
            pickupVerified: ride.pickupVerified,
          });
        });
    });

    return res.status(200).json({ success: true, data: { bookings } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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

    return res.status(200).json({ success: true, data: { bookings: driverBookings } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Cancel booking by passenger
export const cancelBooking = async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const passengerIndex = ride.passengers.findIndex((p) => p.userId.toString() === userId.toString());
    if (passengerIndex === -1) {
      return res.status(404).json({ success: false, message: 'Booking not found for this user' });
    }

    const passenger = ride.passengers[passengerIndex];
    ride.seatsBooked = Math.max(0, ride.seatsBooked - (passenger.bookedSeats || 0));
    ride.passengers.splice(passengerIndex, 1);
    await ride.save();

    return res.status(200).json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Accept booking by driver
export const acceptBooking = async (req, res) => {
  try {
    const { rideId, passengerId } = req.params;
    const driverId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId).populate('passengers.userId', 'name email phone');

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== driverId.toString()) {
      return res.status(403).json({ success: false, message: 'Only the driver can accept bookings' });
    }

    const passengerIndex = ride.passengers.findIndex(
      (p) => p.userId._id.toString() === passengerId
    );

    if (passengerIndex === -1) {
      return res.status(404).json({ success: false, message: 'Passenger not found in this ride' });
    }

    if (ride.passengers[passengerIndex].status === 'accepted') {
      return res.status(400).json({ success: false, message: 'Booking already accepted' });
    }

    // Generate ride code word when accepting
    const rideCode = generateRideCode();
    const codeHash = await bcrypt.hash(rideCode, 10);
    
    ride.passengers[passengerIndex].status = 'accepted';
    ride.pickupCodePlain = rideCode; // Store plain for passenger to see
    ride.pickupCodeHash = codeHash;
    ride.pickupCodeExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min expiry
    ride.pickupVerified = false;
    
    await ride.save();

    return res.status(200).json({
      success: true,
      message: 'Booking accepted successfully',
      data: {
        rideCode, // Send to frontend to show passenger
        ride,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Reject booking by driver
export const rejectBooking = async (req, res) => {
  try {
    const { rideId, passengerId } = req.params;
    const driverId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== driverId.toString()) {
      return res.status(403).json({ success: false, message: 'Only the driver can reject bookings' });
    }

    const passengerIndex = ride.passengers.findIndex(
      (p) => p.userId.toString() === passengerId
    );

    if (passengerIndex === -1) {
      return res.status(404).json({ success: false, message: 'Passenger not found in this ride' });
    }

    const passenger = ride.passengers[passengerIndex];
    ride.seatsBooked = Math.max(0, ride.seatsBooked - (passenger.bookedSeats || 0));
    ride.passengers.splice(passengerIndex, 1);
    
    await ride.save();

    return res.status(200).json({
      success: true,
      message: 'Booking rejected',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Verify pickup code
export const verifyPickupCode = async (req, res) => {
  try {
    const rideId = req.params.id;
    const { code } = req.body;
    const driverId = new ObjectId(req.userId);
    
    if (!code) {
      return res.status(400).json({ success: false, message: 'Ride code is required' });
    }

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== driverId.toString()) {
      return res.status(403).json({ success: false, message: 'Only the driver can verify pickup' });
    }

    if (ride.pickupVerified) {
      return res.status(400).json({ success: false, message: 'Pickup already verified' });
    }

    if (!ride.pickupCodeHash) {
      return res.status(400).json({ success: false, message: 'No pickup code set for this ride' });
    }

    // Check expiry
    if (ride.pickupCodeExpiry && new Date() > ride.pickupCodeExpiry) {
      return res.status(400).json({ success: false, message: 'Ride code has expired' });
    }

    // Verify code
    const isValid = await bcrypt.compare(code.trim(), ride.pickupCodeHash);

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid ride code' });
    }

    // Mark as verified and start ride
    ride.pickupVerified = true;
    ride.rideStatus = 'in_progress';
    ride.pickupCodeHash = null; // Invalidate after use
    ride.pickupCodePlain = null;
    
    await ride.save();

    return res.status(200).json({
      success: true,
      message: 'Pickup verified! Ride started.',
      data: {
        rideStatus: ride.rideStatus,
        pickupVerified: true,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Mark ride as completed by driver
export const markCompletedByDriver = async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.driver.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Only the driver can mark the ride as completed' });
    }

    ride.completedByDriver = true;
    
    // Check if ALL passengers have also marked as completed
    const allPassengersCompleted = ride.passengers.every(p => p.completedByPassenger === true);
    
    if (allPassengersCompleted && ride.passengers.length > 0) {
      // Both driver and all passengers are done → trigger payment
      ride.rideStatus = 'payment_pending';
    }
    
    await ride.save();

    return res.status(200).json({ 
      success: true, 
      message: ride.rideStatus === 'payment_pending' 
        ? 'Ride completed! Payment pending.' 
        : 'Marked as completed by driver. Waiting for passengers.',
      data: { 
        completedByDriver: true,
        rideStatus: ride.rideStatus,
        paymentPending: ride.rideStatus === 'payment_pending'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Mark ride as completed by passenger
export const markCompletedByPassenger = async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = new ObjectId(req.userId);
    
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const passengerIndex = ride.passengers.findIndex((p) => p.userId.toString() === userId.toString());
    if (passengerIndex === -1) {
      return res.status(404).json({ success: false, message: 'Booking not found for this user' });
    }

    ride.passengers[passengerIndex].completedByPassenger = true;
    
    // Check if driver has also marked as completed AND all passengers are done
    const allPassengersCompleted = ride.passengers.every(p => p.completedByPassenger === true);
    
    if (ride.completedByDriver && allPassengersCompleted) {
      // Both driver and all passengers are done → trigger payment
      ride.rideStatus = 'payment_pending';
    }
    
    await ride.save();

    return res.status(200).json({ 
      success: true, 
      message: ride.rideStatus === 'payment_pending'
        ? 'Ride completed! Please proceed to payment.'
        : 'Marked as completed by passenger. Waiting for driver.',
      data: { 
        completedByPassenger: true,
        rideStatus: ride.rideStatus,
        paymentPending: ride.rideStatus === 'payment_pending'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
