import { BrowserWindow } from 'electron'
import {
  savePhotoLocationAndCoords,
  rebuildExifData,
  saveDatabase,
  getGeoPhotos,
  getAllPhotosForLocationClustering
} from './database'
import { lookupCoordinatesOffline } from './services/location/landmarkRegistry'
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

/**
 * Scans photo library for locations:
 * 1. Reads all EXIF GPS metadata from files with high-speed exifr parser.
 * 2. Reverse geocodes genuine GPS anchor photos using offline landmark & city registry.
 * 3. Clusters companion photos by spatio-temporal sessions and camera sequences,
 *    propagating verified locations and centroid coordinates so the entire trip/outing is mapped.
 */
export async function scanLocations() {
  if (isScanningLocations) return
  isScanningLocations = true

  currentProgress = { isScanning: true, scannedCount: 0, totalCount: 1, status: 'Reading EXIF GPS metadata from files...' }
  broadcastLocationProgress()

  try {
    // 1. Rebuild EXIF GPS data from disk files if missing
    await rebuildExifData()
  } catch (e) {
    console.warn('rebuildExifData warning:', e)
  }

  try {
    // 2. Reverse geocode photos with genuine direct EXIF GPS
    const directGeo = getGeoPhotos()
    for (const photo of directGeo) {
      if (typeof photo.gps_lat === 'number' && typeof photo.gps_lon === 'number') {
        const geo = lookupCoordinatesOffline(photo.gps_lat, photo.gps_lon)
        if (geo) {
          savePhotoLocationAndCoords(photo.id, geo.locationName, photo.gps_lat, photo.gps_lon)
        }
      }
    }

    // 3. Spatio-Temporal Session & Camera Sequence Outing Propagation
    const allLibraryPhotos = getAllPhotosForLocationClustering()

    currentProgress = {
      isScanning: true,
      scannedCount: 0,
      totalCount: allLibraryPhotos.length,
      status: `Clustering ${allLibraryPhotos.length} photos by outings & locations...`
    }
    broadcastLocationProgress()

    const clustered = clusterAndPropagateLocations(allLibraryPhotos.map(p => ({
      id: p.id,
      filename: p.filename,
      created_at: p.created_at,
      file_path: p.file_path,
      source_folder_path: p.source_folder_path,
      gps_lat: p.gps_lat,
      gps_lon: p.gps_lon,
      location_name: p.location_name,
      extracted_text: p.extracted_text
    })))

    let mappedCount = 0
    for (let i = 0; i < clustered.length; i++) {
      if (!isScanningLocations) break
      const item = clustered[i]
      if (item.locationName && item.lat !== undefined && item.lon !== undefined) {
        // Subtle natural dispersion (< 150m) for companion photos so they cluster organically
        let lat = item.lat
        let lon = item.lon
        if (item.isInferred) {
          const seed = ((item.id % 97) - 48) / 80000
          lat = lat + seed
          lon = lon + seed
        }
        savePhotoLocationAndCoords(item.id, item.locationName, lat, lon)
        mappedCount++
      }

      if (i % 20 === 0 || i === clustered.length - 1) {
        currentProgress.scannedCount = i + 1
        broadcastLocationProgress()
      }
    }

    saveDatabase()

    const finalGeo = getGeoPhotos()
    currentProgress = {
      isScanning: false,
      scannedCount: finalGeo.length,
      totalCount: allLibraryPhotos.length,
      status: `Mapped ${finalGeo.length} photos across locations!`
    }
  } catch (err: any) {
    console.error('Error during location scan:', err)
    currentProgress = {
      isScanning: false,
      scannedCount: currentProgress.scannedCount,
      totalCount: currentProgress.totalCount,
      status: `Scan error: ${err?.message || err}`
    }
  } finally {
    isScanningLocations = false
    broadcastLocationProgress()
  }
}
