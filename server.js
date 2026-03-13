import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import connectDB from './config/db.js';
import locationService from './services/locationService.js';
import { initializeSocket } from './socket/socketHandler.js';
import userRoutes from './routes/userRoutes.js';
import rideRoutes from './routes/rideRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import { authLimiter, writeLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import requestContext from './middleware/requestContext.js';

dotenv.config();
connectDB();

// Initialize Redis for live tracking
locationService.connect().catch(err => {
  logger.error('Failed to connect to Redis', { error: err.message });
  logger.warn('Continuing without Redis, live tracking will be limited');
});

const app = express();
const httpServer = createServer(app);

app.use(requestContext);

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy: origin not allowed'));
    },
    credentials: true,
  })
);
// Raw body for Cashfree webhook verification must be before express.json
app.use('/api/payments/webhook', express.raw({ type: '*/*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send(' Ridepooling Backend is running...');
});

// API routes
app.use('/api/auth', userRoutes);
app.use('/api/rides', writeLimiter, rideRoutes);
app.use('/api/bookings', writeLimiter, bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallet', walletRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Initialize Socket.IO for live tracking
initializeSocket(httpServer);

const BASE_PORT = Number(process.env.PORT || 5003);
const MAX_PORT_RETRIES = Number(process.env.PORT_RETRY_COUNT || 5);

const tryListen = (port) =>
  new Promise((resolve, reject) => {
    const onError = (error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };

    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port);
  });

const startServer = async () => {
  let port = BASE_PORT;
  let retriesLeft = MAX_PORT_RETRIES;

  // Retry on adjacent ports to make local development resilient to stale processes.
  while (retriesLeft >= 0) {
    try {
      await tryListen(port);
      logger.info('Server started', { port: String(port) });
      logger.info('WebSocket ready for live tracking');
      return;
    } catch (error) {
      if (error?.code === 'EADDRINUSE' && retriesLeft > 0) {
        const nextPort = port + 1;
        logger.warn('Port in use, retrying on next port', {
          previousPort: String(port),
          nextPort: String(nextPort),
          retriesLeft: String(retriesLeft),
        });
        port = nextPort;
        retriesLeft -= 1;
        continue;
      }

      logger.error('Failed to start server', { error: error?.message || 'Unknown startup error' });
      process.exit(1);
    }
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.warn('SIGTERM signal received, closing HTTP server');
  await locationService.disconnect();
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
});
