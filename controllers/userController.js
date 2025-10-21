const bcrypt = require('bcryptjs')
const User = require('../models/User.model')

const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('name city rating avatarUrl')
    if (!user) throw Object.assign(new Error('User not found'), { status: 404, code: 'NOT_FOUND' })
    res.json({ success: true, data: user })
  } catch (error) {
    next(error)
  }
}

const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, req.body, { new: true }).select('-passwordHash')
    res.json({ success: true, data: user })
  } catch (error) {
    next(error)
  }
}

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user.id)
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isMatch) throw Object.assign(new Error('Invalid current password'), { status: 400, code: 'INVALID_PASSWORD' })

    const passwordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_SALT_ROUNDS))
    user.passwordHash = passwordHash
    await user.save()
    res.json({ success: true, data: { message: 'Password updated' } })
  } catch (error) {
    next(error)
  }
}

module.exports = { getUser, updateProfile, changePassword }