
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const connectDB = require('./config/db')
const errorMiddleware = require('./middleware/error.middleware')
const authRoutes = require('./routes/auth.routes')
const userRoutes = require('./routes/userRoutes')
const ridesRoutes = require('./routes/rides.routes')
const bookingsRoutes = require('./routes/bookings.routes')
const analyticsRoutes = require('./routes/analytics.routes')
const logger = require('./utils/logger')

require('dotenv').config()

const app = express()

app.use(cors({ origin: process.env.CLIENT_URL }))
app.use(helmet())
app.use(morgan('dev'))
app.use(express.json())

const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX
})
app.use(limiter)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/rides', ridesRoutes)
app.use('/api/bookings', bookingsRoutes)
app.use('/api/analytics', analyticsRoutes)

app.use(errorMiddleware)

const start = async () => {
  try {
    await connectDB()
    const PORT = process.env.PORT || 5000
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`))
  } catch (error) {
    logger.error(`Server startup error: ${error.message}`)
    process.exit(1)
  }
}

start()