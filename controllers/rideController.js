import mongoose from 'mongoose';
import Ride from '../models/rideModel.js';
import User from '../models/userModel.js';

// Create a new ride (offer a ride)
export const createRide = async (req, res) => {
  try {
    const {
      startLocation,
      endLocation,
      departureTime,
      availableSeats,
      pricePerSeat,
      vehicleInfo,
      description,
      preferences,
      notes,
    } = req.body;

    // Validate required fields
    if (!startLocation || !endLocation || !departureTime || !availableSeats || pricePerSeat === undefined) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided',
      });
    }

    // Validate locations have required fields
    if (
      !startLocation.address ||
      !startLocation.latitude ||
      !startLocation.longitude ||
      !endLocation.address ||
      !endLocation.latitude ||
      !endLocation.longitude
    ) {
      return res.status(400).json({
        success: false,
        message: 'Location must include address and coordinates',
      });
    }

    // Validate seats
    if (availableSeats < 1 || availableSeats > 7) {
      return res.status(400).json({
        success: false,
        message: 'Available seats must be between 1 and 7',
      });
    }

    // Validate departure time is in the future
    if (new Date(departureTime) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Departure time must be in the future',
      });
    }

    const newRide = new Ride({
      driver: req.userId,
      startLocation,
      endLocation,
      departureTime,
      availableSeats,
      pricePerSeat,
      vehicleInfo,
      description,
      preferences: preferences || {},
      notes,
    });

    await newRide.save();
    await newRide.populate('driver', 'name email phone city rating profileImage');

    res.status(201).json({
      success: true,
      message: 'Ride created successfully',
      data: { ride: newRide },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all rides (with filters)
export const getAllRides = async (req, res) => {
  try {
    const {
      startLocation,
      endLocation,
      departureDate,
      minSeats,
      maxPrice,
      status = 'active',
    } = req.query;

    const filter = { rideStatus: status };

    if (startLocation) {
      filter['startLocation.address'] = new RegExp(startLocation, 'i');
    }

    if (endLocation) {
      filter['endLocation.address'] = new RegExp(endLocation, 'i');
    }

    if (departureDate) {
      const startDate = new Date(departureDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(departureDate);
      endDate.setHours(23, 59, 59, 999);
      filter.departureTime = { $gte: startDate, $lte: endDate };
    }

    if (minSeats) {
      filter.availableSeats = { $gte: parseInt(minSeats) };
    }

    if (maxPrice) {
      filter.pricePerSeat = { $lte: parseInt(maxPrice) };
    }

    const rides = await Ride.find(filter)
      .populate('driver', 'name email phone city rating profileImage')
      .sort({ departureTime: 1 });

    res.status(200).json({
      success: true,
      data: { rides },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get ride by ID
export const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('driver', 'name email phone city rating profileImage')
      .populate('passengers.userId', 'name email phone city rating profileImage');

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    res.status(200).json({
      success: true,
      data: { ride },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user's rides (as driver)
export const getMyRides = async (req, res) => {
  try {
    const rides = await Ride.find({ driver: req.userId })
      .populate('driver', 'name email phone city rating profileImage')
      .populate('passengers.userId', 'name email phone city rating profileImage')
      .sort({ departureTime: -1 });

    res.status(200).json({
      success: true,
      data: { rides },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update ride (only driver can update)
export const updateRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Check if user is the driver
    if (ride.driver.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the driver can update this ride',
      });
    }

    // Only allow updates if ride is still active
    if (ride.rideStatus !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a completed or cancelled ride',
      });
    }

    const {
      pricePerSeat,
      availableSeats,
      vehicleInfo,
      description,
      preferences,
      notes,
    } = req.body;

    if (pricePerSeat !== undefined) ride.pricePerSeat = pricePerSeat;
    if (availableSeats !== undefined) {
      if (availableSeats < 1 || availableSeats > 7) {
        return res.status(400).json({
          success: false,
          message: 'Available seats must be between 1 and 7',
        });
      }
      ride.availableSeats = availableSeats;
    }
    if (vehicleInfo) ride.vehicleInfo = { ...ride.vehicleInfo, ...vehicleInfo };
    if (description !== undefined) ride.description = description;
    if (preferences) ride.preferences = { ...ride.preferences, ...preferences };
    if (notes !== undefined) ride.notes = notes;

    await ride.save();
    await ride.populate('driver', 'name email phone city rating profileImage');

    res.status(200).json({
      success: true,
      message: 'Ride updated successfully',
      data: { ride },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Cancel a ride (only driver can cancel)
export const cancelRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Check if user is the driver
    if (ride.driver.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the driver can cancel this ride',
      });
    }

    if (ride.rideStatus !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active rides can be cancelled',
      });
    }

    ride.rideStatus = 'cancelled';
    await ride.save();

    res.status(200).json({
      success: true,
      message: 'Ride cancelled successfully',
      data: { ride },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Search nearby rides (simple version - can be enhanced with geospatial queries)
export const searchRides = async (req, res) => {
  try {
    const {
      startCity,
      endCity,
      departureDate,
      minSeats,
      maxPrice,
    } = req.query;

    const filter = { rideStatus: 'active' };

    if (startCity) {
      filter['startLocation.address'] = new RegExp(startCity, 'i');
    }

    if (endCity) {
      filter['endLocation.address'] = new RegExp(endCity, 'i');
    }

    if (departureDate) {
      const startDate = new Date(departureDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(departureDate);
      endDate.setHours(23, 59, 59, 999);
      filter.departureTime = { $gte: startDate, $lte: endDate };
    }

    // Seats left = availableSeats - seatsBooked
    const seatsExpression = {
      $gte: [
        { $subtract: ['$availableSeats', '$seatsBooked'] },
        parseInt(minSeats || 1),
      ],
    };
    filter.$expr = seatsExpression;

    if (maxPrice) {
      filter.pricePerSeat = { $lte: parseInt(maxPrice) };
    }

    const rides = await Ride.find(filter)
      .populate('driver', 'name email phone city rating profileImage')
      .sort({ pricePerSeat: 1, departureTime: 1 })
      .limit(20);

    res.status(200).json({
      success: true,
      data: { rides, count: rides.length },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
