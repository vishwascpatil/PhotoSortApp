import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { basename, join, extname } from 'path'
import { existsSync, copyFileSync } from 'fs'
import { app } from 'electron'
import {
  getPhotos, getGeoPhotos, getPhotoById, getExifByPhotoId, toggleFavorite, batchFavorite,
  setArchived, setTrashed, deletePermanently, getTimeline,
  getStats, getPhotoCount, insertPhotoBatch, updatePhotoThumbnails, updatePhotoThumbnailsBatch,
  createAlbum, getAlbums, getAlbumById, updateAlbum, deleteAlbum,
  addPhotosToAlbum, removePhotosFromAlbum,
  addImportedFolder, getImportedFolders, removeImportedFolder,
  getPeople, createPerson, updatePersonName, deletePerson, addPhotoToPerson, getPhotosByPerson, mergePeople,
  togglePersonFavorite, setPersonCoverPhoto, removePhotoFromPerson,
  getAllFaceDescriptors, saveFaceDescriptor, getUnscannedPhotos, markPhotoScanned, resetFaceScanData, getMergeSuggestions,
  resetLocationScanData, resetDocumentScanData, resetUtilityScanData,
  getUnanalyzedPhotos, savePhotoAnalysis, getUtilitiesData, getUnscannedDocuments, saveDocumentScan,
  scanPerceptualHashesBatch,
  getAllTags, createTag, deleteTag, renameTag, addTagsToPhotos, syncPhotoTags, removeTagFromPhotos, getTagsForPhoto, getPhotosByTag, getAllTaggedPhotos,
  updateLocationNameForPhotos,
  PhotoFilter
} from './database'
import { scanDirectory, processFiles } from './importer'
import { generateThumbnailBatch, generateThumbnail, applyEdits, pauseVideoQueue, resumeVideoQueue } from './thumbnails'
import { syncFolder, syncAllTrackedFolders } from './syncer'
import { scanLocations, stopLocationScanning } from './location-scanner'
import { startFastDocScan, stopFastDocScan, getOcrBuffer } from './fast-doc-scanner'
import { getOrGenerateHighResPreview, prefetchHighResPreviews } from './highres'
import { classifyScreenshot, classifyScreenshotBatch } from './services/screenshot/screenshotDetector'
import { classifyJunkMedia, classifyJunkMediaBatch } from './services/junk/junkDetector'
import { detectDocument } from './services/document/documentDetector'
import {
  selectDestinationDirectory,
  moveLargeFiles,
  undoLargeFileMove,
  getLargeFileManifests,
  LargeFileMoveOptions
} from './services/largeFiles/largeFileMover'
import {
  selectOrganizationDestination,
  generateOrganizationPreviewPlan,
  executeOrganization,
  cancelOrganization,
  OrganizationOptions
} from './services/organizer/libraryOrganizer'
import { logErrorToFile } from './logger'

