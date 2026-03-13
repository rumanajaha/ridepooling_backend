import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const vehicleSchema = z.object({
  make: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  color: z.string().max(50).optional(),
  licensePlate: z.string().max(30).optional(),
  registrationNumber: z.string().max(50).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  isPrimary: z.boolean().optional(),
});

const trustedContactSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(20),
  relationship: z.string().max(60).optional(),
});

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(6).max(128),
    phone: z.string().min(8).max(20),
    city: z.string().min(2).max(120),
    gender: z.enum(['male', 'female', 'other']).optional(),
    upiId: z.string().max(100).optional(),
    vehicles: z.array(vehicleSchema).optional(),
    trustedContacts: z.array(trustedContactSchema).max(5).optional(),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const createRideSchema = z.object({
  body: z.object({
    startLocation: z.object({
      address: z.string().min(2),
      latitude: z.number().finite(),
      longitude: z.number().finite(),
    }),
    endLocation: z.object({
      address: z.string().min(2),
      latitude: z.number().finite(),
      longitude: z.number().finite(),
    }),
    departureTime: z.union([z.string(), z.date()]),
    availableSeats: z.number().int().min(1).max(7).optional(),
    pricePerSeat: z.number().nonnegative().optional(),
    seats: z.number().int().min(1).max(7).optional(),
    price: z.number().nonnegative().optional(),
    vehicleInfo: z.any().optional(),
    description: z.string().max(500).optional(),
    preferences: z.any().optional(),
    notes: z.string().max(500).optional(),
  }).refine((body) => (body.availableSeats ?? body.seats) !== undefined, {
    message: 'Either availableSeats or seats is required',
    path: ['availableSeats'],
  }).refine((body) => (body.pricePerSeat ?? body.price) !== undefined, {
    message: 'Either pricePerSeat or price is required',
    path: ['pricePerSeat'],
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const bookRideSchema = z.object({
  body: z.object({
    seats: z.number().int().min(1).max(7).optional(),
  }),
  params: z.object({
    id: z.string().min(1),
  }),
  query: z.object({}).passthrough(),
});

export const createReviewSchema = z.object({
  body: z.object({
    rideId: z.string().min(1),
    rating: z.number().min(1).max(5),
    comment: z.string().max(500).optional(),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const createCashfreeOrderSchema = z.object({
  body: z.object({
    rideId: objectIdString,
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const upiIntentSchema = z.object({
  body: z.object({
    rideId: objectIdString,
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const createPaymentSchema = z.object({
  body: z.object({
    rideId: objectIdString,
    paymentMethod: z.literal('upi'),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const confirmPaymentSchema = z.object({
  body: z.object({
    paymentId: objectIdString,
    transactionId: z.string().min(1).max(200).optional(),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const refundPaymentSchema = z.object({
  body: z.object({
    paymentId: objectIdString,
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const paymentHistoryQuerySchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
  query: z.object({
    type: z.enum(['driver', 'passenger']).optional(),
  }).passthrough(),
});

export const sendMessageSchema = z.object({
  body: z.object({
    receiverId: objectIdString,
    chatId: objectIdString.optional(),
    content: z.string().min(1).max(1000),
    rideId: objectIdString.optional(),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).max(120).optional(),
      phone: z.string().min(8).max(20).optional(),
      city: z.string().min(2).max(120).optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      upiId: z.string().max(100).optional(),
      vehicles: z.array(vehicleSchema).optional(),
      trustedContacts: z.array(trustedContactSchema).max(5).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one profile field is required',
    }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

export const walletTransactionHistorySchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    type: z.enum(['credit', 'debit']).optional(),
  }).passthrough(),
});

export const addFundsSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive().max(1000000),
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});
