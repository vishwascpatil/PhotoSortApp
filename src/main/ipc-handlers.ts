import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { basename, join, extname } from 'path'
import { existsSync, copyFileSync, mkdirSync } from 'fs'
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
  setLocked, updatePhotoMetadata, getDb, saveDatabase,
  PhotoFilter
} from './database'
import { scanDirectory, processFiles } from './importer'
import { generateThumbnailBatch, generateThumbnail, applyEdits, pauseVideoQueue, resumeVideoQueue, recoverMissingThumbnails } from './thumbnails'
import { syncFolder, syncAllTrackedFolders } from './syncer'
import { scanLocations, stopLocationScanning } from './location-scanner'
import { startFullDocumentScan, stopFullDocumentScan, startFastDocScan, stopFastDocScan, getOcrBuffer } from './fast-doc-scanner'
import { getOrGenerateHighResPreview, prefetchHighResPreviews } from './highres'
import { classifyScreenshot, classifyScreenshotBatch } from './services/screenshot/screenshotDetector'
import { classifyJunkMedia, classifyJunkMediaBatch } from './services/junk/junkDetector'
import { detectDocument, classifyExtractedText } from './services/document/documentDetector'
import { ALL_SUPPORTED_EXTENSIONS, ALL_IMAGE_EXTENSIONS, ALL_VIDEO_EXTENSIONS } from './mediaRegistry'
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
  validateOrganizationPlan,
  auditDestinationFolder,
  OrganizationOptions
} from './services/organizer/libraryOrganizer'
import { logErrorToFile } from './logger'

