
const Ride = require('../models/Ride.model')
const Booking = require('../models/Booking.model')
const User = require('../models/User.model')
const { geocodeLocation } = require('../utils/geocode.service')
const logger = require('../utils/logger')

const createRide = async (req, res, next) => {
  try {
    let rideData = { ...req.body, driverId: req.user.id, seatsAvailable: req.body.seatsTotal }

    // Auto-geocode if coords not provided
    if (!rideData.originCoords && rideData.origin) {
      rideData.originCoords = await geocodeLocation(rideData.origin)
    }
    if (!rideData.destinationCoords && rideData.destination) {
      rideData.destinationCoords = await geocodeLocation(rideData.destination)
    }

    const ride = await Ride.create(rideData)
    await User.findByIdAndUpdate(req.user.id, { $inc: { ridesOffered: 1 } })
    logger.info(`Ride created by ${req.user.id}`)
    res.status(201).json({ success: true, data: ride })
  } catch (error) {
    next(error)
  }
}

const listRides = async (req, res, next) => {
  try {
    const { origin, destination, date, minSeats, page = 1, limit = 10, sort = 'dateTime' } = req.query
    const query = { status: 'open' }
    if (origin) query.$text = { $search: origin }
    if (destination) query.$text = { ...query.$text, $search: `${query.$text?.$search || ''} ${destination}` }
    if (date) query.dateTime = { $gte: new Date(date) }
    if (minSeats) query.seatsAvailable = { $gte: parseInt(minSeats) }

    const total = await Ride.countDocuments(query)
    const rides = await Ride.find(query)
      .sort(sort === 'date_desc' ? '-dateTime' : 'dateTime')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('driverId', 'name rating avatarUrl')
      .lean()

    res.json({ success: true, data: rides, meta: { page: parseInt(page), limit: parseInt(limit), total } })
  } catch (error) {
    next(error)
  }
}

const searchRides = async (req, res, next) => {
  try {
    const { lat, lng, maxDistanceKm = 5, date, minSeats, page = 1, limit = 10, sort = 'dateTime' } = req.query
    if (!lat || !lng) {
      throw Object.assign(new Error('Latitude and longitude are required'), { status: 400, code: 'MISSING_FIELDS' })
    }
    const maxDistanceMeters = parseFloat(maxDistanceKm) * 1000
    const query = {
      originCoords: {
        $geoWithin: {
          $centerSphere: [[parseFloat(lng), parseFloat(lat)], maxDistanceMeters / 6378137]
        }
      },
      seatsAvailable: { $gt: 0 },
      status: 'open',
      dateTime: date ? { $gte: new Date(date) } : { $gte: new Date() }
    }
    if (minSeats) query.seatsAvailable = { $gte: parseInt(minSeats) }
    const total = await Ride.countDocuments(query)
    const rides = await Ride.find(query)
      .sort(sort === 'date_desc' ? '-dateTime' : 'dateTime')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('driverId', 'name rating avatarUrl')
      .lean()
    res.json({ success: true, data: rides, meta: { page: parseInt(page), limit: parseInt(limit), total } })
  } catch (error) {
    logger.error(`Search rides error: ${error.message}`)
    next(error)
  }
}

const getRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id).populate('driverId', 'name rating avatarUrl vehicle').lean()
    if (!ride) throw Object.assign(new Error('Ride not found'), { status: 404, code: 'NOT_FOUND' })
    res.json({ success: true, data: ride })
  } catch (error) {
    next(error)
  }
}

const updateRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id)
    if (!ride) throw Object.assign(new Error('Ride not found'), { status: 404, code: 'NOT_FOUND' })
    if (ride.status !== 'open') throw Object.assign(new Error('Cannot update non-open ride'), { status: 403, code: 'INVALID_STATUS' })

    const updates = { ...req.body }
    if (updates.origin && (!ride.originCoords || updates.origin !== ride.origin)) {
      updates.originCoords = await geocodeLocation(updates.origin)
    }
    if (updates.destination && (!ride.destinationCoords || updates.destination !== ride.destination)) {
      updates.destinationCoords = await geocodeLocation(updates.destination)
    }

    const updatedRide = await Ride.findByIdAndUpdate(req.params.id, updates, { new: true })
    res.json({ success: true, data: updatedRide })
  } catch (error) {
    next(error)
  }
}

const deleteRide = async (req, res, next) => {
  try {
    const bookings = await Booking.countDocuments({ rideId: req.params.id, status: { $ne: 'cancelled' } })
    if (bookings > 0) throw Object.assign(new Error('Cannot delete ride with active bookings'), { status: 403, code: 'ACTIVE_BOOKINGS' })

    await Ride.findByIdAndDelete(req.params.id)
    logger.info(`Ride deleted: ${req.params.id}`)
    res.json({ success: true, data: { message: 'Ride deleted' } })
  } catch (error) {
    next(error)
  }
}

const closeRide = async (req, res, next) => {
  try {
    const ride = await Ride.findByIdAndUpdate(req.params.id, { status: 'completed' }, { new: true })
    if (!ride) throw Object.assign(new Error('Ride not found'), { status: 404, code: 'NOT_FOUND' })
    res.json({ success: true, data: ride })
  } catch (error) {
    next(error)
  }
}

module.exports = { createRide, listRides, searchRides, getRide, updateRide, deleteRide, closeRide }