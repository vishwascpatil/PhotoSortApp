import type { PhotoRow, AlbumRow, PhotoFilter, ImportStatus } from '../../preload/index'

const samplePhotos: PhotoRow[] = [
  {
    id: 1,
    file_path: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80',
    thumbnail_path: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    preview_path: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    filename: 'Yosemite_Valley_Sunset.jpg',
    mime_type: 'image/jpeg',
    width: 3840,
    height: 2160,
    file_size: 4850120,
    created_at: new Date(Date.now() - 86400000 * 0.5).toISOString(),
    imported_at: new Date().toISOString(),
    is_favorite: 1,
    is_archived: 0,
    is_trashed: 0,
    trashed_at: null,
    rating: 5,
    orientation: 1
  },
  {
    id: 2,
    file_path: 'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?auto=format&fit=crop&w=1600&q=80',
    thumbnail_path: 'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?auto=format&fit=crop&w=600&q=80',
    preview_path: 'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?auto=format&fit=crop&w=1200&q=80',
    filename: 'Mountain_Lake_Reflection.jpg',
    mime_type: 'image/jpeg',
    width: 4000,
    height: 2667,
    file_size: 6120400,
    created_at: new Date(Date.now() - 86400000 * 1.2).toISOString(),
    imported_at: new Date().toISOString(),
    is_favorite: 1,
    is_archived: 0,
    is_trashed: 0,
    trashed_at: null,
    rating: 4,
    orientation: 1
  },
  {
    id: 3,
    file_path: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=80',
    thumbnail_path: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80',
    preview_path: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
    filename: 'Foggy_Forest_Hike.jpg',
    mime_type: 'image/jpeg',
    width: 3500,
    height: 2333,
    file_size: 3940200,
    created_at: new Date(Date.now() - 86400000 * 2.5).toISOString(),
    imported_at: new Date().toISOString(),
    is_favorite: 0,
    is_archived: 0,
    is_trashed: 0,
    trashed_at: null,
    rating: 3,
    orientation: 1
  },
  {
    id: 4,
    file_path: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1600&q=80',
    thumbnail_path: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=600&q=80',
    preview_path: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
    filename: 'Solo_Photographer_Peaks.jpg',
    mime_type: 'image/jpeg',
    width: 4200,
    height: 2800,
    file_size: 5310000,
    created_at: new Date(Date.now() - 86400000 * 5.0).toISOString(),
    imported_at: new Date().toISOString(),
    is_favorite: 0,
    is_archived: 0,
    is_trashed: 0,
    trashed_at: null,
    rating: 5,
    orientation: 1
  },
  {
    id: 5,
    file_path: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1600&q=80',
    thumbnail_path: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=600&q=80',
    preview_path: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80',
    filename: 'Golden_Hour_Meadow.jpg',
    mime_type: 'image/jpeg',
    width: 3600,
    height: 2400,
    file_size: 4120000,
    created_at: new Date(Date.now() - 86400000 * 8.0).toISOString(),
    imported_at: new Date().toISOString(),
    is_favorite: 1,
    is_archived: 0,
    is_trashed: 0,
    trashed_at: null,
    rating: 4,
    orientation: 1
  },
  {
    id: 6,
    file_path: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1600&q=80',
    thumbnail_path: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=600&q=80',
    preview_path: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1200&q=80',
    filename: 'Whiskers_Cat_Portrait.jpg',
    mime_type: 'image/jpeg',
    width: 3000,
    height: 2000,
    file_size: 2800000,
    created_at: new Date(Date.now() - 86400000 * 12.0).toISOString(),
    imported_at: new Date().toISOString(),
    is_favorite: 0,
    is_archived: 1,
    is_trashed: 0,
    trashed_at: null,
    rating: 3,
    orientation: 1
  }
]

let photosDb = [...samplePhotos]
let albumsDb: AlbumRow[] = [
  {
    id: 1,
    name: 'Nature & Landscapes',
    cover_photo_id: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    photo_count: 4,
    cover_thumbnail: samplePhotos[0].thumbnail_path
  },
  {
    id: 2,
    name: 'Travel 2026',
    cover_photo_id: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    photo_count: 2,
    cover_thumbnail: samplePhotos[1].thumbnail_path
  }
]

