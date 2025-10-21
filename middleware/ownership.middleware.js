const Ride = require('../models/Ride.model')

const ownershipMiddleware = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id)
    if (!ride) return res.status(404).json({ success: false, error: { message: 'Ride not found', code: 'NOT_FOUND' } })
    if (ride.driverId.toString() !== req.user.id) return res.status(403).json({ success: false, error: { message: 'Not authorized', code: 'FORBIDDEN' } })
    next()
  } catch (error) {
    next(error)
  }
}

module.exports = ownershipMiddleware