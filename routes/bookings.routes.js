const express = require('express')
const { bookRide, listBookings, cancelBooking } = require('../controllers/bookings.controller')
const authMiddleware = require('../middleware/auth.middleware')
const validateMiddleware = require('../middleware/validate.middleware')
const { bookRideSchema } = require('../utils/validators')

const router = express.Router()

router.post('/:id/book', authMiddleware, validateMiddleware(bookRideSchema), bookRide)
router.get('/', authMiddleware, listBookings)
router.put('/:id/cancel', authMiddleware, cancelBooking)

module.exports = router