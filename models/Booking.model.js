const mongoose = require('mongoose')

const bookingSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seatsBooked: { type: Number, default: 1, min: 1 },
  status: { type: String, enum: ['requested', 'confirmed', 'cancelled', 'completed'], default: 'requested' },
  requestedAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date },
  cancelledAt: { type: Date }
}, { timestamps: true })

module.exports = mongoose.model('Booking', bookingSchema)