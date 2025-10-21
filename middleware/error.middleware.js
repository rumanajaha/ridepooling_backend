const logger = require('../utils/logger')

const errorMiddleware = (err, req, res, next) => {
  const status = err.status || 500
  const message = err.message || 'Internal Server Error'
  const code = err.code || 'SERVER_ERROR'
  logger.error(`Error: ${message}, Code: ${code}, Status: ${status}`)
  res.status(status).json({ success: false, error: { message, code } })
}

module.exports = errorMiddleware