export function registerIpcHandlers(): void {
  // ─── Import & Cancellation ──────────────────────────────────────────
  let isImportCancelled = false

  ipcMain.handle('photos:cancel-import', () => {
    isImportCancelled = true
    return true
  })

  ipcMain.handle('photos:recover-thumbnails', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    isImportCancelled = false
    return await recoverMissingThumbnails((completed, total) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('import:status', {
          stage: 'thumbnails',
          message: `Recovering missing thumbnails... ${completed}/${total}`,
          total,
          completed
        })
      }
    }, () => isImportCancelled)
  })

  ipcMain.handle('photos:import-folder', async (event, explicitDir?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, count: 0 }
    isImportCancelled = false

    let result: { canceled: boolean; filePaths: string[] }
    if (explicitDir && typeof explicitDir === 'string') {
      result = { canceled: false, filePaths: [explicitDir] }
    } else if (process.env.PHOTOSORT_IMPORT_PATH) {
      result = { canceled: false, filePaths: [process.env.PHOTOSORT_IMPORT_PATH] }
    } else if (process.env.PHOTOSORT_TEST_MODE === '1') {
      result = { canceled: true, filePaths: [] }
    } else {
      result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'multiSelections'],
        title: 'Import Photos from Folder'
      })
    }

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
      if (isImportCancelled) break
      const scanned = await scanDirectory(dirPath)
      filePaths.push(...scanned)
    }
    filePaths = Array.from(new Set(filePaths)) // Deduplicate

    if (filePaths.length === 0 || isImportCancelled) {
      resumeVideoQueue()
      event.sender.send('import:status', {
        stage: 'done',
        message: isImportCancelled ? 'Import cancelled' : 'No supported media files found',
        total: 0,
        completed: 0
      })
      return { success: !isImportCancelled, count: 0, message: isImportCancelled ? 'Import cancelled' : 'No supported images found' }
    }

    event.sender.send('import:status', {
      stage: 'processing',
      message: `Found ${filePaths.length} photos. Processing metadata...`,
      total: filePaths.length,
      completed: 0
    })

    // Process files (extract metadata) with throttled IPC updates and cancellation check
    let lastProcessSent = 0
    const importedFiles = await processFiles(
      filePaths,
      (completed, total, currentFile) => {
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
      },
      () => isImportCancelled
    )

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

    // Generate thumbnails for newly imported photos with cancellation support
    if (insertedItems.length > 0 && !isImportCancelled) {
      event.sender.send('import:status', {
        stage: 'thumbnails',
        message: 'Generating thumbnails...',
        total: insertedItems.length,
        completed: 0
      })

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
        },
        () => isImportCancelled
      )

      if (pendingUpdates.length > 0) {
        updatePhotoThumbnailsBatch(pendingUpdates.splice(0, pendingUpdates.length))
      }
    }

    event.sender.send('import:status', {
      stage: 'done',
      message: isImportCancelled ? `Import cancelled (imported ${insertedItems.length} photos)` : `Successfully imported ${insertedItems.length} photos`,
      total: insertedItems.length,
      completed: insertedItems.length
    })

    resumeVideoQueue()
    return { success: !isImportCancelled, count: insertedItems.length, cancelled: isImportCancelled }
  })

  ipcMain.handle('photos:import-files', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, count: 0 }
    isImportCancelled = false

    const result = process.env.PHOTOSORT_TEST_MODE === '1'
      ? { canceled: true, filePaths: [] }
      : await dialog.showOpenDialog(win, {
          properties: ['openFile', 'multiSelections'],
          title: 'Import Photos',
          filters: [
        {
          name: 'All Supported Media',
          extensions: Array.from(ALL_SUPPORTED_EXTENSIONS).map((e) => e.replace('.', ''))
        },
        {
          name: 'Photos & RAW Images',
          extensions: Array.from(ALL_IMAGE_EXTENSIONS).map((e) => e.replace('.', ''))
        },
        {
          name: 'Videos & Cinema RAW',
          extensions: Array.from(ALL_VIDEO_EXTENSIONS).map((e) => e.replace('.', ''))
        },
        { name: 'All Files', extensions: ['*'] }
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

    const importedFiles = await processFiles(
      filePaths,
      (completed, total, currentFile) => {
        event.sender.send('import:status', {
          stage: 'processing',
          message: `Processing ${basename(currentFile)}...`,
          total,
          completed
        })
      },
      () => isImportCancelled
    )

    const insertedItems = insertPhotoBatch(importedFiles)

    // Generate thumbnails
    if (insertedItems.length > 0 && !isImportCancelled) {
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
        },
        () => isImportCancelled
      )

      if (pendingUpdates.length > 0) {
        updatePhotoThumbnailsBatch(pendingUpdates)
      }
    }

    event.sender.send('import:status', {
      stage: 'done',
      message: isImportCancelled ? `Import cancelled (imported ${insertedItems.length} photos)` : `Successfully imported ${insertedItems.length} photos`,
      total: insertedItems.length,
      completed: insertedItems.length
    })

    resumeVideoQueue()
    return { success: !isImportCancelled, count: insertedItems.length, cancelled: isImportCancelled }
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
    startFullDocumentScan()
    return true
  })

  ipcMain.handle('photos:stop-document-scan', () => {
    stopFullDocumentScan()
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
    setLocked(ids, locked)
    return true
  })

  ipcMain.handle('photos:update-metadata', (_event, id: number, data: { description?: string; created_at?: string }) => {
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
    const db = getDb()
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

  ipcMain.handle('photos:get-utilities-data', async (event) => {
    try {
      return await getUtilitiesData((scanned, total, currentFile) => {
        event.sender.send('duplicate-scan:progress', { scanned, total, currentFile })
      })
    } catch (err: any) {
      console.warn('photos:get-utilities-data skipped (database not ready):', err?.message)
      return {
        whatsapp: [],
        blurry: [],
        duplicates: [],
        similar: [],
        duplicateGroups: []
      }
    }
  })

  ipcMain.handle('photos:scan-duplicates', async (event) => {
    return getUtilitiesData((scanned, total, currentFile) => {
      event.sender.send('duplicate-scan:progress', { scanned, total, currentFile })
    }, true)
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

  ipcMain.handle('faces:get-unscanned', (_event, limit?: number) => {
    return getUnscannedPhotos(limit)
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
  ipcMain.handle('documents:start-scan', async (_event, allLibrary?: boolean) => {
    return await startFullDocumentScan(allLibrary ?? true)
  })

  ipcMain.handle('documents:stop-scan', () => {
    stopFullDocumentScan()
    return true
  })

  ipcMain.handle('documents:detect', (_event, filePath: string) => {
    return detectDocument(filePath)
  })

  ipcMain.handle('documents:detect-batch', async (event, filePaths: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const results: any[] = []
    const allPhotos = getPhotos({})
    for (let i = 0; i < filePaths.length; i++) {
      const res = await detectDocument(filePaths[i])
      results.push({ filePath: filePaths[i], ...res })
      const photo = allPhotos.find(p => p.file_path === filePaths[i])
      if (photo) {
        saveDocumentScan(
          photo.id,
          res.extractedText || photo.extracted_text || '',
          res.classification !== 'not_a_document',
          res.category || null
        )
      }
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

  ipcMain.handle('documents:clean-false-positives', async () => {
    const allPhotos = getPhotos({})
    let cleared = 0
    let kept = 0
    for (const photo of allPhotos) {
      if (photo.extracted_text && photo.extracted_text.length > 5 && photo.extracted_text !== 'NONE' && photo.extracted_text !== 'ERROR') {
        const classRes = classifyExtractedText(photo.extracted_text)
        if (classRes.isDocument && classRes.category) {
          saveDocumentScan(photo.id, photo.extracted_text, true, classRes.category)
          kept++
        } else {
          if (photo.is_document === 1) cleared++
          saveDocumentScan(photo.id, photo.extracted_text, false, null)
        }
      } else if (photo.is_document === 1) {
        // Run full detection on files marked as documents without saved text
        const res = await detectDocument(photo.file_path)
        if (res.classification === 'not_a_document') {
          saveDocumentScan(photo.id, res.extractedText || photo.extracted_text || '', false, null)
          cleared++
        } else {
          saveDocumentScan(photo.id, res.extractedText || photo.extracted_text || '', true, res.category || null)
          kept++
        }
      }
    }
    return { cleared, kept }
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
      try {
        if (win && !win.isDestroyed() && !win.webContents?.isDestroyed()) {
          win.webContents.send('organizer:progress', progress)
        }
      } catch {}
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

  ipcMain.handle('organizer:validate-plan', (_event, options: OrganizationOptions) => {
    return validateOrganizationPlan(options)
  })

  ipcMain.handle('organizer:audit-destination', (_event, destinationDir: string) => {
    return auditDestinationFolder(destinationDir)
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

  // ─── Benchmark & Scale Handlers ──────────────────────────────────────
  ipcMain.handle('benchmark:get-memory', () => {
    const m = process.memoryUsage()
    return {
      rss: Math.round(m.rss / 1048576),
      heapUsed: Math.round(m.heapUsed / 1048576),
      heapTotal: Math.round(m.heapTotal / 1048576)
    }
  })

  ipcMain.handle('benchmark:simulate-missing-thumbnails', (_event, count: number = 50) => {
    const db = getDb()
    db.run(`UPDATE photos SET thumbnail_path = NULL, preview_path = NULL WHERE id IN (SELECT id FROM photos LIMIT ${count})`)
    saveDatabase()
    return true
  })

  ipcMain.handle('benchmark:check-db-integrity', () => {
    const db = getDb()
    const res = db.exec('PRAGMA quick_check')
    return res[0]?.values[0]?.[0] === 'ok'
  })

  ipcMain.handle('benchmark:scale-database', async (_event, targetCount: number) => {
    const db = getDb()
    const t0 = Date.now()

    const insertStmt = db.prepare(`
      INSERT INTO photos (file_path, filename, mime_type, width, height, file_size, created_at, is_favorite, is_archived, is_trashed, is_locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const currentCount = (db.exec('SELECT COUNT(*) FROM photos')[0]?.values[0]?.[0] as number) || 0
    const needed = Math.max(0, targetCount - currentCount)

    const BLOCK_SIZE = 25000
    for (let b = 0; b < needed; b += BLOCK_SIZE) {
      db.run('BEGIN TRANSACTION')
      const end = Math.min(b + BLOCK_SIZE, needed)
      for (let i = b; i < end; i++) {
        const id = currentCount + i + 1
        const date = new Date(Date.now() - (i % 1500) * 86400000).toISOString()
        insertStmt.run([
          `C:/Users/vishw/Pictures/synthetic_scale/photo_${id}.jpg`,
          `photo_${id}.jpg`,
          'image/jpeg',
          1920,
          1080,
          2450000,
          date,
          i % 50 === 0 ? 1 : 0,
          0,
          0,
          0
        ])
      }
      db.run('COMMIT')
      // Yield to Node event loop so IPC and renderer communication remain responsive
      await new Promise((r) => setTimeout(r, 10))
    }

    insertStmt.free()
    const insertSec = (Date.now() - t0) / 1000

    // Benchmark queries on targetCount rows
    const tTimeline = Date.now()
    db.exec('SELECT substr(created_at, 1, 10) as date, count(*) as count FROM photos WHERE is_trashed = 0 GROUP BY substr(created_at, 1, 10) ORDER BY date DESC')
    const timelineMs = Date.now() - tTimeline

    const tPage = Date.now()
    const offset = Math.floor(targetCount / 2)
    db.exec(`SELECT * FROM photos WHERE is_trashed = 0 ORDER BY created_at DESC LIMIT 100 OFFSET ${offset}`)
    const pageMs = Date.now() - tPage

    const tSearch = Date.now()
    db.exec("SELECT * FROM photos WHERE filename LIKE '%photo_49999%' LIMIT 20")
    const searchMs = Date.now() - tSearch

    const tCount = Date.now()
    const countRes = db.exec('SELECT COUNT(*) FROM photos WHERE is_trashed = 0')
    const countMs = Date.now() - tCount

    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc() } catch {}
    }

    const m = process.memoryUsage()
    return {
      totalPhotos: countRes[0]?.values[0]?.[0] as number,
      insertSec,
      timelineMs,
      pageMs,
      searchMs,
      countMs,
      rssMb: Math.round(m.rss / 1048576),
      heapUsedMb: Math.round(m.heapUsed / 1048576)
    }
  })

  ipcMain.handle('benchmark:cleanup-synthetic', () => {
    const db = getDb()
    db.run("DELETE FROM photos WHERE file_path LIKE '%synthetic_%'")
    return true
  })
}
