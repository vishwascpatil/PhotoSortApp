import { contextBridge, ipcRenderer } from 'electron'

export interface PhotoFilter {
  isFavorite?: boolean
  isArchived?: boolean
  isTrashed?: boolean
  isLocked?: boolean
  albumId?: number
  folderPath?: string
  search?: string
  limit?: number
  offset?: number
}

export interface PhotoRow {
  id: number
  file_path: string
  thumbnail_path: string | null
  preview_path: string | null
  filename: string
  mime_type: string
  width: number
  height: number
  file_size: number
  created_at: string
  imported_at: string
  is_favorite: number
  is_archived: number
  is_trashed: number
  trashed_at: string | null
  rating: number
  orientation: number
  blur_score?: number
  perceptual_hash?: string
  extracted_text?: string
  is_document?: number
  document_category?: string | null
  location_name?: string | null
}

export interface AlbumRow {
  id: number
  name: string
  cover_photo_id: number | null
  created_at: string
  updated_at: string
  photo_count?: number
  cover_thumbnail?: string | null
}

export interface ImportStatus {
  stage: 'scanning' | 'processing' | 'saving' | 'thumbnails' | 'done'
  message: string
  total?: number
  completed?: number
}

export interface ExifData {
  photo_id: number
  make?: string
  model?: string
  iso?: number
  f_number?: number
  exposure_time?: string
  focal_length?: number
  gps_lat?: number
  gps_lon?: number
  date_taken?: string
  lens_model?: string
}

