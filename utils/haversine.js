/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 * FREE - No API calls needed
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance; // in kilometers
}

/**
 * Calculate ETA based on average speed from recent locations
 * @param {Array} recentLocations - Array of {lat, lng, timestamp}
 * @param {Number} remainingDistance - Distance in kilometers
 * @returns {Number} ETA in minutes
 */
export function calculateETA(recentLocations, remainingDistance) {
  if (!recentLocations || recentLocations.length < 2) {
    // Default assumption: 30 km/h average speed in city
    return (remainingDistance / 30) * 60;
  }

  // Calculate average speed from last 5-10 points
  const points = recentLocations.slice(-10);
  let totalDistance = 0;
  let totalTime = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    const dist = calculateDistance(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );
    
    const time = (curr.timestamp - prev.timestamp) / 1000 / 3600; // hours
    
    totalDistance += dist;
    totalTime += time;
  }

  const avgSpeed = totalTime > 0 ? totalDistance / totalTime : 30; // km/h
  
  // Apply smoothing: don't let speed drop below 10 km/h or exceed 80 km/h
  const smoothedSpeed = Math.max(10, Math.min(80, avgSpeed));
  
  const eta = (remainingDistance / smoothedSpeed) * 60; // minutes
  
  return Math.max(1, Math.round(eta)); // At least 1 minute
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate bearing (direction) between two points
 * Returns angle in degrees (0-360)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
  const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
            Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x);
  bearing = (bearing * 180 / Math.PI + 360) % 360;
  
  return bearing;
}
