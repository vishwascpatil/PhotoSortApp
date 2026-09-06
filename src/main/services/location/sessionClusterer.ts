/**
 * Spatio-Temporal Session Clusterer & Location Propagation Engine
 *
 * Implements intelligent trip session analysis:
 * 1. Identifies Anchor Photos (photos with direct GPS, landmark match, or OCR place detection)
 * 2. Groups photos into Temporal Sessions (consecutive photos within 3.5 hours on the same day)
 * 3. Propagates verified locations and centroid coordinates to companion photos in the same session
 * 4. Day-Level Propagation for full-day travel trips
 */

import { lookupCoordinatesOffline, matchLocationFromOcrText } from './landmarkRegistry'

export interface ClusterInputPhoto {
  id: number
  filename: string
  created_at: string | null
  file_path: string
  source_folder_path?: string | null
  gps_lat: number | null
  gps_lon: number | null
  location_name?: string | null
  extracted_text?: string | null
}

export interface ClusteredPhotoResult {
  id: number
  locationName: string
  city: string
  landmark?: string
  lat?: number
  lon?: number
  isInferred: boolean
  confidence: number
}

const SESSION_MAX_GAP_MS = 3.5 * 3600 * 1000 // 3.5 hours

export function clusterAndPropagateLocations(photos: ClusterInputPhoto[]): ClusteredPhotoResult[] {
  if (!photos || photos.length === 0) return []

  // Step 1: Pre-resolve Anchor photos (GPS & OCR)
  const resolved = photos.map(p => {
    let city: string | null = null
    let landmark: string | null = null
    let locationName: string | null = null
    let confidence = 0
    let isAnchor = false

    // Try GPS offline lookup
    if (p.gps_lat !== null && p.gps_lon !== null && typeof p.gps_lat === 'number' && typeof p.gps_lon === 'number') {
      const geo = lookupCoordinatesOffline(p.gps_lat, p.gps_lon)
      if (geo) {
        city = geo.city
        landmark = geo.landmark || null
        locationName = geo.landmark ? `${geo.city} • ${geo.landmark}` : geo.city
        confidence = geo.confidence
        isAnchor = true
      }
    }

    // Try OCR text if not an anchor yet
    if (!isAnchor && p.extracted_text) {
      const ocrMatch = matchLocationFromOcrText(p.extracted_text)
      if (ocrMatch) {
        city = ocrMatch.city
        landmark = ocrMatch.landmark || null
        locationName = ocrMatch.landmark ? `${ocrMatch.city} • ${ocrMatch.landmark}` : ocrMatch.city
        confidence = ocrMatch.confidence
        isAnchor = true
      }
    }

    return {
      photo: p,
      city,
      landmark,
      locationName,
      confidence,
      isAnchor,
      lat: p.gps_lat,
      lon: p.gps_lon,
      isInferred: false
    }
  })

  // Filter to photos with valid timestamps and sort chronologically
  const timestamped = resolved
    .filter(r => r.photo.created_at && !isNaN(new Date(r.photo.created_at).getTime()))
    .sort((a, b) => new Date(a.photo.created_at!).getTime() - new Date(b.photo.created_at!).getTime())

  // Step 2: Build Temporal Sessions (gap <= 3.5h on same calendar day)
  const sessions: (typeof timestamped)[] = []
  let currentSession: typeof timestamped = []

  for (const item of timestamped) {
    if (currentSession.length === 0) {
      currentSession.push(item)
      continue
    }

    const prev = currentSession[currentSession.length - 1]
    const prevTime = new Date(prev.photo.created_at!).getTime()
    const currTime = new Date(item.photo.created_at!).getTime()
    const prevDay = prev.photo.created_at!.slice(0, 10)
    const currDay = item.photo.created_at!.slice(0, 10)

    if (prevDay === currDay && Math.abs(currTime - prevTime) <= SESSION_MAX_GAP_MS) {
      currentSession.push(item)
    } else {
      sessions.push(currentSession)
      currentSession = [item]
    }
  }
  if (currentSession.length > 0) sessions.push(currentSession)

  // Step 3: Session-level Propagation
  for (const session of sessions) {
    const anchors = session.filter(s => s.isAnchor && s.locationName)
    if (anchors.length > 0) {
      // Find dominant location & landmark
      const locCounts: Record<string, number> = {}
      anchors.forEach(a => {
        locCounts[a.locationName!] = (locCounts[a.locationName!] || 0) + 1
      })
      const dominantLoc = Object.keys(locCounts).sort((a, b) => locCounts[b] - locCounts[a])[0]
      const anchorMatch = anchors.find(a => a.locationName === dominantLoc) || anchors[0]

      // Centroid GPS
      const validGps = anchors.filter(a => a.lat !== null && a.lon !== null)
      const avgLat = validGps.length > 0 ? validGps.reduce((sum, a) => sum + a.lat!, 0) / validGps.length : undefined
      const avgLon = validGps.length > 0 ? validGps.reduce((sum, a) => sum + a.lon!, 0) / validGps.length : undefined

      for (const item of session) {
        if (!item.locationName) {
          item.locationName = dominantLoc
          item.city = anchorMatch.city
          item.landmark = anchorMatch.landmark
          item.lat = avgLat ?? null
          item.lon = avgLon ?? null
          item.isInferred = true
          item.confidence = 80
        }
      }
    }
  }

  // Step 4: Day-Level Trip Propagation
  // If an entire calendar day has 100% consistent city anchors (e.g. whole day in Agra or Delhi),
  // propagate to remaining unlocated photos taken on that same calendar day.
  const dayAnchorsMap: Record<string, { cities: Set<string>; dominantCity: string; avgLat?: number; avgLon?: number }> = {}

  for (const item of timestamped) {
    if (item.city && item.isAnchor) {
      const day = item.photo.created_at!.slice(0, 10)
      if (!dayAnchorsMap[day]) {
        dayAnchorsMap[day] = { cities: new Set(), dominantCity: item.city }
      }
      dayAnchorsMap[day].cities.add(item.city)
    }
  }

  for (const [day, info] of Object.entries(dayAnchorsMap)) {
    if (info.cities.size === 1) {
      const city = Array.from(info.cities)[0]
      const dayItems = timestamped.filter(t => t.photo.created_at!.slice(0, 10) === day)
      const gpsItems = dayItems.filter(t => t.lat !== null && t.lon !== null)
      const dayAvgLat = gpsItems.length > 0 ? gpsItems.reduce((s, i) => s + i.lat!, 0) / gpsItems.length : undefined
      const dayAvgLon = gpsItems.length > 0 ? gpsItems.reduce((s, i) => s + i.lon!, 0) / gpsItems.length : undefined

      for (const item of dayItems) {
        if (!item.locationName) {
          item.locationName = city
          item.city = city
          item.lat = dayAvgLat ?? null
          item.lon = dayAvgLon ?? null
          item.isInferred = true
          item.confidence = 75
        }
      }
    }
  }

  // Return final clustered results (ONLY items with a verified or inferred location)
  const results: ClusteredPhotoResult[] = []
  for (const item of resolved) {
    if (item.locationName && item.city) {
      results.push({
        id: item.photo.id,
        locationName: item.locationName,
        city: item.city,
        landmark: item.landmark || undefined,
        lat: item.lat ?? undefined,
        lon: item.lon ?? undefined,
        isInferred: item.isInferred,
        confidence: item.confidence
      })
    }
  }

  return results
}
