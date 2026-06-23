import { createClient } from 'redis';
import logger from '../utils/logger.js';

class LocationService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.fallback = {
      riderLocations: new Map(),
      passengerLocations: new Map(),
      locationHistory: new Map(),
      chatMessages: new Map(),
    };

    // Periodic garbage collection for expired fallback cache entries.
    // Prevents memory leaks if entries are never read back or cleared manually.
    if (typeof setInterval !== 'undefined') {
      this.gcInterval = setInterval(() => {
        this.runFallbackGC();
      }, 300000); // Clean up every 5 minutes
      if (this.gcInterval && typeof this.gcInterval.unref === 'function') {
        this.gcInterval.unref();
      }
    }
  }

  runFallbackGC() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const storeName of Object.keys(this.fallback)) {
      const store = this.fallback[storeName];
      for (const [key, entry] of store.entries()) {
        if (entry && entry.expiresAt <= now) {
          store.delete(key);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info('Fallback in-memory cache GC completed', { cleanedCount });
    }
  }

  setFallbackWithTTL(store, key, value, ttlSeconds) {
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  getFallbackValue(store, key) {
    const entry = store.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }

    return entry.value;
  }

  async connect() {
    if (this.isConnected) return;

    try {
      // For local development, use default Redis connection
      // For production, use environment variable
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500)
        }
      });

      this.client.on('error', (err) => {
        // Silently handle connection errors - app works without Redis
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis connected for live tracking');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis in location service', { error: error.message });
      logger.warn('Running without Redis, live tracking limited');
      this.client = null;
    }
  }

  /**
   * Store rider's current location
   * TTL: 5 minutes (auto-cleanup if no updates)
   */
  async updateRiderLocation(rideId, locationData) {
    if (!this.client || !this.isConnected) {
      this.setFallbackWithTTL(
        this.fallback.riderLocations,
        `live:ride:${rideId}`,
        {
          ...locationData,
          updatedAt: Date.now(),
        },
        300
      );
      return true;
    }

    try {
      const key = `live:ride:${rideId}`;
      const data = JSON.stringify({
        ...locationData,
        updatedAt: Date.now()
      });

      await this.client.setEx(key, 300, data); // 5 minutes TTL
      return true;
    } catch (error) {
      logger.error('Error storing rider location', { error: error.message, rideId });
      return false;
    }
  }

  /**
   * Get rider's current location
   */
  async getRiderLocation(rideId) {
    if (!this.client || !this.isConnected) {
      return this.getFallbackValue(this.fallback.riderLocations, `live:ride:${rideId}`);
    }

    try {
      const key = `live:ride:${rideId}`;
      const data = await this.client.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting rider location', { error: error.message, rideId });
      return null;
    }
  }

  /**
   * Store passenger's current location for live sharing
   * TTL: 5 minutes
   */
  async updatePassengerLocation(rideId, userId, locationData) {
    if (!this.client || !this.isConnected) {
      this.setFallbackWithTTL(
        this.fallback.passengerLocations,
        `live:ride:${rideId}:passenger:${userId}`,
        {
          ...locationData,
          updatedAt: Date.now(),
        },
        300
      );
      return true;
    }

    try {
      const key = `live:ride:${rideId}:passenger:${userId}`;
      const data = JSON.stringify({
        ...locationData,
        updatedAt: Date.now()
      });

      await this.client.setEx(key, 300, data); // 5 minutes TTL
      return true;
    } catch (error) {
      logger.error('Error storing passenger location', { error: error.message, rideId, userId });
      return false;
    }
  }

  /**
   * Get passenger's current location
   */
  async getPassengerLocation(rideId, userId) {
    if (!this.client || !this.isConnected) {
      return this.getFallbackValue(
        this.fallback.passengerLocations,
        `live:ride:${rideId}:passenger:${userId}`
      );
    }

    try {
      const key = `live:ride:${rideId}:passenger:${userId}`;
      const data = await this.client.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting passenger location', { error: error.message, rideId, userId });
      return null;
    }
  }

  /**
   * Store recent location history for ETA calculation
   * Keep last 10 points only
   */
  async addLocationHistory(rideId, locationData) {
    if (!this.client || !this.isConnected) {
      const key = `history:ride:${rideId}`;
      const existing = this.getFallbackValue(this.fallback.locationHistory, key) || [];
      const updated = [...existing, locationData].slice(-10);
      this.setFallbackWithTTL(this.fallback.locationHistory, key, updated, 3600);
      return true;
    }

    try {
      const key = `history:ride:${rideId}`;
      const data = JSON.stringify(locationData);
      
      // Add to list
      await this.client.rPush(key, data);
      
      // Trim to last 10 points
      await this.client.lTrim(key, -10, -1);
      
      // Set expiry
      await this.client.expire(key, 3600); // 1 hour
      
      return true;
    } catch (error) {
      logger.error('Error adding location history', { error: error.message, rideId });
      return false;
    }
  }

  /**
   * Get recent location history for ETA calculation
   */
  async getLocationHistory(rideId) {
    if (!this.client || !this.isConnected) {
      return this.getFallbackValue(this.fallback.locationHistory, `history:ride:${rideId}`) || [];
    }

    try {
      const key = `history:ride:${rideId}`;
      const data = await this.client.lRange(key, 0, -1);
      
      return data.map(item => JSON.parse(item));
    } catch (error) {
      logger.error('Error getting location history', { error: error.message, rideId });
      return [];
    }
  }

  /**
   * Clear ride location data when ride ends
   */
  async clearRideData(rideId) {
    if (!this.client || !this.isConnected) {
      this.fallback.riderLocations.delete(`live:ride:${rideId}`);
      this.fallback.locationHistory.delete(`history:ride:${rideId}`);
      const passengerPrefix = `live:ride:${rideId}:passenger:`;
      Array.from(this.fallback.passengerLocations.keys())
        .filter((k) => k.startsWith(passengerPrefix))
        .forEach((k) => this.fallback.passengerLocations.delete(k));
      this.fallback.chatMessages.delete(`chat:ride:${rideId}`);
      return true;
    }

    try {
      await this.client.del(`live:ride:${rideId}`);
      await this.client.del(`history:ride:${rideId}`);
      return true;
    } catch (error) {
      logger.error('Error clearing ride data', { error: error.message, rideId });
      return false;
    }
  }

  /**
   * Store chat message temporarily
   */
  async storeChatMessage(rideId, message) {
    if (!this.client || !this.isConnected) {
      const key = `chat:ride:${rideId}`;
      const existing = this.getFallbackValue(this.fallback.chatMessages, key) || [];
      const updated = [...existing, message].slice(-100);
      this.setFallbackWithTTL(this.fallback.chatMessages, key, updated, 86400);
      return true;
    }

    try {
      const key = `chat:ride:${rideId}`;
      await this.client.rPush(key, JSON.stringify(message));
      await this.client.expire(key, 86400); // 24 hours
      return true;
    } catch (error) {
      logger.error('Error storing chat message', { error: error.message, rideId });
      return false;
    }
  }

  async disconnect() {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }
}

// Singleton instance
const locationService = new LocationService();

export default locationService;
