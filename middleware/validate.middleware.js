
const validateMiddleware = (schema) => (req, res, next) => {
  const data = req.method === 'GET' ? req.query : req.body
  const { error } = schema.validate(data, { abortEarly: false })
  if (error) {
    const message = error.details.map(d => d.message).join(', ')
    return res.status(400).json({ success: false, error: { message, code: 'VALIDATION_ERROR' } })
  }
  next()
}

module.exports = validateMiddleware