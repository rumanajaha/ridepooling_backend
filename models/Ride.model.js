const mongoose = require('mongoose')

const rideSchema = new mongoose.Schema({
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  origin: { type: String, required: true },
  originCoords: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  destination: { type: String, required: true },
  destinationCoords: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  dateTime: { type: Date, required: true },
  seatsTotal: { type: Number, required: true },
  seatsAvailable: { type: Number, required: true },
  price: { type: Number },
  vehicle: { type: String },
  description: { type: String },
  status: { type: String, enum: ['open', 'completed', 'cancelled'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

rideSchema.index({ originCoords: '2dsphere' })

module.exports = mongoose.model('Ride', rideSchema)