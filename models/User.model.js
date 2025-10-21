const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  city: { type: String },
  phone: { type: String },
  rating: { type: Number, default: 5 },
  ridesOffered: { type: Number, default: 0 },
  ridesBooked: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('User', userSchema)