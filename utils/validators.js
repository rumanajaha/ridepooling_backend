

const Joi = require('joi')

module.exports = {
  registerSchema: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    phone: Joi.string().optional(),
    city: Joi.string().optional()
  }),
  loginSchema: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  updateProfileSchema: Joi.object({
    name: Joi.string().optional(),
    phone: Joi.string().optional(),
    city: Joi.string().optional(),
    vehicle: Joi.object({ model: Joi.string(), plate: Joi.string() }).optional()
  }),
  changePasswordSchema: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required()
  }),
  createRideSchema: Joi.object({
    origin: Joi.string().required(),
    originCoords: Joi.object({ type: Joi.string().valid('Point'), coordinates: Joi.array().items(Joi.number()).length(2) }).optional(),
    destination: Joi.string().required(),
    destinationCoords: Joi.object({ type: Joi.string().valid('Point'), coordinates: Joi.array().items(Joi.number()).length(2) }).optional(),
    dateTime: Joi.date().iso().greater('now').required(),
    seatsTotal: Joi.number().min(1).required(),
    price: Joi.number().min(0).optional(),
    vehicle: Joi.string().optional(),
    description: Joi.string().optional()
  }),
  bookRideSchema: Joi.object({
    seats: Joi.number().min(1).optional()
  }),
  searchRidesSchema: Joi.object({
    lat: Joi.number().required(),
    lng: Joi.number().required(),
    maxDistanceKm: Joi.number().min(1).default(5),
    date: Joi.date().iso().optional(),
    minSeats: Joi.number().min(1).optional(),
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).default(10),
    sort: Joi.string().valid('dateTime', 'date_desc').default('dateTime')
  }).with('lat', 'lng')

  ,
  // Param schemas
  idParamSchema: Joi.object({
    id: Joi.string().hex().length(24).required()
  })
}