export function setupMockApi() {
  if (typeof window === 'undefined' || window.photoVault) return

  console.log('[Mock API] Electron contextBridge not found. Enabling Web Browser Demo Mode.')

  window.photoVault = {
    importFolder: async () => {
      alert('In desktop app mode, this opens native folder selection dialog to scan and import photos from PC.')
      return { success: true, count: samplePhotos.length }
    },
    importFiles: async () => {
      return { success: true, count: 0 }
    },
    getPhotos: async (filter: PhotoFilter = {}) => {
      let result = photosDb.filter(p => {
        if (filter.isTrashed !== undefined && (p.is_trashed ? 1 : 0) !== (filter.isTrashed ? 1 : 0)) return false
        if (filter.isTrashed === undefined && p.is_trashed) return false
        if (filter.isFavorite !== undefined && (p.is_favorite ? 1 : 0) !== (filter.isFavorite ? 1 : 0)) return false
        if (filter.isArchived !== undefined && (p.is_archived ? 1 : 0) !== (filter.isArchived ? 1 : 0)) return false
        if (filter.isArchived === undefined && !filter.isTrashed && p.is_archived) return false
        if (filter.search) {
          const q = filter.search.toLowerCase()
          if (!p.filename.toLowerCase().includes(q)) return false
        }
        return true
      })
      if (filter.limit) {
        const offset = filter.offset || 0
        result = result.slice(offset, offset + filter.limit)
      }
      return result
    },
    getPhotoById: async (id: number) => {
      const photo = photosDb.find(p => p.id === id) || samplePhotos[0]
      return {
        photo,
        exif: {
          photo_id: photo.id,
          make: 'Sony',
          model: 'α7 IV',
          iso: 100,
          f_number: 2.8,
          exposure_time: '1/1000',
          focal_length: 24,
          gps_lat: 37.8651,
          gps_lon: -119.5383,
          date_taken: photo.created_at,
          lens_model: 'FE 24-70mm F2.8 GM II'
        }
      }
    },
    getPhotoCount: async (filter: PhotoFilter = {}) => {
      const photos = await window.photoVault.getPhotos(filter)
      return photos.length
    },
    toggleFavorite: async (id: number) => {
      const p = photosDb.find(item => item.id === id)
      if (p) {
        p.is_favorite = p.is_favorite ? 0 : 1
        return p.is_favorite === 1
      }
      return false
    },
    batchFavorite: async (ids: number[], favorite: boolean) => {
      photosDb.forEach(p => {
        if (ids.includes(p.id)) p.is_favorite = favorite ? 1 : 0
      })
      return true
    },
    archive: async (ids: number[]) => {
      photosDb.forEach(p => {
        if (ids.includes(p.id)) p.is_archived = 1
      })
      return true
    },
    unarchive: async (ids: number[]) => {
      photosDb.forEach(p => {
        if (ids.includes(p.id)) p.is_archived = 0
      })
      return true
    },
    lockPhotos: async (ids: number[], locked: boolean) => {
      photosDb.forEach(p => {
        if (ids.includes(p.id)) (p as any).is_locked = locked ? 1 : 0
      })
      return true
    },
    updateMetadata: async (id: number, data: { description?: string; created_at?: string }) => {
      const photo = photosDb.find(p => p.id === id)
      if (photo) {
        if (data.description !== undefined) (photo as any).description = data.description
        if (data.created_at !== undefined) photo.created_at = data.created_at
      }
      return true
    },
    trash: async (ids: number[]) => {
      photosDb.forEach(p => {
        if (ids.includes(p.id)) {
          p.is_trashed = 1
          p.trashed_at = new Date().toISOString()
        }
      })
      return true
    },
    emptyTrash: async () => true,
    restore: async (ids: number[]) => {
      photosDb.forEach(p => {
        if (ids.includes(p.id)) {
          p.is_trashed = 0
          p.trashed_at = null
        }
      })
      return true
    },
    deletePermanently: async (ids: number[]) => {
      photosDb = photosDb.filter(p => !ids.includes(p.id))
      return true
    },
    getTimeline: async () => {
      return [
        { date: new Date().toISOString().split('T')[0], count: 2 },
        { date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], count: 1 }
      ]
    },
    getStats: async () => {
      return {
        totalPhotos: photosDb.filter(p => !p.is_trashed).length,
        totalSize: photosDb.reduce((acc, curr) => acc + curr.file_size, 0),
        favorites: photosDb.filter(p => p.is_favorite && !p.is_trashed).length,
        albums: albumsDb.length
      }
    },
    search: async (query: string) => {
      return window.photoVault.getPhotos({ search: query })
    },
    openInExplorer: async (filePath: string) => {
      console.log('Open in Explorer:', filePath)
    },
    editPhoto: async (id: number, edits: Record<string, unknown>) => {
      console.log('Edit photo:', id, edits)
      return { success: true }
    },
    createAlbum: async (name: string) => {
      const newAlbum: AlbumRow = {
        id: Date.now(),
        name,
        cover_photo_id: samplePhotos[0].id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        photo_count: 0,
        cover_thumbnail: samplePhotos[0].thumbnail_path
      }
      albumsDb.push(newAlbum)
      return newAlbum
    },
    getAlbums: async () => albumsDb,
    getAlbumById: async (id: number) => albumsDb.find(a => a.id === id) || albumsDb[0],
    updateAlbum: async (id: number, name: string) => {
      const a = albumsDb.find(item => item.id === id)
      if (a) a.name = name
      return a || albumsDb[0]
    },
    deleteAlbum: async (id: number) => {
      albumsDb = albumsDb.filter(a => a.id !== id)
      return true
    },
    addPhotosToAlbum: async (albumId: number, photoIds: number[]) => {
      const a = albumsDb.find(item => item.id === albumId)
      if (a) a.photo_count = (a.photo_count || 0) + photoIds.length
      return a || albumsDb[0]
    },
    removePhotosFromAlbum: async (albumId: number, photoIds: number[]) => {
      const a = albumsDb.find(item => item.id === albumId)
      if (a) a.photo_count = Math.max(0, (a.photo_count || 0) - photoIds.length)
      return a || albumsDb[0]
    },
    getPeople: async () => [
      { id: 1, name: 'Sarah', cover_photo_id: 1, photo_count: 3, cover_thumbnail: samplePhotos[0].thumbnail_path },
      { id: 2, name: 'Alex', cover_photo_id: 2, photo_count: 2, cover_thumbnail: samplePhotos[1].thumbnail_path },
      { id: 3, name: 'Family & Friends', cover_photo_id: 4, photo_count: 4, cover_thumbnail: samplePhotos[3].thumbnail_path }
    ],
    createPerson: async (name: string, coverPhotoId?: number) => Date.now(),
    updatePersonName: async () => true,
    exportPhotos: async (ids: number[], destination: string) => true,
    getGeoPhotos: async () => [],
    getUnanalyzedPhotos: async () => [],
    savePhotoAnalysis: async () => true,
    getUtilitiesData: async () => ({
      whatsapp: [],
      blurry: [],
      duplicates: [],
      similar: []
    }),
    getUnscannedDocs: async () => [],
    saveDocumentScan: async () => true,
    fastDocPrefilter: async () => ({ candidateIds: [], totalPhotos: 0 }),
    stopFastDocScan: async () => true,
    getOcrBuffer: async () => null,
    saveDocBatch: async () => true,
    onDocScanProgress: () => () => {},
    deletePerson: async () => true,
    mergePeople: async () => true,
    addPhotoToPerson: async () => true,
    getPhotosByPerson: async (personId: number) => samplePhotos.slice(0, 3),
    getAllFaceDescriptors: async () => [],
    saveFaceDescriptor: async () => true,
    getUnscannedPhotos: async () => [],
    markPhotoScanned: async () => {},
    resetFaceScanData: async () => {},
    resetLocationScanData: async () => true,
    resetDocumentScanData: async () => true,
    resetUtilityScanData: async () => true,
    getMergeSuggestions: async () => [],
    getImportedFolders: async () => [],
    syncFolder: async (folderPath: string) => ({ folderPath, addedCount: 0, removedCount: 0 }),
    syncAllFolders: async () => [],
    removeImportedFolder: async () => true,
    getPlatform: async () => 'win32',
    logError: async () => true,
    minimizeWindow: async () => true,
    maximizeWindow: async () => true,
    closeWindow: async () => true,
    isWindowMaximized: async () => false,
    startLocationScan: async () => true,
  stopLocationScan: async () => true,
  onLocationScanProgress: () => () => {},
  
  onImportStatus: () => () => {},
    onPhotoThumbnailUpdated: () => () => {},
    onVideoThumbnailProgress: () => () => {},
    onSyncStatus: () => () => {},
    onSyncAllCompleted: () => () => {},
    onMenuImportFolder: () => () => {},
    onMenuImportFiles: () => () => {}
  }
}
