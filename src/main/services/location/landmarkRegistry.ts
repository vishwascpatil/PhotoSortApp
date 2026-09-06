/**
 * Offline Landmark & City Registry for Instant Offline Geofencing and OCR Keyword Matching
 */

export interface LandmarkDef {
  id: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
  radiusMeters: number
  keywords: string[]
}

export interface CityDef {
  name: string
  state?: string
  country: string
  lat: number
  lon: number
  radiusKm: number
}

export interface LocationLookupResult {
  city: string
  landmark?: string
  locationName: string
  country: string
  confidence: number
}

// ─── Curated High-Precision Landmarks ─────────────────────────────────────────
export const LANDMARKS: LandmarkDef[] = [
  // Agra
  {
    id: 'taj_mahal',
    name: 'Taj Mahal',
    city: 'Agra',
    country: 'India',
    lat: 27.1751,
    lon: 78.0421,
    radiusMeters: 1600,
    keywords: ['taj mahal', 'taj ganj', 'mumtaz', 'shah jahan', 'tajmahal', 'mehtab bagh']
  },
  {
    id: 'agra_fort',
    name: 'Agra Fort',
    city: 'Agra',
    country: 'India',
    lat: 27.1795,
    lon: 78.0211,
    radiusMeters: 1400,
    keywords: ['agra fort', 'red fort agra', 'diwan-i-khas', 'sheesh mahal agra']
  },
  {
    id: 'fatehpur_sikri',
    name: 'Fatehpur Sikri',
    city: 'Agra',
    country: 'India',
    lat: 27.0945,
    lon: 77.6679,
    radiusMeters: 2000,
    keywords: ['fatehpur sikri', 'buland darwaza', 'salim chishti']
  },

  // Delhi
  {
    id: 'humayuns_tomb',
    name: "Humayun's Tomb",
    city: 'Delhi',
    country: 'India',
    lat: 28.5933,
    lon: 77.2507,
    radiusMeters: 1200,
    keywords: ['humayun', "humayun's tomb", 'nizamuddin', 'isa khan', 'sunder nursery']
  },
  {
    id: 'safdarjung_tomb',
    name: 'Safdarjung Tomb & Lodhi',
    city: 'Delhi',
    country: 'India',
    lat: 28.5994,
    lon: 77.2058,
    radiusMeters: 1400,
    keywords: ['safdarjung', 'lodhi garden', 'lodhi gardens', 'safdarjung tomb']
  },
  {
    id: 'red_fort_delhi',
    name: 'Red Fort',
    city: 'Delhi',
    country: 'India',
    lat: 28.6562,
    lon: 77.2410,
    radiusMeters: 1300,
    keywords: ['red fort', 'lal qila', 'chandni chowk', 'lahori gate', 'meena bazaar']
  },
  {
    id: 'india_gate',
    name: 'India Gate',
    city: 'Delhi',
    country: 'India',
    lat: 28.6129,
    lon: 77.2295,
    radiusMeters: 1200,
    keywords: ['india gate', 'kartavya path', 'rajpath', 'amar jawan jyoti', 'national war memorial']
  },
  {
    id: 'qutub_minar',
    name: 'Qutub Minar',
    city: 'Delhi',
    country: 'India',
    lat: 28.5245,
    lon: 77.1855,
    radiusMeters: 1300,
    keywords: ['qutub minar', 'qutab minar', 'iron pillar', 'mehrauli', 'ala-i-darwaza']
  },
  {
    id: 'lotus_temple',
    name: 'Lotus Temple',
    city: 'Delhi',
    country: 'India',
    lat: 28.5535,
    lon: 77.2588,
    radiusMeters: 1200,
    keywords: ['lotus temple', 'bahai house of worship', 'kalkaji']
  },
  {
    id: 'akshardham_delhi',
    name: 'Akshardham Temple',
    city: 'Delhi',
    country: 'India',
    lat: 28.6127,
    lon: 77.2773,
    radiusMeters: 1500,
    keywords: ['akshardham', 'swaminarayan akshardham', 'akshardham temple']
  },
  {
    id: 'jama_masjid_delhi',
    name: 'Jama Masjid',
    city: 'Delhi',
    country: 'India',
    lat: 28.6507,
    lon: 77.2334,
    radiusMeters: 800,
    keywords: ['jama masjid', 'masjid-i-jehan-numa']
  },

  // Mumbai
  {
    id: 'gateway_of_india',
    name: 'Gateway of India',
    city: 'Mumbai',
    country: 'India',
    lat: 18.9220,
    lon: 72.8347,
    radiusMeters: 1000,
    keywords: ['gateway of india', 'taj mahal palace mumbai', 'colaba']
  },
  {
    id: 'marine_drive',
    name: 'Marine Drive',
    city: 'Mumbai',
    country: 'India',
    lat: 18.9432,
    lon: 72.8230,
    radiusMeters: 2000,
    keywords: ['marine drive', "queen's necklace", 'nariman point', 'girgaon chowpatty']
  },

  // Jaipur
  {
    id: 'hawa_mahal',
    name: 'Hawa Mahal',
    city: 'Jaipur',
    country: 'India',
    lat: 26.9239,
    lon: 75.8267,
    radiusMeters: 1000,
    keywords: ['hawa mahal', 'palace of winds', 'badi choupad']
  },
  {
    id: 'amber_fort',
    name: 'Amer Fort',
    city: 'Jaipur',
    country: 'India',
    lat: 26.9855,
    lon: 75.8513,
    radiusMeters: 1800,
    keywords: ['amer fort', 'amber fort', 'maota lake', 'sheesh mahal jaipur']
  },

  // Hampi (Karnataka)
  {
    id: 'hampi_virupaksha',
    name: 'Virupaksha Temple',
    city: 'Hampi',
    country: 'India',
    lat: 15.3353,
    lon: 76.4597,
    radiusMeters: 1800,
    keywords: ['hampi', 'virupaksha', 'hampi bazaar', 'tungabhadra', 'hema kuta']
  },
  {
    id: 'hampi_vittala',
    name: 'Vijaya Vittala & Stone Chariot',
    city: 'Hampi',
    country: 'India',
    lat: 15.3429,
    lon: 76.4757,
    radiusMeters: 2000,
    keywords: ['vittala', 'stone chariot', 'musical pillars', 'vittala temple', 'hampi', 'vijayanagara']
  },
  {
    id: 'hampi_lotus_mahal',
    name: 'Lotus Mahal & Elephant Stables',
    city: 'Hampi',
    country: 'India',
    lat: 15.3204,
    lon: 76.4705,
    radiusMeters: 1800,
    keywords: ['lotus mahal', 'elephant stables', 'zenana enclosure', 'matanga hill', 'hampi']
  },

  // Kolhapur (Maharashtra)
  {
    id: 'kolhapur_mahalaxmi',
    name: 'Mahalaxmi Temple (Ambabai)',
    city: 'Kolhapur',
    country: 'India',
    lat: 16.6946,
    lon: 74.2238,
    radiusMeters: 1800,
    keywords: ['mahalaxmi temple', 'ambabai', 'kolhapur', 'shree ambabai', 'bhavani mandap']
  },
  {
    id: 'kolhapur_rankala',
    name: 'Rankala Lake',
    city: 'Kolhapur',
    country: 'India',
    lat: 16.6908,
    lon: 74.2104,
    radiusMeters: 1800,
    keywords: ['rankala', 'rankala lake', 'shalini palace', 'padmaraje']
  },
  {
    id: 'kolhapur_panhala',
    name: 'Panhala Fort',
    city: 'Kolhapur',
    country: 'India',
    lat: 16.8118,
    lon: 74.1122,
    radiusMeters: 3000,
    keywords: ['panhala', 'panhala fort', 'sajja kothi', 'teen darwaza']
  },

  // Bangalore / Bengaluru
  {
    id: 'bangalore_lalbagh',
    name: 'Lalbagh Botanical Garden',
    city: 'Bangalore',
    country: 'India',
    lat: 12.9507,
    lon: 77.5848,
    radiusMeters: 1600,
    keywords: ['lalbagh', 'lal bagh', 'glass house', 'lalbagh botanical garden', 'lalbagh lake', 'west gate lalbagh']
  },
  {
    id: 'bangalore_basavanagudi',
    name: 'Basavanagudi & Bull Temple',
    city: 'Bangalore',
    country: 'India',
    lat: 12.9422,
    lon: 77.5756,
    radiusMeters: 1600,
    keywords: ['basavanagudi', 'bull temple', 'dodda ganapathi', 'dodda basavana gudi', 'bugle rock', 'gandhi bazaar', 'vidyarthi bhavan', 'durgagudi']
  },
  {
    id: 'bangalore_gobi_goodu',
    name: 'Gobbi Goodu Resort',
    city: 'Bangalore',
    country: 'India',
    lat: 12.8250,
    lon: 77.4650,
    radiusMeters: 3000,
    keywords: ['gobi goodu', 'gobbi goodu', 'gobbiguudu', 'gubbi goodu', 'gobbi goodu resort', 'gobi goodu resort']
  },
  {
    id: 'bangalore_cubbon_park',
    name: 'Cubbon Park & Vidhana Soudha',
    city: 'Bangalore',
    country: 'India',
    lat: 12.9767,
    lon: 77.5925,
    radiusMeters: 1800,
    keywords: ['cubbon park', 'vidhana soudha', 'attara kacheri']
  },
  {
    id: 'bangalore_palace',
    name: 'Bangalore Palace',
    city: 'Bangalore',
    country: 'India',
    lat: 12.9988,
    lon: 77.5921,
    radiusMeters: 1600,
    keywords: ['bangalore palace', 'bengaluru palace']
  },

  // World Landmarks
  {
    id: 'eiffel_tower',
    name: 'Eiffel Tower',
    city: 'Paris',
    country: 'France',
    lat: 48.8584,
    lon: 2.2945,
    radiusMeters: 1000,
    keywords: ['eiffel tower', 'tour eiffel', 'champ de mars']
  },
  {
    id: 'colosseum',
    name: 'Colosseum',
    city: 'Rome',
    country: 'Italy',
    lat: 41.8902,
    lon: 12.4922,
    radiusMeters: 1000,
    keywords: ['colosseum', 'colosseo', 'roman forum']
  },
  {
    id: 'statue_of_liberty',
    name: 'Statue of Liberty',
    city: 'New York',
    country: 'USA',
    lat: 40.6892,
    lon: -74.0445,
    radiusMeters: 1000,
    keywords: ['statue of liberty', 'liberty island', 'ellis island']
  },
  {
    id: 'burj_khalifa',
    name: 'Burj Khalifa',
    city: 'Dubai',
    country: 'UAE',
    lat: 25.1972,
    lon: 55.2744,
    radiusMeters: 1200,
    keywords: ['burj khalifa', 'dubai mall', 'downtown dubai']
  }
]

