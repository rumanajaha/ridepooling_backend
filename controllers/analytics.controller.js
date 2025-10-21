
const mongoose = require('mongoose')
const Ride = require('../models/Ride.model')
const Booking = require('../models/Booking.model')

const popularRoutes = async (req, res, next) => {
  try {
    const routes = await Ride.aggregate([
      { $group: { _id: { origin: '$origin', destination: '$destination' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
    res.json({ success: true, data: routes })
  } catch (error) {
    next(error)
  }
}

const driverStats = async (req, res, next) => {
  try {
    if (req.params.driverId !== req.user.id) throw Object.assign(new Error('Not authorized'), { status: 403, code: 'FORBIDDEN' })

    const totalRides = await Ride.countDocuments({ driverId: req.params.driverId })
    const totalRevenue = await Booking.aggregate([
      { $lookup: { from: 'rides', localField: 'rideId', foreignField: '_id', as: 'ride' } },
      { $match: { 'ride.driverId': new mongoose.Types.ObjectId(req.params.driverId), status: 'confirmed' } },
      { $unwind: '$ride' },
      { $group: { _id: null, revenue: { $sum: { $multiply: ['$seatsBooked', '$ride.price'] } } } }
    ])
    const seatsFilled = await Booking.aggregate([
      { $lookup: { from: 'rides', localField: 'rideId', foreignField: '_id', as: 'ride' } },
      { $match: { 'ride.driverId': new mongoose.Types.ObjectId(req.params.driverId), status: 'confirmed' } },
      { $group: { _id: null, seats: { $sum: '$seatsBooked' } } }
    ])

    res.json({
      success: true,
      data: {
        totalRides,
        totalRevenue: totalRevenue[0]?.revenue || 0,
        seatsFilled: seatsFilled[0]?.seats || 0
      }
    })
  } catch (error) {
    next(error)
  }
}

module.exports = { popularRoutes, driverStats }