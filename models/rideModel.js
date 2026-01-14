import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    startLocation: {
      address: {
        type: String,
        required: true,
      },
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
    },
    endLocation: {
      address: {
        type: String,
        required: true,
      },
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
    },
    departureTime: {
      type: Date,
      required: true,
    },
    availableSeats: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
    },
    pricePerSeat: {
      type: Number,
      required: true,
      min: 0,
    },
    vehicleInfo: {
      make: String,
      model: String,
      color: String,
      licensePlate: String,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    rideStatus: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    passengers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        status: {
          type: String,
          enum: ['pending', 'accepted', 'rejected', 'completed'],
          default: 'pending',
        },
        bookedSeats: {
          type: Number,
          default: 1,
        },
      },
    ],
    seatsBooked: {
      type: Number,
      default: 0,
    },
    notes: String,
    preferences: {
      allowSmoking: {
        type: Boolean,
        default: false,
      },
      allowPets: {
        type: Boolean,
        default: false,
      },
      allowFood: {
        type: Boolean,
        default: false,
      },
      musicLevel: {
        type: String,
        enum: ['quiet', 'moderate', 'loud'],
        default: 'moderate',
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Ride', rideSchema);
