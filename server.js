import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import rideRoutes from './routes/rideRoutes.js';

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send(' Ridepooling Backend is running...');
});

// API routes
app.use('/api/auth', userRoutes);
app.use('/api/rides', rideRoutes);

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
