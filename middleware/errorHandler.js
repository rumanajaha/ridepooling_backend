import logger from '../utils/logger.js';

export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Route not found',
    requestId: req.requestId,
  });
};

export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled API error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    error: err?.message || 'Unknown error',
  });

  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || err.status || 500;
  const message = status >= 500 ? 'Internal server error' : err.message || 'Request failed';
  const includeErrorDetail = process.env.NODE_ENV !== 'production';

  return res.status(status).json({
    success: false,
    message,
    requestId: req.requestId,
    ...(includeErrorDetail ? { errorDetail: err?.message || 'Unknown error' } : {}),
  });
};
