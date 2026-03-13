import { calculateDistance } from '../utils/haversine.js';
import Ride from '../models/rideModel.js';

// Base pricing config
const PRICING_CONFIG = {
  BASE_FARE: 30,
  RATE_PER_KM: 12,
  RATE_PER_MIN: 1.5,
  PLATFORM_FEE_PERCENT: 0.1, // 10%
  MIN_FARE: 50,
};

/**
 * Calculate dynamic fare based on distance and estimated time
 */
export const calculateFare = async (distanceKm, timeMin, demandRatio = 1) => {
  // 1. Calculate Base Components
  const distanceFare = distanceKm * PRICING_CONFIG.RATE_PER_KM;
  const timeFare = timeMin * PRICING_CONFIG.RATE_PER_MIN;
  
  // 2. Determine Surge Multiplier
  let surgeMultiplier = 1.0;
  if (demandRatio > 1.5) surgeMultiplier = 1.2;
  if (demandRatio > 2.0) surgeMultiplier = 1.5;
  if (demandRatio > 3.0) surgeMultiplier = 2.0;

  // 3. Sum Subtotal
  let subtotal = PRICING_CONFIG.BASE_FARE + distanceFare + timeFare;
  subtotal = subtotal * surgeMultiplier;

  // 4. apply Min Fare
  subtotal = Math.max(subtotal, PRICING_CONFIG.MIN_FARE);

  // 5. Calculations for Platform and Tolls (Tolls mock for now)
  const platformFee = Math.round(subtotal * PRICING_CONFIG.PLATFORM_FEE_PERCENT);
  const totalFare = Math.round(subtotal + platformFee);

  return {
    baseFare: PRICING_CONFIG.BASE_FARE,
    distanceFare: Math.round(distanceFare),
    timeFare: Math.round(timeFare),
    surgeMultiplier,
    platformFee,
    totalFare,
    currency: 'INR'
  };
};

/**
 * Get estimate for a route
 */
export const getRouteEstimate = async (start, end) => {
    // In a real app, this would call OSRM or Google Maps
    // For now, we use Haversine distance and an average speed (e.g. 25km/h)
    const startLat = Number(start?.lat ?? start?.latitude);
    const startLng = Number(start?.lng ?? start?.longitude);
    const endLat = Number(end?.lat ?? end?.latitude);
    const endLng = Number(end?.lng ?? end?.longitude);

    if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) {
      throw new Error('Invalid coordinates for fare estimation');
    }

    const distanceKm = calculateDistance(startLat, startLng, endLat, endLng);
    const estTimeMin = (distanceKm / 25) * 60; // 25 km/h avg speed

    // Demand ratio based on active rides in the same pickup city/area for near-term departures.
    const cityToken = String(start?.address || '')
      .split(',')[0]
      .trim();
    const now = new Date();
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    let demandRatio = 1;
    if (cityToken) {
      const activeRides = await Ride.find({
        rideStatus: 'active',
        departureTime: { $gte: now, $lte: in2Hours },
        'startLocation.address': new RegExp(cityToken, 'i'),
      }).select('availableSeats seatsBooked');

      if (activeRides.length > 0) {
        const totalSupply = activeRides.reduce(
          (sum, r) => sum + Math.max(0, Number(r.availableSeats || 0) - Number(r.seatsBooked || 0)),
          0
        );
        const totalDemand = activeRides.reduce(
          (sum, r) => sum + Math.max(0, Number(r.seatsBooked || 0)),
          0
        ) + 1;

        demandRatio = totalSupply > 0 ? totalDemand / totalSupply : 2;
      }
    }

    return calculateFare(distanceKm, estTimeMin, demandRatio);
};
