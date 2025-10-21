
const axios = require('axios')
const NodeCache = require('node-cache')
const logger = require('./logger')

const cache = new NodeCache({ stdTTL: 86400 }) // Cache for 24 hours
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_DELAY = 1000 // 1-second delay for Nominatim policy

// Helper for rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function geocodeLocation(locationName, cityBias = process.env.GEOCODE_CITY_BIAS) {
  const query = cityBias ? `${locationName}, ${cityBias}, India` : locationName
  const cacheKey = `geocode:${query}`

  // Check cache
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    await delay(RATE_LIMIT_DELAY) // Respect Nominatim rate limit
    const response = await axios.get(NOMINATIM_URL, {
      params: {
        q: query,
        format: 'json',
        limit: 1,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'CommuteSync/1.0 (your.email@example.com)' // Replace with your email
      }
    })

    if (!response.data || response.data.length === 0) {
      throw new Error(`No coordinates found for "${query}"`)
    }

    const { lat, lon } = response.data[0]
    const coords = { type: 'Point', coordinates: [parseFloat(lon), parseFloat(lat)] }
    
    // Cache result
    cache.set(cacheKey, coords)
    logger.info(`Geocoded "${query}" to ${JSON.stringify(coords)}`)
    return coords
  } catch (error) {
    logger.error(`Geocoding error for "${query}": ${error.message}`)
    return null // Fallback for failed geocoding
  }
}

async function reverseGeocode(lng, lat) {
  const cacheKey = `reverse:${lng},${lat}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    await delay(RATE_LIMIT_DELAY)
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat,
        lon: lng,
        format: 'json',
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'CommuteSync/1.0 (your.email@example.com)'
      }
    })

    const address = response.data.display_name || 'Unknown address'
    cache.set(cacheKey, address)
    return address
  } catch (error) {
    logger.error(`Reverse geocoding error for [${lng}, ${lat}]: ${error.message}`)
    return 'Unknown address'
  }
}

module.exports = { geocodeLocation, reverseGeocode }