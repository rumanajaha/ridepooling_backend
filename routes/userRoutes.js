
const express = require('express')
const { getUser, updateProfile, changePassword } = require('../controllers/userController')
const authMiddleware = require('../middleware/auth.middleware')
const validateMiddleware = require('../middleware/validate.middleware')
const { updateProfileSchema, changePasswordSchema } = require('../utils/validators')

const router = express.Router()

router.get('/:id', getUser)
router.put('/me', authMiddleware, validateMiddleware(updateProfileSchema), updateProfile)
router.put('/me/password', authMiddleware, validateMiddleware(changePasswordSchema), changePassword)

module.exports = router