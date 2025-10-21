const express = require('express')
const { register, login, me } = require('../controllers/auth.controller')
const validateMiddleware = require('../middleware/validate.middleware')
const authMiddleware = require('../middleware/auth.middleware')
const { registerSchema, loginSchema } = require('../utils/validators')

const router = express.Router()

router.post('/register', validateMiddleware(registerSchema), register)
router.post('/login', validateMiddleware(loginSchema), login)
router.get('/me', authMiddleware, me)

module.exports = router