
/**
 * validateMiddleware(schema, options)
 * options: {
 *   source: 'auto'|'body'|'query'|'params'  // where to validate (auto: GET=>query else body)
 *   stripUnknown: boolean                    // whether to strip unknown keys
 *   assign: boolean                          // whether to assign the validated value back to req[source]
 * }
 */
const validateMiddleware = (schema, options = {}) => (req, res, next) => {
  const opts = Object.assign({ source: 'auto', stripUnknown: false, assign: true }, options)

  const source = opts.source === 'auto' ? (req.method === 'GET' ? 'query' : 'body') : opts.source
  const data = source === 'params' ? req.params : source === 'query' ? req.query : req.body

  const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: opts.stripUnknown })
  if (error) {
    const details = error.details.map(d => ({ field: Array.isArray(d.path) ? d.path.join('.') : String(d.path), message: d.message }))
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details } })
  }

  // Assign sanitized value back to request if requested
  if (opts.assign) {
    if (source === 'params') req.params = value
    else if (source === 'query') req.query = value
    else req.body = value
  }

  next()
}

module.exports = validateMiddleware