// ─── Curated Major Cities (Fast Nearest-Bounding Lookup) ──────────────────────
export const CITIES: CityDef[] = [
  { name: 'Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lon: 77.2090, radiusKm: 35 },
  { name: 'Agra', state: 'Uttar Pradesh', country: 'India', lat: 27.1767, lon: 78.0081, radiusKm: 25 },
  { name: 'Bangalore', state: 'Karnataka', country: 'India', lat: 12.9716, lon: 77.5946, radiusKm: 40 },
  { name: 'Hampi', state: 'Karnataka', country: 'India', lat: 15.3350, lon: 76.4600, radiusKm: 20 },
  { name: 'Kolhapur', state: 'Maharashtra', country: 'India', lat: 16.7050, lon: 74.2433, radiusKm: 25 },
  { name: 'Jaipur', state: 'Rajasthan', country: 'India', lat: 26.9124, lon: 75.7873, radiusKm: 30 },
  { name: 'Mumbai', state: 'Maharashtra', country: 'India', lat: 19.0760, lon: 72.8777, radiusKm: 40 },
  { name: 'Goa', state: 'Goa', country: 'India', lat: 15.2993, lon: 74.1240, radiusKm: 50 },
  { name: 'Hyderabad', state: 'Telangana', country: 'India', lat: 17.3850, lon: 78.4867, radiusKm: 35 },
  { name: 'Kolkata', state: 'West Bengal', country: 'India', lat: 22.5726, lon: 88.3639, radiusKm: 35 },
  { name: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 13.0827, lon: 80.2707, radiusKm: 35 },
  { name: 'Pune', state: 'Maharashtra', country: 'India', lat: 18.5204, lon: 73.8567, radiusKm: 30 },
  { name: 'Ahmedabad', state: 'Gujarat', country: 'India', lat: 23.0225, lon: 72.5714, radiusKm: 30 },
  { name: 'Varanasi', state: 'Uttar Pradesh', country: 'India', lat: 25.3176, lon: 82.9739, radiusKm: 25 },
  { name: 'Udaipur', state: 'Rajasthan', country: 'India', lat: 24.5854, lon: 73.7125, radiusKm: 25 },
  { name: 'Manali', state: 'Himachal Pradesh', country: 'India', lat: 32.2396, lon: 77.1887, radiusKm: 20 },
  { name: 'Shimla', state: 'Himachal Pradesh', country: 'India', lat: 31.1048, lon: 77.1734, radiusKm: 20 },
  { name: 'Dubai', country: 'UAE', lat: 25.2048, lon: 55.2708, radiusKm: 40 },
  { name: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198, radiusKm: 30 },
  { name: 'London', country: 'UK', lat: 51.5074, lon: -0.1278, radiusKm: 40 },
  { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, radiusKm: 35 },
  { name: 'New York', country: 'USA', lat: 40.7128, lon: -74.0060, radiusKm: 40 },
  { name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, radiusKm: 45 }
]

// ─── Haversine Distance in Meters ───────────────────────────────────────────
export function getHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Fast offline lookup: matches GPS coordinates against landmarks, then cities.
 */
export function lookupCoordinatesOffline(lat: number, lon: number): LocationLookupResult | null {
  // 1. Check Landmark proximity first (highest precision)
  let bestLandmark: LandmarkDef | null = null
  let minLandmarkDist = Infinity

  for (const lm of LANDMARKS) {
    const dist = getHaversineDistanceMeters(lat, lon, lm.lat, lm.lon)
    if (dist <= lm.radiusMeters && dist < minLandmarkDist) {
      minLandmarkDist = dist
      bestLandmark = lm
    }
  }

  if (bestLandmark) {
    return {
      city: bestLandmark.city,
      landmark: bestLandmark.name,
      locationName: `${bestLandmark.city} (${bestLandmark.name})`,
      country: bestLandmark.country,
      confidence: 95
    }
  }

  // 2. Check City proximity (radius in km)
  let bestCity: CityDef | null = null
  let minCityDist = Infinity

  for (const city of CITIES) {
    const distKm = getHaversineDistanceMeters(lat, lon, city.lat, city.lon) / 1000
    if (distKm <= city.radiusKm && distKm < minCityDist) {
      minCityDist = distKm
      bestCity = city
    }
  }

  if (bestCity) {
    return {
      city: bestCity.name,
      locationName: bestCity.name,
      country: bestCity.country,
      confidence: 85
    }
  }

  return null
}

/**
 * Checks OCR extracted text for landmark or city keywords.
 * Useful for photos taken of tickets, entrance plaques, ASI boards, airport signs.
 */
export function matchLocationFromOcrText(text: string): LocationLookupResult | null {
  if (!text || text.trim().length < 4) return null
  const lower = text.toLowerCase()

  // 1. Check Landmark keywords
  for (const lm of LANDMARKS) {
    for (const kw of lm.keywords) {
      // Word boundary match to avoid false substrings
      const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
      if (regex.test(lower)) {
        return {
          city: lm.city,
          landmark: lm.name,
          locationName: `${lm.city} (${lm.name})`,
          country: lm.country,
          confidence: 90
        }
      }
    }
  }

  // 2. Check City keywords with context clues
  const travelClues = ['airport', 'station', 'metro', 'terminal', 'cantt', 'junction', 'hotel', 'resort', 'visit', 'tourism', 'welcome to']
  for (const city of CITIES) {
    const cityRegex = new RegExp(`\\b${city.name.toLowerCase()}\\b`, 'i')
    if (cityRegex.test(lower)) {
      const hasClue = travelClues.some(clue => lower.includes(clue))
      if (hasClue) {
        return {
          city: city.name,
          locationName: city.name,
          country: city.country,
          confidence: 75
        }
      }
    }
  }

  return null
}
