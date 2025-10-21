
const mongoose = require('mongoose')
const Ride = require('../models/Ride.model')
const Booking = require('../models/Booking.model')
const User = require('../models/User.model')
const logger = require('../utils/logger')

const bookRide = async (req, res, next) => {
  const { id: rideId } = req.params
  const seats = req.body.seats || 1
  const passengerId = req.user.id

  const session = await mongoose.startSession()
  try {
    session.startTransaction()
    const updatedRide = await Ride.findOneAndUpdate(
      { _id: rideId, seatsAvailable: { $gte: seats }, status: 'open' },
      { $inc: { seatsAvailable: -seats } },
      { new: true, session }
    )
    if (!updatedRide) {
      await session.abortTransaction()
      logger.warn(`Booking conflict for ride ${rideId}`)
      return res.status(409).json({ success: false, error: { message: 'Not enough seats or ride not open', code: 'NO_SEATS' } })
    }

    const booking = await Booking.create(
      [{ rideId, passengerId, seatsBooked: seats, status: 'confirmed', confirmedAt: new Date() }],
      { session }
    )
    await User.findByIdAndUpdate(passengerId, { $inc: { ridesBooked: 1 } }, { session })

    await session.commitTransaction()
    session.endSession()
    logger.info(`Booking created for ride ${rideId} by ${passengerId}`)
    res.status(201).json({ success: true, data: booking[0] })
  } catch (err) {
    await session.abortTransaction()
    session.endSession()
    next(err)
  }
}

const listBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ passengerId: req.user.id })
      .populate('rideId', 'origin destination dateTime status')
      .lean()
    res.json({ success: true, data: bookings })
  } catch (error) {
    next(error)
  }
}

const cancelBooking = async (req, res, next) => {
  const session = await mongoose.startSession()
  try {
    session.startTransaction()
    const booking = await Booking.findById(req.params.id).session(session)
    if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404, code: 'NOT_FOUND' })
    if (booking.passengerId.toString() !== req.user.id) throw Object.assign(new Error('Not authorized'), { status: 403, code: 'FORBIDDEN' })

    booking.status = 'cancelled'
    booking.cancelledAt = new Date()
    await booking.save({ session })

    await Ride.findByIdAndUpdate(booking.rideId, { $inc: { seatsAvailable: booking.seatsBooked } }, { session })

    await session.commitTransaction()
    session.endSession()
    logger.info(`Booking cancelled: ${req.params.id}`)
    res.json({ success: true, data: { message: 'Booking cancelled' } })
  } catch (err) {
    await session.abortTransaction()
    session.endSession()
    next(err)
  }
}

module.exports = { bookRide, listBookings, cancelBooking }