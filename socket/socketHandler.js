import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import locationService from '../services/locationService.js';
import { calculateDistance, calculateETA, calculateBearing } from '../utils/haversine.js';
import Ride from '../models/rideModel.js';

const connectedUsers = new Map(); // socketId -> { userId, rideId, role }
let ioInstance = null; // Store global io instance for external use

/**
 * Initialize Socket.IO with authentication
 */
export function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  ioInstance = io; // Store io instance globally

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userName = decoded.name || 'User';
      
      console.log(`🔌 User ${socket.userId} authenticating...`);
      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.id})`);

    // User joins a specific ride room
    socket.on('join-ride', async ({ rideId, role }) => {
      try {
        // Verify ride exists
        const ride = await Ride.findById(rideId);
        if (!ride) {
          socket.emit('error', { message: 'Ride not found' });
          return;
        }

        // Verify user is part of this ride
        const isDriver = ride.driver.toString() === socket.userId;
        const isPassenger = ride.passengers.some(p => p.userId.toString() === socket.userId);
        
        if (!isDriver && !isPassenger) {
          socket.emit('error', { message: 'Unauthorized access to ride' });
          return;
        }

        // Join room
        socket.join(`ride:${rideId}`);
        connectedUsers.set(socket.id, { 
          userId: socket.userId, 
          rideId, 
          role: isDriver ? 'driver' : 'passenger',
          userName: socket.userName
        });

        console.log(`👤 ${socket.userName} joined ride ${rideId} as ${isDriver ? 'driver' : 'passenger'}`);

        // Send current location if available
        const currentLocation = await locationService.getRiderLocation(rideId);
        if (currentLocation) {
          socket.emit('location-update', currentLocation);
        }

        // Notify others in the room
        socket.to(`ride:${rideId}`).emit('user-joined', {
          userId: socket.userId,
          userName: socket.userName,
          role: isDriver ? 'driver' : 'passenger'
        });

      } catch (error) {
        console.error('Error joining ride:', error);
        socket.emit('error', { message: 'Failed to join ride' });
      }
    });

    // Driver sends location update
    socket.on('update-location', async (data) => {
      try {
        const userInfo = connectedUsers.get(socket.id);
        
        if (!userInfo || userInfo.role !== 'driver') {
          socket.emit('error', { message: 'Only driver can update location' });
          return;
        }

        const { rideId } = userInfo;
        const { latitude, longitude, speed, heading } = data;

        // Validate data
        if (!latitude || !longitude) {
          return;
        }

        const locationData = {
          latitude,
          longitude,
          speed: speed || 0,
          heading: heading || 0,
          timestamp: Date.now()
        };

        // Store in Redis
        await locationService.updateRiderLocation(rideId, locationData);
        await locationService.addLocationHistory(rideId, locationData);

        // Get ride details for pickup location
        const ride = await Ride.findById(rideId);
        if (!ride) return;

        // Calculate distance and ETA
        const pickupLat = ride.startLocation.latitude;
        const pickupLng = ride.startLocation.longitude;
        
        const distance = calculateDistance(
          latitude,
          longitude,
          pickupLat,
          pickupLng
        );

        const locationHistory = await locationService.getLocationHistory(rideId);
        const eta = calculateETA(locationHistory, distance);

        const bearing = calculateBearing(latitude, longitude, pickupLat, pickupLng);

        // Broadcast to all passengers in the ride
        io.to(`ride:${rideId}`).emit('location-update', {
          ...locationData,
          distance: distance.toFixed(2),
          eta,
          bearing: Math.round(bearing)
        });

      } catch (error) {
        console.error('Error updating location:', error);
      }
    });

    // Passenger sends location update (live location sharing)
    socket.on('update-passenger-location', async (data) => {
      try {
        const userInfo = connectedUsers.get(socket.id);
        
        if (!userInfo || userInfo.role !== 'passenger') {
          socket.emit('error', { message: 'Only passengers can share their location' });
          return;
        }

        const { rideId, userId } = userInfo;
        const { latitude, longitude } = data;

        if (!latitude || !longitude) {
          return;
        }

        const passengerLocationData = {
          userId,
          userName: socket.userName,
          latitude,
          longitude,
          timestamp: Date.now()
        };

        // Store passenger location in Redis
        await locationService.updatePassengerLocation(rideId, userId, passengerLocationData);

        // Broadcast to driver only
        socket.to(`ride:${rideId}`).emit('passenger-location-update', passengerLocationData);

      } catch (error) {
        console.error('Error updating passenger location:', error);
      }
    });

    // Real-time chat
    socket.on('send-message', async (data) => {
      try {
        const userInfo = connectedUsers.get(socket.id);
        if (!userInfo) return;

        const { rideId, userId } = userInfo;
        const { message } = data;

        const messageData = {
          userId,
          userName: socket.userName,
          message,
          timestamp: Date.now()
        };

        // Store in Redis temporarily
        await locationService.storeChatMessage(rideId, messageData);

        // Broadcast to room
        io.to(`ride:${rideId}`).emit('receive-message', messageData);

      } catch (error) {
        console.error('Error sending message:', error);
      }
    });

    // User typing indicator
    socket.on('typing', () => {
      const userInfo = connectedUsers.get(socket.id);
      if (userInfo) {
        socket.to(`ride:${userInfo.rideId}`).emit('user-typing', {
          userId: userInfo.userId,
          userName: userInfo.userName
        });
      }
    });

    socket.on('stop-typing', () => {
      const userInfo = connectedUsers.get(socket.id);
      if (userInfo) {
        socket.to(`ride:${userInfo.rideId}`).emit('user-stop-typing', {
          userId: userInfo.userId
        });
      }
    });

    // Ride status updates
    socket.on('ride-started', async (data) => {
      const userInfo = connectedUsers.get(socket.id);
      if (userInfo && userInfo.role === 'driver') {
        io.to(`ride:${userInfo.rideId}`).emit('ride-status-change', {
          status: 'started',
          timestamp: Date.now()
        });
      }
    });

    socket.on('ride-completed', async (data) => {
      const userInfo = connectedUsers.get(socket.id);
      if (userInfo && userInfo.role === 'driver') {
        const { rideId } = userInfo;
        
        io.to(`ride:${rideId}`).emit('ride-status-change', {
          status: 'completed',
          timestamp: Date.now()
        });

        // Clear Redis data
        await locationService.clearRideData(rideId);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const userInfo = connectedUsers.get(socket.id);
      
      if (userInfo) {
        console.log(`❌ ${userInfo.userName} disconnected from ride ${userInfo.rideId}`);
        
        socket.to(`ride:${userInfo.rideId}`).emit('user-left', {
          userId: userInfo.userId,
          userName: userInfo.userName
        });

        connectedUsers.delete(socket.id);
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('🚀 Socket.IO initialized for live tracking');
  return io;
}

/**
 * Get the Socket.IO instance for emitting events from controllers
 */
export function getIO() {
  return ioInstance;
}
