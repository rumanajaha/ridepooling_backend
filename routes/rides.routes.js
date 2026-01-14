

const express = require('express')
const { createRide, listRides, searchRides, getRide, updateRide, deleteRide, closeRide,myRides } = require('../controllers/rides.controller')
const authMiddleware = require('../middleware/auth.middleware')
const ownershipMiddleware = require('../middleware/ownership.middleware')
const validateMiddleware = require('../middleware/validate.middleware')
const { createRideSchema, searchRidesSchema } = require('../utils/validators')

const router = express.Router()

router.post('/', authMiddleware, validateMiddleware(createRideSchema), createRide)
router.get('/', listRides)
router.get('/search', validateMiddleware(searchRidesSchema), searchRides)
router.get('/my', authMiddleware,myRides)
router.get('/:id', getRide)
router.put('/:id', authMiddleware, ownershipMiddleware, validateMiddleware(createRideSchema), updateRide)
router.delete('/:id', authMiddleware, ownershipMiddleware, deleteRide)
router.post('/:id/close', authMiddleware, ownershipMiddleware, closeRide)


module.exports = router