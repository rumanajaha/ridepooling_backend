const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const logger = require("../utils/logger");

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, city } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser)
      throw Object.assign(new Error("User already exists. Login instead"), {
        status: 400,
        code: "USER_EXISTS",
      });

    const passwordHash = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_SALT_ROUNDS)
    );
    const user = await User.create({ name, email, passwordHash, phone, city });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
    logger.info(`User registered: ${email}`);
    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          city: user.city,
          rating: user.rating,
          ridesOffered: user.ridesOffered,
          ridesBooked: user.ridesBooked,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw Object.assign(new Error("Email and password are required"), {
        status: 400,
        code: "MISSING_FIELDS",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      throw Object.assign(new Error("User doesn't exist. Register First"), {
        status: 400,
        code: "INVALID_CREDENTIALS",
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw Object.assign(new Error("Invalid credentials"), {
        status: 400,
        code: "INVALID_CREDENTIALS",
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
    logger.info(`User logged in: ${email}`);
    res.json({
      success: true,
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          city: user.city,
          rating: user.rating,
          ridesOffered: user.ridesOffered,
          ridesBooked: user.ridesBooked,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user)
      throw Object.assign(new Error("User not found"), {
        status: 404,
        code: "NOT_FOUND",
      });
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`Get me error: ${error.message}`);
    next(error);
  }
};

module.exports = { register, login, me };
