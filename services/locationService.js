import { createClient } from 'redis';

class LocationService {
  constructor() {
    this.client = null;
    this.isConnected = false;
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
        console.log('✅ Redis connected for live tracking');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
      console.log('⚠️ Running without Redis - live tracking limited');
      this.client = null;
    }
  }

  /**
   * Store rider's current location
   * TTL: 5 minutes (auto-cleanup if no updates)
   */
  async updateRiderLocation(rideId, locationData) {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not available, skipping location storage');
      return false;
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
      console.error('Error storing location:', error);
      return false;
    }
  }

  /**
   * Get rider's current location
   */
  async getRiderLocation(rideId) {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const key = `live:ride:${rideId}`;
      const data = await this.client.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  /**
   * Store passenger's current location for live sharing
   * TTL: 5 minutes
   */
  async updatePassengerLocation(rideId, userId, locationData) {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not available, skipping passenger location storage');
      return false;
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
      console.error('Error storing passenger location:', error);
      return false;
    }
  }

  /**
   * Get passenger's current location
   */
  async getPassengerLocation(rideId, userId) {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const key = `live:ride:${rideId}:passenger:${userId}`;
      const data = await this.client.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting passenger location:', error);
      return null;
    }
  }

  /**
   * Store recent location history for ETA calculation
   * Keep last 10 points only
   */
  async addLocationHistory(rideId, locationData) {
    if (!this.client || !this.isConnected) {
      return false;
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
      console.error('Error adding location history:', error);
      return false;
    }
  }

  /**
   * Get recent location history for ETA calculation
   */
  async getLocationHistory(rideId) {
    if (!this.client || !this.isConnected) {
      return [];
    }

    try {
      const key = `history:ride:${rideId}`;
      const data = await this.client.lRange(key, 0, -1);
      
      return data.map(item => JSON.parse(item));
    } catch (error) {
      console.error('Error getting location history:', error);
      return [];
    }
  }

  /**
   * Clear ride location data when ride ends
   */
  async clearRideData(rideId) {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      await this.client.del(`live:ride:${rideId}`);
      await this.client.del(`history:ride:${rideId}`);
      return true;
    } catch (error) {
      console.error('Error clearing ride data:', error);
      return false;
    }
  }

  /**
   * Store chat message temporarily
   */
  async storeChatMessage(rideId, message) {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const key = `chat:ride:${rideId}`;
      await this.client.rPush(key, JSON.stringify(message));
      await this.client.expire(key, 86400); // 24 hours
      return true;
    } catch (error) {
      console.error('Error storing chat message:', error);
      return false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('Redis disconnected');
    }
  }
}

// Singleton instance
const locationService = new LocationService();

export default locationService;
