
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('../models/User.model')
const Ride = require('../models/Ride.model')
const Booking = require('../models/Booking.model')
const { geocodeLocation } = require('../utils/geocode.service')
require('dotenv').config()

const connectDB = async () => {
  try {
    mongoose.set('strictQuery', true)
    await mongoose.connect(process.env.MONGO_URI)
    console.log('MongoDB connected')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

const seed = async () => {
  try {
    await connectDB()

    // Clear existing data
    await User.deleteMany({})
    await Ride.deleteMany({})
    await Booking.deleteMany({})
    console.log('Existing data cleared')

    // Seed users
    const users = [
      {
        name: 'Driver One',
        email: 'driver1@example.com',
        passwordHash: await bcrypt.hash('password123', 10),
        city: 'Bangalore',
        phone: '9876543210',
        rating: 4.8,
      },
      {
        name: 'Passenger One',
        email: 'pass1@example.com',
        passwordHash: await bcrypt.hash('password123', 10),
        city: 'Bangalore',
        phone: '9123456789',
        rating: 4.5,
      },
    ]

    const savedUsers = await User.insertMany(users)
    console.log('Users seeded')

    // Seed rides
    const rides = [
      {
        driverId: savedUsers[0]._id,
        origin: 'Koramangala, Bangalore',
        destination: 'Bangalore Airport',
        dateTime: '2025-10-25T10:00:00Z',
        seatsTotal: 4,
        seatsAvailable: 4,
        price: 500,
        vehicle: 'Car',
        description: 'Comfortable airport ride',
        status: 'open',
      },
      {
        driverId: savedUsers[0]._id,
        origin: 'Indiranagar, Bangalore',
        destination: 'MG Road, Bangalore',
        dateTime: '2025-10-26T12:00:00Z',
        seatsTotal: 3,
        seatsAvailable: 3,
        price: 200,
        vehicle: 'Car',
        description: 'City commute',
        status: 'open',
      },
    ]

    for (const ride of rides) {
      ride.originCoords = await geocodeLocation(ride.origin, process.env.GEOCODE_CITY_BIAS)
      ride.destinationCoords = await geocodeLocation(ride.destination, process.env.GEOCODE_CITY_BIAS)
    }

    await Ride.insertMany(rides)
    console.log('Rides seeded')

    // Seed bookings
    const bookings = [
      {
        rideId: (await Ride.findOne({ origin: 'Koramangala, Bangalore' }))._id,
        passengerId: savedUsers[1]._id,
        seatsBooked: 1,
        status: 'confirmed',
        requestedAt: new Date(),
        confirmedAt: new Date(),
      },
    ]

    await Booking.insertMany(bookings)
    console.log('Bookings seeded')

    console.log('Database seeded')
    process.exit(0)
  } catch (error) {
    console.error('Seed error:', error)
    process.exit(1)
  }
}

seed()