export function registerIpcHandlers(): void {
  // ─── Import ──────────────────────────────────────────────────────────
  ipcMain.handle('photos:import-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, count: 0 }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections'],
      title: 'Import Photos from Folder'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, count: 0 }
    }

    const selectedDirs = result.filePaths.map(p => p.replace(/\\/g, '/'))
    for (const dirPath of selectedDirs) {
      addImportedFolder(dirPath)
    }

    event.sender.send('import:status', { stage: 'scanning', message: 'Scanning for photos...', total: 0, completed: 0 })

    // Scan for files across all selected folders
    pauseVideoQueue()
    let filePaths: string[] = []
    for (const dirPath of selectedDirs) {
      const scanned = await scanDirectory(dirPath)
      filePaths.push(...scanned)
    }
    filePaths = Array.from(new Set(filePaths)) // Deduplicate

    if (filePaths.length === 0) {
      resumeVideoQueue()
      event.sender.send('import:status', {
        stage: 'done',
        message: 'No supported media files found',
        total: 0,
        completed: 0
      })
      return { success: true, count: 0, message: 'No supported images found' }
    }

    event.sender.send('import:status', {
      stage: 'processing',
      message: `Found ${filePaths.length} photos. Processing metadata...`,
      total: filePaths.length,
      completed: 0
    })

    // Process files (extract metadata) with throttled IPC updates
    let lastProcessSent = 0
    const importedFiles = await processFiles(filePaths, (completed, total, currentFile) => {
      const now = Date.now()
      if (now - lastProcessSent > 120 || completed === total) {
        lastProcessSent = now
        event.sender.send('import:status', {
          stage: 'processing',
          message: `Processing ${basename(currentFile)}... (${completed}/${total})`,
          total,
          completed
        })
      }
    })

    importedFiles.forEach(f => {
      const filePathStr = f?.photo?.file_path || ''
      const normPath = filePathStr.replace(/\\/g, '/')
      const matchedDir = selectedDirs.find(d => normPath.startsWith(d))
      f.photo.source_folder_path = matchedDir || (normPath.includes('/') ? normPath.substring(0, normPath.lastIndexOf('/')) : normPath)
    })

    // Insert into database
    event.sender.send('import:status', {
      stage: 'saving',
      message: 'Saving photos to library database...',
      total: importedFiles.length,
      completed: importedFiles.length
    })

    const insertedItems = insertPhotoBatch(importedFiles)

    // Generate thumbnails for newly imported photos
    if (insertedItems.length > 0) {
      event.sender.send('import:status', {
        stage: 'thumbnails',
        message: 'Generating thumbnails...',
        total: insertedItems.length,
        completed: 0
      })

      let lastSent = 0
      await generateThumbnailBatch(
        insertedItems,
        (completed, total, id, thumbnailPath, previewPath) => {
          if (thumbnailPath || previewPath) {
            updatePhotoThumbnails(id, thumbnailPath || previewPath, previewPath || thumbnailPath)
          }
          const now = Date.now()
          if (now - lastSent > 30 || completed === total) {
            lastSent = now
            event.sender.send('import:status', {
              stage: 'thumbnails',
              message: `Generating thumbnails... ${completed}/${total}`,
              total,
              completed
            })
          }
        }
      )
    }

    event.sender.send('import:status', {
      stage: 'done',
      message: `Successfully imported ${insertedItems.length} photos`,
      total: insertedItems.length,
      completed: insertedItems.length
    })

    resumeVideoQueue()
    // Auto-fingerprint newly imported photos in background for instant duplicate detection
    scanPerceptualHashesBatch(undefined, false).catch(() => {})
    return { success: true, count: insertedItems.length }
  })

  ipcMain.handle('photos:import-files', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, count: 0 }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: 'Import Photos',
      filters: [
        { name: 'Images & Videos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'avif', 'heic', 'heif', 'dng', 'cr2', 'nef', 'arw', 'raw', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v', '3gp'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, count: 0 }
    }

    pauseVideoQueue()
    const filePaths = result.filePaths
    event.sender.send('import:status', {
      stage: 'processing',
      message: `Processing ${filePaths.length} photos...`,
      total: filePaths.length,
      completed: 0
    })

    const importedFiles = await processFiles(filePaths, (completed, total, currentFile) => {
      event.sender.send('import:status', {
        stage: 'processing',
        message: `Processing ${basename(currentFile)}...`,
        total,
        completed
      })
    })

    const insertedItems = insertPhotoBatch(importedFiles)

    // Generate thumbnails
    if (insertedItems.length > 0) {
      let lastSent = 0
      const pendingUpdates: { id: number; thumbnailPath: string; previewPath: string }[] = []

      await generateThumbnailBatch(
        insertedItems,
        (completed, total, id, thumbnailPath, previewPath) => {
          if (thumbnailPath || previewPath) {
            pendingUpdates.push({
              id,
              thumbnailPath: thumbnailPath || previewPath,
              previewPath: previewPath || thumbnailPath
            })
          }

          const now = Date.now()
          if (now - lastSent > 150 || completed === total) {
            lastSent = now
            if (pendingUpdates.length > 0) {
              updatePhotoThumbnailsBatch(pendingUpdates.splice(0, pendingUpdates.length))
            }
            event.sender.send('import:status', {
              stage: 'thumbnails',
              message: `Generating thumbnails... ${completed}/${total}`,
              total,
              completed
            })
          }
        }
      )

      if (pendingUpdates.length > 0) {
        updatePhotoThumbnailsBatch(pendingUpdates)
      }
    }

    event.sender.send('import:status', {
      stage: 'done',
      message: `Successfully imported ${insertedItems.length} photos`,
      total: insertedItems.length,
      completed: insertedItems.length
    })

    resumeVideoQueue()
    // Auto-fingerprint newly imported photos in background for instant duplicate detection
    scanPerceptualHashesBatch(undefined, false).catch(() => {})
    return { success: true, count: insertedItems.length }
  })

  // ─── Photos CRUD ─────────────────────────────────────────────────────
  ipcMain.handle('photos:get-all', (_event, filter: PhotoFilter) => {
    return getPhotos(filter)
  })

  ipcMain.handle('photos:get-geo', () => {
    return getGeoPhotos()
  })

  ipcMain.handle('photos:get-by-id', (_event, id: number) => {
    const photo = getPhotoById(id)
    const exif = photo ? getExifByPhotoId(id) : undefined
    return { photo, exif }
  })

  ipcMain.handle('photos:get-highres-preview', async (_event, filePath: string) => {
    return await getOrGenerateHighResPreview(filePath)
  })

  ipcMain.handle('photos:prefetch-highres', (_event, filePaths: string[]) => {
    prefetchHighResPreviews(filePaths)
    return true
  })

  ipcMain.handle('photos:get-count', (_event, filter: PhotoFilter) => {
    return getPhotoCount(filter)
  })

  ipcMain.handle('photos:toggle-favorite', (_event, id: number) => {
    return toggleFavorite(id)
  })

  ipcMain.handle('photos:batch-favorite', (_event, ids: number[], favorite: boolean) => {
    batchFavorite(ids, favorite)
    return true
  })

  ipcMain.handle('photos:archive', (_event, ids: number[]) => {
    setArchived(ids, true)
    return true
  })

  ipcMain.handle('photos:scan-documents', () => {
    const { scanDocuments } = require('./document-scanner')
    scanDocuments()
    return true
  })

  ipcMain.handle('photos:stop-document-scan', () => {
    const { stopDocumentScanning } = require('./document-scanner')
    stopDocumentScanning()
    return true
  })

  // ─── Location Scanner ────────────────────────────────────────────────
  ipcMain.handle('photos:start-location-scan', () => {
    scanLocations()
    return true
  })

  ipcMain.handle('photos:stop-location-scan', () => {
    stopLocationScanning()
    return true
  })

  ipcMain.handle('photos:unarchive', (_event, ids: number[]) => {
    setArchived(ids, false)
    return true
  })

  ipcMain.handle('photos:lock', (_event, ids: number[], locked: boolean) => {
    const { setLocked } = require('./database')
    setLocked(ids, locked)
    return true
  })

  ipcMain.handle('photos:update-metadata', (_event, id: number, data: { description?: string; created_at?: string }) => {
    const { updatePhotoMetadata } = require('./database')
    updatePhotoMetadata(id, data)
    return true
  })

  ipcMain.handle('photos:trash', (_event, ids: number[]) => {
    setTrashed(ids, true)
    return true
  })

  ipcMain.handle('photos:restore', (_event, ids: number[]) => {
    setTrashed(ids, false)
    return true
  })

  ipcMain.handle('photos:delete-permanently', (_event, ids: number[]) => {
    deletePermanently(ids)
    return true
  })

  ipcMain.handle('photos:empty-trash', () => {
    const db = require('./database').getDb()
    const trashed = db.prepare("SELECT id FROM photos WHERE is_trashed = 1").all() as { id: number }[]
    if (trashed.length > 0) {
      deletePermanently(trashed.map((r: any) => r.id))
    }
    return true
  })

  ipcMain.handle('photos:get-timeline', () => {
    return getTimeline()
  })

  ipcMain.handle('photos:get-stats', () => {
    return getStats()
  })

  ipcMain.handle('photos:search', (_event, query: string) => {
    return getPhotos({ search: query })
  })

  ipcMain.handle('photos:open-in-explorer', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('photos:get-utilities-data', (event) => {
    return getUtilitiesData((scanned, total, currentFile) => {
      event.sender.send('duplicate-scan:progress', { scanned, total, currentFile })
    })
  })

  ipcMain.handle('photos:scan-duplicates', async (event) => {
    const { scanPerceptualHashesBatch } = await import('./database')
    await scanPerceptualHashesBatch((scanned, total, currentFile) => {
      event.sender.send('duplicate-scan:progress', { scanned, total, currentFile })
    }, true)
    return getUtilitiesData((scanned, total, currentFile) => {
      event.sender.send('duplicate-scan:progress', { scanned, total, currentFile })
    })
  })

  ipcMain.handle('photos:get-unanalyzed', () => {
    return getUnanalyzedPhotos()
  })

  ipcMain.handle('photos:save-analysis', (_event, photoId: number, blurScore: number, perceptualHash: string) => {
    savePhotoAnalysis(photoId, blurScore, perceptualHash)
    return true
  })

  ipcMain.handle('photos:get-unscanned-docs', () => {
    return getUnscannedDocuments()
  })

  ipcMain.handle('photos:save-document-scan', (_event, photoId: number, text: string, isDocument: boolean, category: string | null) => {
    saveDocumentScan(photoId, text, isDocument, category)
    return true
  })

  // ─── Fast Document Scanner (Two-Phase) ──────────────────────────────
  ipcMain.handle('docs:fast-prefilter', async () => {
    return await startFastDocScan()
  })

  ipcMain.handle('docs:stop-fast-scan', () => {
    stopFastDocScan()
    return true
  })

  ipcMain.handle('docs:get-ocr-buffer', async (_event, photoId: number) => {
    const photos = getUnscannedDocuments()
    const photo = photos.find(p => p.id === photoId)
    if (!photo) {
      // Photo might already be scanned, try getting it by ID
      const allPhotos = getPhotos({})
      const p = allPhotos.find(x => x.id === photoId)
      if (!p) return null
      const buf = await getOcrBuffer(p)
      return buf ? buf.toString('base64') : null
    }
    const buf = await getOcrBuffer(photo)
    return buf ? buf.toString('base64') : null
  })

  ipcMain.handle('docs:save-batch', (_event, results: Array<{ id: number, text: string, isDocument: boolean, category: string | null }>) => {
    for (const r of results) {
      saveDocumentScan(r.id, r.text, r.isDocument, r.category)
    }
    return true
  })

  // ─── Photo Editing ───────────────────────────────────────────────────
  ipcMain.handle('photos:edit', async (_event, id: number, edits: Record<string, unknown>) => {
    const photo = getPhotoById(id)
    if (!photo) return { success: false }

    const ext = extname(photo.file_path)
    const editedDir = join(app.getPath('userData'), 'edited')
    if (!existsSync(editedDir)) {
      const { mkdirSync } = require('fs')
      mkdirSync(editedDir, { recursive: true })
    }

    const outputPath = join(editedDir, `${id}_edited${ext}`)
    try {
      await applyEdits(photo.file_path, outputPath, edits as Parameters<typeof applyEdits>[2])

      // Re-generate thumbnails for the edited photo
      const thumbResult = await generateThumbnail(outputPath)
      updatePhotoThumbnails(id, thumbResult.thumbnailPath, thumbResult.previewPath)

      return { success: true, path: outputPath }
    } catch (err) {
      console.error('Edit failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // ─── Albums ──────────────────────────────────────────────────────────
  ipcMain.handle('albums:create', (_event, name: string) => {
    const id = createAlbum(name)
    return getAlbumById(id)
  })

  ipcMain.handle('albums:get-all', () => {
    return getAlbums()
  })

  ipcMain.handle('albums:get-by-id', (_event, id: number) => {
    return getAlbumById(id)
  })

  ipcMain.handle('albums:update', (_event, id: number, name: string) => {
    updateAlbum(id, name)
    return getAlbumById(id)
  })

  ipcMain.handle('albums:delete', (_event, id: number) => {
    deleteAlbum(id)
    return true
  })

  ipcMain.handle('albums:add-photos', (_event, albumId: number, photoIds: number[]) => {
    addPhotosToAlbum(albumId, photoIds)
    return getAlbumById(albumId)
  })

  ipcMain.handle('albums:remove-photos', (_event, albumId: number, photoIds: number[]) => {
    removePhotosFromAlbum(albumId, photoIds)
    return getAlbumById(albumId)
  })

  // ─── People & Face Grouping ──────────────────────────────────────────
  ipcMain.handle('people:get-all', () => {
    return getPeople()
  })

  ipcMain.handle('people:create', (_event, name: string, coverPhotoId?: number, faceBase64?: string) => {
    const id = createPerson(name, coverPhotoId, faceBase64)
    return id
  })

  ipcMain.handle('people:update-name', (_event, personId: number, name: string) => {
    updatePersonName(personId, name)
    return true
  })

  ipcMain.handle('people:delete', (_event, personId: number) => {
    deletePerson(personId)
    return true
  })

  ipcMain.handle('people:add-photo', (_event, personId: number, photoId: number) => {
    addPhotoToPerson(personId, photoId)
    return true
  })

  ipcMain.handle('people:merge', (_event, primaryId: number, secondaryId: number) => {
    mergePeople(primaryId, secondaryId)
    return true
  })

  ipcMain.handle('people:get-photos', (_event, personId: number) => {
    return getPhotosByPerson(personId)
  })

  ipcMain.handle('people:toggle-favorite', (_event, personId: number) => {
    return togglePersonFavorite(personId)
  })

  ipcMain.handle('people:set-cover-photo', (_event, personId: number, photoId: number, faceBase64?: string) => {
    setPersonCoverPhoto(personId, photoId, faceBase64)
    return true
  })

  ipcMain.handle('people:remove-photo', (_event, personId: number, photoId: number) => {
    removePhotoFromPerson(personId, photoId)
    return true
  })

  // ─── Face Recognition ──────────────────────────────────────────────────
  ipcMain.handle('faces:get-all', () => {
    return getAllFaceDescriptors()
  })

  ipcMain.handle('faces:save', (_event, photoId: number, personId: number, descriptor: number[]) => {
    saveFaceDescriptor(photoId, personId, descriptor)
    return true
  })

  ipcMain.handle('faces:get-unscanned', () => {
    return getUnscannedPhotos()
  })

  ipcMain.handle('faces:mark-scanned', (_event, photoId: number) => {
    markPhotoScanned(photoId)
    return true
  })

  ipcMain.handle('faces:reset', (_event) => {
    resetFaceScanData()
    return true
  })

  ipcMain.handle('locations:reset', (_event) => {
    resetLocationScanData()
    return true
  })

  ipcMain.handle('locations:update-name', (_event, photoIds: number[], newLocationName: string) => {
    updateLocationNameForPhotos(photoIds, newLocationName)
    return true
  })

  ipcMain.handle('docs:reset', (_event) => {
    resetDocumentScanData()
    return true
  })

  ipcMain.handle('analysis:reset', (_event) => {
    resetUtilityScanData()
    return true
  })

  ipcMain.handle('faces:get-merge-suggestions', (_event) => {
    return getMergeSuggestions()
  })

  // ─── Folders & Disk Sync ─────────────────────────────────────────────
  ipcMain.handle('folders:get-all', () => {
    return getImportedFolders()
  })

  ipcMain.handle('folders:sync', async (event, folderPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return syncFolder(folderPath, (status) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('sync:status', { folderPath, ...status })
      }
    })
  })

  ipcMain.handle('folders:sync-all', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return syncAllTrackedFolders(win || undefined)
  })

  ipcMain.handle('folders:remove', (_event, folderId: number) => {
    removeImportedFolder(folderId)
    return true
  })

  // ─── Screenshot Classifier ────────────────────────────────────────────
  ipcMain.handle('screenshots:classify', (_event, filePath: string) => {
    return classifyScreenshot(filePath)
  })

  ipcMain.handle('screenshots:classify-batch', (_event, filePaths: string[]) => {
    return classifyScreenshotBatch(filePaths)
  })

  // ─── Junk / Forwarded Media Classifier ────────────────────────────────
  ipcMain.handle('junk:classify', (_event, filePath: string) => {
    return classifyJunkMedia(filePath)
  })

  ipcMain.handle('junk:classify-batch', (_event, filePaths: string[]) => {
    return classifyJunkMediaBatch(filePaths)
  })

  // ─── Document Detector ────────────────────────────────────────────────
  ipcMain.handle('documents:detect', (_event, filePath: string) => {
    return detectDocument(filePath)
  })

  ipcMain.handle('documents:detect-batch', async (event, filePaths: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const results: any[] = []
    for (let i = 0; i < filePaths.length; i++) {
      const res = await detectDocument(filePaths[i])
      results.push({ filePath: filePaths[i], ...res })
      if (win && !win.isDestroyed()) {
        win.webContents.send('doc-detect:progress', {
          completed: i + 1,
          total: filePaths.length,
          currentFile: filePaths[i]
        })
      }
    }
    return results
  })

  // ─── Large Files Relocation & Undo ────────────────────────────────────
  ipcMain.handle('large-files:select-destination', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return selectDestinationDirectory(win || undefined)
  })

  ipcMain.handle('large-files:move', async (event, options: LargeFileMoveOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return moveLargeFiles(options, (progress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('large-files:progress', progress)
      }
    })
  })

  ipcMain.handle('large-files:undo', async (event, manifestId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return undoLargeFileMove(manifestId, (progress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('large-files:undo-progress', progress)
      }
    })
  })

  ipcMain.handle('large-files:get-manifests', () => {
    return getLargeFileManifests()
  })

  // ─── Tags ─────────────────────────────────────────────────────────────
  ipcMain.handle('tags:get-all', () => {
    return getAllTags()
  })

  ipcMain.handle('tags:create', (_event, name: string, color?: string) => {
    return createTag(name, color)
  })

  ipcMain.handle('tags:delete', (_event, tagId: number) => {
    deleteTag(tagId)
    return true
  })

  ipcMain.handle('tags:rename', (_event, tagId: number, newName: string, newColor?: string) => {
    renameTag(tagId, newName, newColor)
    return true
  })

  ipcMain.handle('tags:add-to-photos', (_event, photoIds: number[], tagIds: number[]) => {
    addTagsToPhotos(photoIds, tagIds)
    return true
  })

  ipcMain.handle('tags:sync-photos', (_event, photoIds: number[], tagIds: number[]) => {
    syncPhotoTags(photoIds, tagIds)
    return true
  })

  ipcMain.handle('tags:remove-from-photos', (_event, photoIds: number[], tagId: number) => {
    removeTagFromPhotos(photoIds, tagId)
    return true
  })

  ipcMain.handle('tags:get-for-photo', (_event, photoId: number) => {
    return getTagsForPhoto(photoId)
  })

  ipcMain.handle('tags:get-photos-by-tag', (_event, tagId: number) => {
    return getPhotosByTag(tagId)
  })

  ipcMain.handle('tags:get-all-tagged-photos', () => {
    return getAllTaggedPhotos()
  })

  // ─── System ──────────────────────────────────────────────────────────
  ipcMain.handle('system:get-platform', () => {
    return process.platform
  })

  ipcMain.handle('system:log-error', (_event, type: string, message: string) => {
    logErrorToFile(type, message)
    return true
  })

  // ─── Library Organizer & Folder Exporter ──────────────────────────────
  ipcMain.handle('organizer:select-destination', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || undefined
    return selectOrganizationDestination(win)
  })

  ipcMain.handle('organizer:preview-plan', (_event, options: OrganizationOptions) => {
    return generateOrganizationPreviewPlan(options)
  })

  ipcMain.handle('organizer:execute', async (event, options: OrganizationOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return executeOrganization(options, (progress) => {
      win?.webContents.send('organizer:progress', progress)
    })
  })

  ipcMain.handle('organizer:cancel', () => {
    cancelOrganization()
    return true
  })

  ipcMain.handle('organizer:show-in-folder', (_event, folderPath: string) => {
    if (folderPath && existsSync(folderPath)) {
      shell.openPath(folderPath)
      return true
    }
    return false
  })

  // ─── Window Controls ─────────────────────────────────────────────────
  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
    return true
  })

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return win.isMaximized()
  })

  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
    return true
  })

  ipcMain.handle('window:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isMaximized() ?? false
  })
}
