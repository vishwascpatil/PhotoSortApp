import { BrowserWindow, net } from 'electron'
import {
  getAllPhotosForLocationClustering,
  savePhotoLocationAndCoords,
  rebuildExifData,
  saveDatabase
} from './database'
import { clusterAndPropagateLocations } from './services/location/sessionClusterer'

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

// Fallback: extract location name from folder path structure for organized folders
export function extractLocationFromPath(filePath: string): string | null {
  if (!filePath) return null
  const parts = filePath.replace(/\\/g, '/').split('/')
  parts.pop() // remove filename

  const currentUserName = (process.env.USERNAME || '').toLowerCase()

  const ignoreFolders = new Set([
    'photos', 'dcim', 'camera', 'pictures', 'downloads', 'desktop',
    'documents', 'users', 'vishwas photos', 'vishwas', 'vishw', '100apple',
    '101apple', '102apple', '103apple', 'testfolder', 'new folder', 'temp', 'sorted',
    '06-02-2022(f)', '17 pro max-backup'
  ])

  for (let i = parts.length - 1; i >= 0; i--) {
    let folder = parts[i].trim()
    if (!folder) continue
    const lower = folder.toLowerCase()

    // NEVER use username, windows profile, drive root, device or backup names
    if (
      lower === currentUserName ||
      lower === 'vishw' ||
      lower === 'vishwas' ||
      lower === 'users' ||
      lower === 'c:' ||
      lower === 'd:' ||
      lower.includes('backup') ||
      lower.includes('pro max') ||
      lower.includes('iphone') ||
      lower.includes('apple')
    ) {
      continue
    }

    if (ignoreFolders.has(lower)) {
      continue
    }

    // Clean folder names: remove dates, years, copy suffixes, "trip", "vacation"
    folder = folder
      .replace(/\s*\(\d{4}\)\s*/g, '')
      .replace(/[-_]\s*copy(\s*-\s*copy)*/gi, '')
      .replace(/\b(trip|tour|vacation|photos|pics|travel|visit|diaries)\b/gi, '')
      .replace(/[-_]+/g, ' ')
      .trim()

    // Title Case format (e.g. "delhi agra" -> "Delhi Agra")
    const formatted = folder
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')

    if (formatted.length > 2 && !ignoreFolders.has(lower) && !/^\d+$/.test(folder) && !/^\d{2}-\d{2}-\d{4}/.test(folder)) {
      return formatted
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
    // 1. Rebuild EXIF GPS data from disk files if missing
    await rebuildExifData()
  } catch (e) {
    console.warn('rebuildExifData warning:', e)
  }

  const allPhotos = getAllPhotosForLocationClustering()
  if (allPhotos.length === 0) {
    isScanningLocations = false
    currentProgress = { isScanning: false, scannedCount: 0, totalCount: 0, status: 'No photos to scan' }
    broadcastLocationProgress()
    return
  }

  currentProgress = {
    isScanning: true,
    scannedCount: 0,
    totalCount: allPhotos.length,
    status: `Analyzing landmarks & GPS coordinates for ${allPhotos.length} photos...`
  }
  broadcastLocationProgress()

  try {
    // 2. Run Spatio-Temporal Session Clustering & Offline Landmark Geofencing
    const clusteredResults = clusterAndPropagateLocations(allPhotos)

    // Map by photo ID for quick lookup
    const clusteredMap = new Map(clusteredResults.map(r => [r.id, r]))

    let matchedCount = 0

    // 3. Apply results & folder fallbacks
    for (const photo of allPhotos) {
      if (!isScanningLocations) break

      const match = clusteredMap.get(photo.id)

      if (match) {
        // Save verified landmark / city location and coordinates
        savePhotoLocationAndCoords(photo.id, match.locationName, match.lat, match.lon)
        matchedCount++
      } else {
        // Check folder path fallback
        const pathLoc = extractLocationFromPath(photo.file_path || photo.source_folder_path || '')
        if (pathLoc) {
          savePhotoLocationAndCoords(photo.id, pathLoc)
          matchedCount++
        } else {
          // Leave NULL so unplaced photos do NOT pollute the Places page as "Unknown Location"
          savePhotoLocationAndCoords(photo.id, null as any)
        }
      }

      currentProgress.scannedCount++
      if (currentProgress.scannedCount % 20 === 0 || currentProgress.scannedCount === allPhotos.length) {
        broadcastLocationProgress()
      }
    }

    saveDatabase()

    currentProgress = {
      isScanning: false,
      scannedCount: allPhotos.length,
      totalCount: allPhotos.length,
      status: `Successfully mapped ${matchedCount} photos to places!`
    }
  } catch (err: any) {
    console.error('Error during location scan:', err)
    currentProgress = {
      isScanning: false,
      scannedCount: currentProgress.scannedCount,
      totalCount: allPhotos.length,
      status: `Scan error: ${err?.message || err}`
    }
  } finally {
    isScanningLocations = false
    broadcastLocationProgress()
  }
}
