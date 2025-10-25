

const express = require('express')
const { createRide, listRides, searchRides, getRide, updateRide, deleteRide, closeRide } = require('../controllers/rides.controller')
const authMiddleware = require('../middleware/auth.middleware')
const ownershipMiddleware = require('../middleware/ownership.middleware')
const validateMiddleware = require('../middleware/validate.middleware')
const { createRideSchema, searchRidesSchema } = require('../utils/validators')

const router = express.Router()

// Validate :id param where applicable
router.post('/', authMiddleware, validateMiddleware(createRideSchema), createRide)
router.get('/', listRides)
router.get('/search', validateMiddleware(searchRidesSchema), searchRides)
router.get('/:id', validateMiddleware(require('../utils/validators').idParamSchema, { source: 'params' }), getRide)
router.put('/:id', validateMiddleware(require('../utils/validators').idParamSchema, { source: 'params' }), authMiddleware, ownershipMiddleware, validateMiddleware(createRideSchema), updateRide)
router.delete('/:id', validateMiddleware(require('../utils/validators').idParamSchema, { source: 'params' }), authMiddleware, ownershipMiddleware, deleteRide)
router.post('/:id/close', validateMiddleware(require('../utils/validators').idParamSchema, { source: 'params' }), authMiddleware, ownershipMiddleware, closeRide)

module.exports = router