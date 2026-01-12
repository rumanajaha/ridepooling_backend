const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res
      .status(401)
      .json({
        success: false,
        error: { message: "No token provided", code: "NO_TOKEN" },
      });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    logger.error(`Auth middleware error: ${error.message}`);
    res
      .status(401)
      .json({
        success: false,
        error: { message: "Invalid token", code: "INVALID_TOKEN" },
      });
  }
};

module.exports = authMiddleware;