const api = {
  // Photos
  importFolder: (): Promise<{ success: boolean; count: number; message?: string }> =>
    ipcRenderer.invoke('photos:import-folder'),
  importFiles: (): Promise<{ success: boolean; count: number }> =>
    ipcRenderer.invoke('photos:import-files'),
  getPhotos: (filter?: PhotoFilter): Promise<PhotoRow[]> =>
    ipcRenderer.invoke('photos:get-all', filter || {}),
  getGeoPhotos: (): Promise<any[]> =>
    ipcRenderer.invoke('photos:get-geo'),
  exportPhotos: (ids: number[], destination: string): Promise<boolean> =>
    ipcRenderer.invoke('photos:export', ids, destination),
  getPhotoById: (id: number): Promise<{ photo: PhotoRow; exif?: ExifData }> =>
    ipcRenderer.invoke('photos:get-by-id', id),
  getHighResPreview: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('photos:get-highres-preview', filePath),
  prefetchHighRes: (filePaths: string[]): Promise<boolean> =>
    ipcRenderer.invoke('photos:prefetch-highres', filePaths),
  getPhotoCount: (filter?: PhotoFilter): Promise<number> =>
    ipcRenderer.invoke('photos:get-count', filter || {}),
  toggleFavorite: (id: number): Promise<boolean> =>
    ipcRenderer.invoke('photos:toggle-favorite', id),
  batchFavorite: (ids: number[], favorite: boolean): Promise<boolean> =>
    ipcRenderer.invoke('photos:batch-favorite', ids, favorite),
  archive: (ids: number[]): Promise<boolean> =>
    ipcRenderer.invoke('photos:archive', ids),
  unarchive: (ids: number[]): Promise<boolean> =>
    ipcRenderer.invoke('photos:unarchive', ids),
  lockPhotos: (ids: number[], locked: boolean): Promise<boolean> =>
    ipcRenderer.invoke('photos:lock', ids, locked),
  updateMetadata: (id: number, data: { description?: string; created_at?: string }): Promise<boolean> =>
    ipcRenderer.invoke('photos:update-metadata', id, data),
  trash: (ids: number[]): Promise<boolean> =>
    ipcRenderer.invoke('photos:trash', ids),
  emptyTrash: (): Promise<boolean> => ipcRenderer.invoke('photos:empty-trash'),
  getUnanalyzedPhotos: (): Promise<any[]> => ipcRenderer.invoke('photos:get-unanalyzed'),
  savePhotoAnalysis: (photoId: number, blurScore: number, perceptualHash: string): Promise<boolean> => ipcRenderer.invoke('photos:save-analysis', photoId, blurScore, perceptualHash),
  getUtilitiesData: (): Promise<any> => ipcRenderer.invoke('photos:get-utilities-data'),
  scanDuplicates: (): Promise<any> => ipcRenderer.invoke('photos:scan-duplicates'),
  onDuplicateScanProgress: (callback: (progress: { scanned: number; total: number }) => void): (() => void) => {
    const handler = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('duplicate-scan:progress', handler)
    return () => ipcRenderer.removeListener('duplicate-scan:progress', handler)
  },
  getUnscannedDocs: (): Promise<any[]> => ipcRenderer.invoke('photos:get-unscanned-docs'),
  saveDocumentScan: (photoId: number, text: string, isDocument: boolean, category: string | null): Promise<boolean> => ipcRenderer.invoke('photos:save-document-scan', photoId, text, isDocument, category),
  resetLocationScanData: (): Promise<boolean> => ipcRenderer.invoke('locations:reset'),
  resetDocumentScanData: (): Promise<boolean> => ipcRenderer.invoke('docs:reset'),
  resetUtilityScanData: (): Promise<boolean> => ipcRenderer.invoke('analysis:reset'),
  fastDocPrefilter: (): Promise<{ candidateIds: number[], totalPhotos: number }> => ipcRenderer.invoke('docs:fast-prefilter'),
  stopFastDocScan: (): Promise<boolean> => ipcRenderer.invoke('docs:stop-fast-scan'),
  getOcrBuffer: (photoId: number): Promise<string | null> => ipcRenderer.invoke('docs:get-ocr-buffer', photoId),
  saveDocBatch: (results: Array<{ id: number, text: string, isDocument: boolean, category: string | null }>): Promise<boolean> => ipcRenderer.invoke('docs:save-batch', results),
  onDocScanProgress: (callback: (progress: any) => void): (() => void) => {
    const handler = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('doc-scan:progress', handler)
    return () => ipcRenderer.removeListener('doc-scan:progress', handler)
  },
  restore: (ids: number[]): Promise<boolean> =>
    ipcRenderer.invoke('photos:restore', ids),
  deletePermanently: (ids: number[]): Promise<boolean> =>
    ipcRenderer.invoke('photos:delete-permanently', ids),
  getTimeline: (): Promise<{ date: string; count: number }[]> =>
    ipcRenderer.invoke('photos:get-timeline'),
  getStats: (): Promise<{ totalPhotos: number; totalSize: number; favorites: number; albums: number }> =>
    ipcRenderer.invoke('photos:get-stats'),
  search: (query: string): Promise<PhotoRow[]> =>
    ipcRenderer.invoke('photos:search', query),
  openInExplorer: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('photos:open-in-explorer', filePath),
  editPhoto: (id: number, edits: Record<string, unknown>): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('photos:edit', id, edits),

  // Albums
  createAlbum: (name: string): Promise<AlbumRow> =>
    ipcRenderer.invoke('albums:create', name),
  getAlbums: (): Promise<AlbumRow[]> =>
    ipcRenderer.invoke('albums:get-all'),
  getAlbumById: (id: number): Promise<AlbumRow> =>
    ipcRenderer.invoke('albums:get-by-id', id),
  updateAlbum: (id: number, name: string): Promise<AlbumRow> =>
    ipcRenderer.invoke('albums:update', id, name),
  deleteAlbum: (id: number): Promise<boolean> =>
    ipcRenderer.invoke('albums:delete', id),
  addPhotosToAlbum: (albumId: number, photoIds: number[]): Promise<AlbumRow> =>
    ipcRenderer.invoke('albums:add-photos', albumId, photoIds),
  removePhotosFromAlbum: (albumId: number, photoIds: number[]): Promise<AlbumRow> =>
    ipcRenderer.invoke('albums:remove-photos', albumId, photoIds),

  // People & Faces
  getPeople: (): Promise<any[]> => ipcRenderer.invoke('people:get-all'),
  createPerson: (name: string, coverPhotoId?: number, faceBase64?: string): Promise<number> => ipcRenderer.invoke('people:create', name, coverPhotoId, faceBase64),
  updatePersonName: (personId: number, name: string): Promise<boolean> => ipcRenderer.invoke('people:update-name', personId, name),
  deletePerson: (personId: number): Promise<boolean> => ipcRenderer.invoke('people:delete', personId),
  mergePeople: (primaryId: number, secondaryId: number): Promise<boolean> => ipcRenderer.invoke('people:merge', primaryId, secondaryId),
  addPhotoToPerson: (personId: number, photoId: number): Promise<boolean> => ipcRenderer.invoke('people:add-photo', personId, photoId),
  removePhotoFromPerson: (personId: number, photoId: number): Promise<boolean> => ipcRenderer.invoke('people:remove-photo', personId, photoId),
  togglePersonFavorite: (personId: number): Promise<boolean> => ipcRenderer.invoke('people:toggle-favorite', personId),
  setPersonCoverPhoto: (personId: number, photoId: number, faceBase64?: string): Promise<boolean> => ipcRenderer.invoke('people:set-cover-photo', personId, photoId, faceBase64),
  getPhotosByPerson: (personId: number): Promise<PhotoRow[]> =>
    ipcRenderer.invoke('people:get-photos', personId),

  // Face Recognition
  getAllFaceDescriptors: (): Promise<{ id: number, photo_id: number, person_id: number, descriptor: string }[]> =>
    ipcRenderer.invoke('faces:get-all'),
  saveFaceDescriptor: (photoId: number, personId: number, descriptor: number[]): Promise<boolean> => ipcRenderer.invoke('faces:save', photoId, personId, descriptor),
  getUnscannedPhotos: (): Promise<any[]> => ipcRenderer.invoke('faces:get-unscanned'),
  markPhotoScanned: (photoId: number) => ipcRenderer.invoke('faces:mark-scanned', photoId),
  resetFaceScanData: () => ipcRenderer.invoke('faces:reset'),
  getMergeSuggestions: (): Promise<any[]> => ipcRenderer.invoke('faces:get-merge-suggestions'),

  // Location Scanner
  startLocationScan: (): Promise<boolean> => ipcRenderer.invoke('photos:start-location-scan'),
  stopLocationScan: (): Promise<boolean> => ipcRenderer.invoke('photos:stop-location-scan'),
  updateLocationName: (photoIds: number[], newLocationName: string): Promise<boolean> =>
    ipcRenderer.invoke('locations:update-name', photoIds, newLocationName),
  onLocationScanProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('location-scan:progress', listener)
    return () => {
      ipcRenderer.removeListener('location-scan:progress', listener)
    }
  },

  // Folders & Sync
  getImportedFolders: (): Promise<{ id: number; folder_path: string; folder_name: string; photo_count: number; last_synced_at: string; created_at: string }[]> =>
    ipcRenderer.invoke('folders:get-all'),
  syncFolder: (folderPath: string): Promise<{ folderPath: string; addedCount: number; removedCount: number }> =>
    ipcRenderer.invoke('folders:sync', folderPath),
  syncAllFolders: (): Promise<{ folderPath: string; addedCount: number; removedCount: number }[]> =>
    ipcRenderer.invoke('folders:sync-all'),
  removeImportedFolder: (folderId: number): Promise<boolean> =>
    ipcRenderer.invoke('folders:remove', folderId),

  // Screenshot Classifier
  classifyScreenshot: (filePath: string): Promise<{ classification: string; score: number; matchedSignals: string[] }> =>
    ipcRenderer.invoke('screenshots:classify', filePath),
  classifyScreenshotBatch: (filePaths: string[]): Promise<Map<string, { classification: string; score: number; matchedSignals: string[] }>> =>
    ipcRenderer.invoke('screenshots:classify-batch', filePaths),

  // Junk / Forwarded Media Classifier
  classifyJunk: (filePath: string): Promise<any> =>
    ipcRenderer.invoke('junk:classify', filePath),
  classifyJunkBatch: (filePaths: string[]): Promise<Map<string, any>> =>
    ipcRenderer.invoke('junk:classify-batch', filePaths),

  // Document Detector
  detectDocument: (filePath: string): Promise<any> =>
    ipcRenderer.invoke('documents:detect', filePath),
  detectDocumentBatch: (filePaths: string[]): Promise<any[]> =>
    ipcRenderer.invoke('documents:detect-batch', filePaths),

  // Tags API
  getAllTags: (): Promise<Array<{ id: number; name: string; color: string; photo_count: number }>> =>
    ipcRenderer.invoke('tags:get-all'),
  createTag: (name: string, color?: string): Promise<{ id: number; name: string; color: string }> =>
    ipcRenderer.invoke('tags:create', name, color),
  deleteTag: (tagId: number): Promise<boolean> =>
    ipcRenderer.invoke('tags:delete', tagId),
  renameTag: (tagId: number, newName: string, newColor?: string): Promise<boolean> =>
    ipcRenderer.invoke('tags:rename', tagId, newName, newColor),
  addTagsToPhotos: (photoIds: number[], tagIds: number[]): Promise<boolean> =>
    ipcRenderer.invoke('tags:add-to-photos', photoIds, tagIds),
  syncPhotoTags: (photoIds: number[], tagIds: number[]): Promise<boolean> =>
    ipcRenderer.invoke('tags:sync-photos', photoIds, tagIds),
  removeTagFromPhotos: (photoIds: number[], tagId: number): Promise<boolean> =>
    ipcRenderer.invoke('tags:remove-from-photos', photoIds, tagId),
  getTagsForPhoto: (photoId: number): Promise<Array<{ id: number; name: string; color: string }>> =>
    ipcRenderer.invoke('tags:get-for-photo', photoId),
  getPhotosByTag: (tagId: number): Promise<any[]> =>
    ipcRenderer.invoke('tags:get-photos-by-tag', tagId),
  getAllTaggedPhotos: (): Promise<any[]> =>
    ipcRenderer.invoke('tags:get-all-tagged-photos'),

  // Large Files Mover & Relocation
  selectLargeFilesDestination: (): Promise<string | null> =>
    ipcRenderer.invoke('large-files:select-destination'),
  moveLargeFiles: (options: {
    fileIds: number[]
    destinationDir: string
    preserveRelativeSubpath?: boolean
    collisionStrategy?: 'rename' | 'skip' | 'overwrite'
    updateDatabasePath?: boolean
  }): Promise<{
    success: boolean
    manifestId: string
    movedCount: number
    skippedCount: number
    failedCount: number
    totalBytesMoved: number
    errors: string[]
  }> => ipcRenderer.invoke('large-files:move', options),
  undoLargeFileMove: (manifestId: string): Promise<{
    success: boolean
    restoredCount: number
    failedCount: number
    errors: string[]
  }> => ipcRenderer.invoke('large-files:undo', manifestId),
  getLargeFileManifests: (): Promise<any[]> =>
    ipcRenderer.invoke('large-files:get-manifests'),
  onLargeFilesProgress: (callback: (progress: { completed: number; total: number; currentFile: string; bytesMoved: number; totalBytes: number; percentage: number }) => void): (() => void) => {
    const handler = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('large-files:progress', handler)
    return () => ipcRenderer.removeListener('large-files:progress', handler)
  },
  onLargeFilesUndoProgress: (callback: (progress: { completed: number; total: number; currentFile: string; bytesMoved: number; totalBytes: number; percentage: number }) => void): (() => void) => {
    const handler = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('large-files:undo-progress', handler)
    return () => ipcRenderer.removeListener('large-files:undo-progress', handler)
  },

  // System ──────────────────────────────────────────────────────────
  getPlatform: (): Promise<string> =>
    ipcRenderer.invoke('system:get-platform'),
  logError: (type: string, message: string): Promise<boolean> =>
    ipcRenderer.invoke('system:log-error', type, message),
  minimizeWindow: (): Promise<boolean> =>
    ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<boolean> =>
    ipcRenderer.invoke('window:maximize'),
  closeWindow: (): Promise<boolean> =>
    ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('window:is-maximized'),

  // Event listeners
  onImportStatus: (callback: (status: ImportStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ImportStatus): void => {
      callback(status)
    }
    ipcRenderer.on('import:status', handler)
    return () => ipcRenderer.removeListener('import:status', handler)
  },

  onPhotoThumbnailUpdated: (callback: (photoId: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, photoId: number): void => {
      callback(photoId)
    }
    ipcRenderer.on('photo:thumbnail-updated', handler)
    return () => ipcRenderer.removeListener('photo:thumbnail-updated', handler)
  },

  onVideoThumbnailProgress: (callback: (status: { total: number; completed: number; active: boolean }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: { total: number; completed: number; active: boolean }): void => {
      callback(status)
    }
    ipcRenderer.on('video-thumbnail:progress', handler)
    return () => ipcRenderer.removeListener('video-thumbnail:progress', handler)
  },

  onSyncStatus: (callback: (status: { folderPath: string; stage: string; message: string; completed: number; total: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: { folderPath: string; stage: string; message: string; completed: number; total: number }): void => {
      callback(status)
    }
    ipcRenderer.on('sync:status', handler)
    return () => ipcRenderer.removeListener('sync:status', handler)
  },

  onSyncAllCompleted: (callback: (results: { folderPath: string; addedCount: number; removedCount: number }[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, results: { folderPath: string; addedCount: number; removedCount: number }[]): void => {
      callback(results)
    }
    ipcRenderer.on('sync:all-completed', handler)
    return () => ipcRenderer.removeListener('sync:all-completed', handler)
  },

  onMenuImportFolder: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:import-folder', handler)
    return () => ipcRenderer.removeListener('menu:import-folder', handler)
  },

  onMenuImportFiles: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:import-files', handler)
    return () => ipcRenderer.removeListener('menu:import-files', handler)
  },

  // ─── Library Organizer & Folder Exporter ──────────────────────────────
  selectOrganizationDestination: (): Promise<string | null> =>
    ipcRenderer.invoke('organizer:select-destination'),
  previewOrganizationPlan: (options: any): Promise<any> =>
    ipcRenderer.invoke('organizer:preview-plan', options),
  executeOrganization: (options: any): Promise<any> =>
    ipcRenderer.invoke('organizer:execute', options),
  cancelOrganization: (): Promise<boolean> =>
    ipcRenderer.invoke('organizer:cancel'),
  showInFolder: (folderPath: string): Promise<boolean> =>
    ipcRenderer.invoke('organizer:show-in-folder', folderPath),
  onOrganizationProgress: (callback: (progress: any) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any): void => {
      callback(progress)
    }
    ipcRenderer.on('organizer:progress', handler)
    return () => ipcRenderer.removeListener('organizer:progress', handler)
  }
}

contextBridge.exposeInMainWorld('photoVault', api)

export type PhotoVaultAPI = typeof api
