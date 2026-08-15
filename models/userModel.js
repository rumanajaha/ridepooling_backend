import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'other',
    },
    profileImage: {
      type: String,
      default: null,
    },
    rating: {
      type: Number,
      default: 5,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    upiId: {
      type: String,
      default: null,
    },
    vehicles: [
      {
        make: String,
        model: String,
        color: String,
        licensePlate: String,
        registrationNumber: String,
        year: Number,
        isPrimary: { type: Boolean, default: false },
      },
    ],
    trustedContacts: [
      {
        name: {
          type: String,
          trim: true,
          maxlength: 120,
        },
        phone: {
          type: String,
          trim: true,
          maxlength: 20,
        },
        relationship: {
          type: String,
          trim: true,
          maxlength: 60,
        },
      },
    ],
    completedRides: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    unfoggedHexes: {
      type: [String],
      default: [],
      index: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ city: 1 });

export default mongoose.model('User', userSchema);
