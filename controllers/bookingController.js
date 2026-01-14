import Ride from '../models/rideModel.js';
import mongoose from 'mongoose';

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
    const rides = await Ride.find({ 'passengers.userId': req.userId })
      .populate('driver', 'name email phone city rating profileImage')
      .populate('passengers.userId', 'name email phone city rating profileImage')
      .sort({ departureTime: -1 });

    const bookings = [];
    rides.forEach((ride) => {
      ride.passengers
        .filter((p) => p.userId && p.userId._id.toString() === req.userId)
        .forEach((p) => {
          bookings.push({
            rideId: ride._id,
            startLocation: ride.startLocation,
            endLocation: ride.endLocation,
            departureTime: ride.departureTime,
            status: p.status,
            seats: p.bookedSeats,
            driver: ride.driver,
            pricePerSeat: ride.pricePerSeat,
            rideStatus: ride.rideStatus,
          });
        });
    });

    return res.status(200).json({ success: true, data: { bookings } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Cancel booking by passenger
export const cancelBooking = async (req, res) => {
  try {
    const rideId = req.params.id;
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const passengerIndex = ride.passengers.findIndex((p) => p.userId.toString() === req.userId);
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
