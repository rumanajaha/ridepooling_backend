import mongoose from 'mongoose';

export const validateObjectIdParam = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return res.status(400).json({ success: false, message: `Invalid ${paramName}` });
  }
  return next();
};
