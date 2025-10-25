const express = require('express')
const request = require('supertest')
const Joi = require('joi')
const validateMiddleware = require('../middleware/validate.middleware')

describe('validate.middleware', () => {
  let app

  beforeAll(() => {
    app = express()
    app.use(express.json())

    // route testing body validation
    const bodySchema = Joi.object({ name: Joi.string().min(2).required() })
    app.post('/test-body', validateMiddleware(bodySchema), (req, res) => res.json({ ok: true, body: req.body }))

    // route testing query validation (GET)
    const querySchema = Joi.object({ q: Joi.string().min(1).required() })
    app.get('/test-query', validateMiddleware(querySchema), (req, res) => res.json({ ok: true, query: req.query }))

    // route testing params validation
    const paramsSchema = Joi.object({ id: Joi.string().hex().length(24).required() })
    app.get('/test-params/:id', validateMiddleware(paramsSchema, { source: 'params' }), (req, res) => res.json({ ok: true, params: req.params }))
  })

  test('returns 400 with structured details for invalid body', async () => {
    const res = await request(app).post('/test-body').send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('success', false)
    expect(res.body).toHaveProperty('error')
    expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR')
    expect(Array.isArray(res.body.error.details)).toBe(true)
    expect(res.body.error.details[0]).toHaveProperty('field')
    expect(res.body.error.details[0]).toHaveProperty('message')
  })

  test('passes on valid body and assigns sanitized value', async () => {
    const res = await request(app).post('/test-body').send({ name: 'Al' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body.body).toHaveProperty('name', 'Al')
  })

  test('returns 400 for missing query on GET', async () => {
    const res = await request(app).get('/test-query')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('returns 400 for invalid params', async () => {
    const res = await request(app).get('/test-params/123')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('passes for valid params', async () => {
    const validId = '0123456789abcdef01234567'
    const res = await request(app).get(`/test-params/${validId}`)
    expect(res.status).toBe(200)
    expect(res.body.params.id).toBe(validId)
  })
})
