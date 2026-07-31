import { BrowserWindow, net } from 'electron'
import { getPhotosWithMissingLocation, savePhotoLocation, rebuildExifData } from './database'

export interface LocationScanProgress {
  isScanning: boolean
  scannedCount: number
  totalCount: number
  status: string
}

let isScanningLocations = false
let currentProgress: LocationScanProgress = {
  isScanning: false,
  scannedCount: 0,
  totalCount: 0,
  status: 'Idle'
}

// In-memory cache to group nearby coordinates (~1.1km precision)
const locationCache: Record<string, string> = {}

function broadcastLocationProgress() {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
      w.webContents.send('location-scan:progress', currentProgress)
    }
  })
}

export function stopLocationScanning() {
  isScanningLocations = false
  currentProgress.isScanning = false
  currentProgress.status = 'Stopped'
  broadcastLocationProgress()
}

// Fallback: extract location name from folder path structure
function extractLocationFromPath(filePath: string): string | null {
  if (!filePath) return null
  const parts = filePath.replace(/\\/g, '/').split('/')
  parts.pop() // remove filename
  
  const ignoreFolders = new Set(['photos', 'dcim', 'camera', 'pictures', 'downloads', 'desktop', 'documents', 'users', 'vishwas photos', 'vishwas', '100apple', '101apple', '102apple', '103apple'])
  
  for (let i = parts.length - 1; i >= 0; i--) {
    let folder = parts[i].trim()
    if (!folder) continue
    const lower = folder.toLowerCase()
    
    // Clean folder names like "New Delhi (2026)" -> "New Delhi"
    folder = folder.replace(/\s*\(\d{4}\)\s*/g, '').trim()
    
    if (folder.length > 2 && !ignoreFolders.has(lower) && !/^\d+$/.test(folder)) {
      return folder
    }
  }
  return null
}

export async function scanLocations() {
  if (isScanningLocations) return
  isScanningLocations = true

  currentProgress = { isScanning: true, scannedCount: 0, totalCount: 1, status: 'Reading EXIF GPS metadata...' }
  broadcastLocationProgress()

  try {
    await rebuildExifData()
  } catch (e) { }

  const photosToScan = getPhotosWithMissingLocation()
  if (photosToScan.length === 0) {
    isScanningLocations = false
    currentProgress = { isScanning: false, scannedCount: 0, totalCount: 0, status: 'No photos to scan' }
    broadcastLocationProgress()
    return
  }

  currentProgress = {
    isScanning: true,
    scannedCount: 0,
    totalCount: photosToScan.length,
    status: `Starting location scan for ${photosToScan.length} photos...`
  }
  broadcastLocationProgress()

  for (const photo of photosToScan) {
    if (!isScanningLocations) break

    try {
      currentProgress.status = `Locating ${photo.filename}...`
      broadcastLocationProgress()

      const lat = photo.gps_lat
      const lon = photo.gps_lon
      let locationName: string | null = null

      if (lat !== null && lon !== null && typeof lat === 'number' && typeof lon === 'number') {
        const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`
        locationName = locationCache[cacheKey] || null

        if (!locationName) {
          try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10`
            const response = await net.fetch(url, {
              headers: {
                'User-Agent': 'PhotoVaultApp/1.0 (contact@example.com)'
              }
            })
            if (response.ok) {
              const data = (await response.json()) as any
              if (data && data.address) {
                locationName = data.address.city || data.address.town || data.address.village || data.address.state || data.address.country || null
              }
            }
          } catch { }

          if (locationName) {
            locationCache[`${lat.toFixed(2)},${lon.toFixed(2)}`] = locationName
          }
          await new Promise(r => setTimeout(r, 1200))
        }
      }

      // Fallback: extract location from folder path if GPS reverse geocoding didn't return a name
      if (!locationName || locationName === 'Unknown Location') {
        const pathLocation = extractLocationFromPath(photo.file_path || photo.source_folder_path || '')
        if (pathLocation) {
          locationName = pathLocation
        } else {
          locationName = 'Unknown Location'
        }
      }

      savePhotoLocation(photo.id, locationName)

      currentProgress.scannedCount++
      if (currentProgress.scannedCount % 5 === 0 || currentProgress.scannedCount === currentProgress.totalCount) {
        broadcastLocationProgress()
      }
    } catch (err) {
      console.error('Error scanning location for photo', photo.id, err)
    }
  }

  isScanningLocations = false
  currentProgress.isScanning = false
  currentProgress.status = 'Completed'
  broadcastLocationProgress()
}
