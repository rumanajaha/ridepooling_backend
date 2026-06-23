import User from '../models/userModel.js';
import Ride from '../models/rideModel.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const sanitizeUser = (userDoc) => {
  const user = userDoc.toObject();
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    gender: user.gender || 'other',
    profileImage: user.profileImage || null,
    rating: user.rating,
    isVerified: user.isVerified,
    upiId: user.upiId || null,
    vehicles: user.vehicles || [],
    trustedContacts: user.trustedContacts || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

// Register user
export const registerUser = async (req, res) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: 'JWT secret is not configured' });
    }

    const { name, email, password, phone, city, gender = 'other', upiId, vehicles, trustedContacts } = req.body;

    if (!name || !email || !password || !phone || !city) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedGender = String(gender || 'other').toLowerCase();

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      city,
      upiId,
      vehicles: Array.isArray(vehicles) ? vehicles : [],
      trustedContacts: Array.isArray(trustedContacts) ? trustedContacts : [],
      gender: ['male', 'female', 'other'].includes(normalizedGender)
        ? normalizedGender
        : 'other',
    });

    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: sanitizeUser(newUser),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login user
export const loginUser = async (req, res) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: 'JWT secret is not configured' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.password || typeof user.password !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: sanitizeUser(user),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get current user profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: { user: sanitizeUser(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update profile details
export const updateProfile = async (req, res) => {
  try {
    const { name, phone, city, gender, upiId, vehicles, trustedContacts } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (city) updates.city = city;
    if (upiId) updates.upiId = upiId;
    if (Array.isArray(vehicles)) updates.vehicles = vehicles;
    if (Array.isArray(trustedContacts)) updates.trustedContacts = trustedContacts;
    if (gender && ['male', 'female', 'other'].includes(gender.toLowerCase())) {
      updates.gender = gender.toLowerCase();
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, message: 'Profile updated', data: { user: sanitizeUser(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.passwordChangedAt = Date.now();
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get system stats for landing page
export const getSystemStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const completedRides = await Ride.countDocuments({ rideStatus: 'completed' });
    const citiesList = await User.distinct('city');
    const totalCities = citiesList.length || 1;

    // Dynamic HSL calculated carbon saved
    const co2Saved = completedRides * 12; // average 12kg saved per pooled ride stop

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        completedRides,
        totalCities,
        co2Saved,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch statistics',
    });
  }
};
