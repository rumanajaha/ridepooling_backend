import Ride from '../models/rideModel.js';
import User from '../models/userModel.js';
import { calculateDistance } from '../utils/haversine.js';
import { getRouteEstimate } from '../services/fareService.js';

// Create a new ride (offer a ride)
export const createRide = async (req, res) => {
  try {
    const {
      startLocation,
      endLocation,
      departureTime, // Keep departureTime for validation, will derive date/time if needed
      availableSeats, // Renamed to seats in the snippet, but keeping for now
      pricePerSeat, // Renamed to price in the snippet, but keeping for now
      vehicleInfo,
      description,
      preferences,
      notes,
      // New fields implied by snippet
      seats, // Assuming this replaces availableSeats
      price, // Assuming this replaces pricePerSeat
      userPreference,
    } = req.body;

    const effectiveSeats = Number(seats ?? availableSeats);
    const effectivePrice = Number(price ?? pricePerSeat);

    // Validate required fields
    if (!startLocation || !endLocation || !departureTime || !Number.isFinite(effectiveSeats) || !Number.isFinite(effectivePrice)) {
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
    if (effectiveSeats < 1 || effectiveSeats > 7) {
      return res.status(400).json({
        success: false,
        message: 'Available seats must be between 1 and 7',
      });
    }

    // Validate departure time is in the future
    const departureDateObj = new Date(departureTime);
    if (departureDateObj <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Departure time must be in the future',
      });
    }

    // Fetch driver's user data for vehicle info if needed
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // KYC check removed

    // Generate Fare Estimate
    const fareEstimate = await getRouteEstimate(startLocation, endLocation);

    const newRide = new Ride({
      driver: req.userId,
      startLocation: {
        ...startLocation,
        coordinates: {
          type: 'Point',
          coordinates: [Number(startLocation.longitude), Number(startLocation.latitude)],
        },
      },
      endLocation: {
        ...endLocation,
        coordinates: {
          type: 'Point',
          coordinates: [Number(endLocation.longitude), Number(endLocation.latitude)],
        },
      },
      departureTime, // Using the original departureTime directly
      availableSeats: effectiveSeats,
      pricePerSeat: effectivePrice > 0 ? effectivePrice : fareEstimate.totalFare,
      fareBreakdown: fareEstimate,
      vehicleInfo: {
        ...vehicleInfo,
        // Fallback to user's primary vehicle if info missing
        make: vehicleInfo?.make || user.vehicles.find(v => v.isPrimary)?.make,
        model: vehicleInfo?.model || user.vehicles.find(v => v.isPrimary)?.model,
        licensePlate: vehicleInfo?.licensePlate || user.vehicles.find(v => v.isPrimary)?.licensePlate,
      },
      userPreference: userPreference || {}, // Assuming userPreference is a new field
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

// Get all rides (MARKETPLACE MODEL - shows ALL active rides with optional filters)
export const getAllRides = async (req, res) => {
  try {
    const {
      startLocation,
      endLocation,
      departureDate,
      minSeats,
      maxPrice,
      status = 'active',
      latitude,
      longitude,
      maxDistanceKm,
      destLatitude,
      destLongitude,
    } = req.query;

    // CORE RULE: Always start with active rides and future departures
    const filter = {
      rideStatus: status,
      departureTime: { $gte: new Date() } // Only future rides
    };

    // OPTIONAL FILTERS (not exact matches)
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
      // Check actual available seats (availableSeats - seatsBooked)
      filter.$expr = {
        $gte: [{ $subtract: ['$availableSeats', '$seatsBooked'] }, parseInt(minSeats)],
      };
    }

    if (maxPrice) {
      filter.pricePerSeat = { $lte: parseInt(maxPrice) };
    }

    if (latitude && longitude) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const maxKm = Number(maxDistanceKm || 25);

      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(maxKm)) {
        const radiusInRadians = maxKm / 6378.1;
        filter['startLocation.coordinates'] = {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusInRadians],
          },
        };
      }
    }

    if (destLatitude && destLongitude) {
      const destLat = Number(destLatitude);
      const destLng = Number(destLongitude);
      const maxKm = Number(maxDistanceKm || 25);

      if (Number.isFinite(destLat) && Number.isFinite(destLng) && Number.isFinite(maxKm)) {
        const radiusInRadians = maxKm / 6378.1;
        filter['endLocation.coordinates'] = {
          $geoWithin: {
            $centerSphere: [[destLng, destLat], radiusInRadians],
          },
        };
      }
    }

    let rides = await Ride.find(filter)
      .populate('driver', 'name city rating profileImage')
      .sort({ departureTime: 1 });

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

    const isDriver = ride.driver?._id?.toString() === req.userId;
    const isPassenger = ride.passengers.some((p) => p.userId?._id?.toString() === req.userId);
    const hasAcceptedBooking = ride.passengers.some(
      (p) => p.userId?._id?.toString() === req.userId && ['accepted', 'completed'].includes(p.status)
    );

    // Hide sensitive driver contact details unless requester is a participant with accepted/completed status or driver
    if (!isDriver && !hasAcceptedBooking && ride.driver) {
      ride.driver.phone = "********" + ride.driver.phone.slice(-3);
      ride.driver.email = undefined;
    }

    if (!isDriver && !isPassenger) {
      // Public requesters can view ride basics, but passenger list identity is hidden.
      ride.passengers = [];
    }

    res.status(200).json({
      success: true,
      data: ride,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Fare Estimate
export const getFareEstimateController = async (req, res) => {
  try {
    const { startLocation, endLocation } = req.body;
    if (!startLocation || !endLocation) {
      return res.status(400).json({ success: false, message: 'Source and destination required' });
    }

    const estimate = await getRouteEstimate(startLocation, endLocation);
    res.status(200).json({ success: true, data: estimate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
      latitude,
      longitude,
      maxDistanceKm,
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

    if (latitude && longitude) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const maxKm = Number(maxDistanceKm || 25);

      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(maxKm)) {
        const radiusInRadians = maxKm / 6378.1;
        filter['startLocation.coordinates'] = {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusInRadians],
          },
        };
      }
    }

    let rides = await Ride.find(filter)
      .populate('driver', 'name city rating profileImage')
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
