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

dotenv.config();
connectDB();

// Initialize Redis for live tracking
locationService.connect().catch(err => {
  console.error('Failed to connect to Redis:', err.message);
  console.log('⚠️ Continuing without Redis - live tracking will be limited');
});

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send(' Ridepooling Backend is running...');
});

// API routes
app.use('/api/auth', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallet', walletRoutes);

// Initialize Socket.IO for live tracking
const io = initializeSocket(httpServer);

const PORT = process.env.PORT || 5003;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready for live tracking`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await locationService.disconnect();
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
});
