const express = require('express')
const { popularRoutes, driverStats } = require('../controllers/analytics.controller')
const authMiddleware = require('../middleware/auth.middleware')

const router = express.Router()

router.get('/popular-routes', authMiddleware, popularRoutes)
router.get('/driver-stats/:driverId', authMiddleware, driverStats)

module.exports = router