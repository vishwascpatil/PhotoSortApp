import { existsSync } from 'fs'
import { scanDirectory, processFile } from './importer'
import {
  getPhotos,
  insertPhotoBatch,
  deletePermanently,
  getImportedFolders,
  updateFolderSyncTime,
  updatePhotoThumbnails,
  addImportedFolder,
  removeImportedFolder
} from './database'
import { generateThumbnailBatch, pauseVideoQueue, resumeVideoQueue } from './thumbnails'
import { BrowserWindow } from 'electron'

export interface SyncResult {
  folderPath: string
  addedCount: number
  removedCount: number
}

export async function syncFolder(
  folderPath: string,
  onProgress?: (status: { stage: string; message: string; completed: number; total: number }) => void
): Promise<SyncResult> {
  const normalizedFolder = folderPath.replace(/\\/g, '/')

  if (!existsSync(folderPath)) {
    console.warn(`Folder no longer exists on disk: ${folderPath}. Removing from library...`)
    const folderRow = getImportedFolders().find(f => f.folder_path === normalizedFolder)
    if (folderRow) {
      removeImportedFolder(folderRow.id)
    }
    return { folderPath: normalizedFolder, addedCount: 0, removedCount: 0 }
  }

  // Ensure folder is tracked in imported_folders table
  addImportedFolder(normalizedFolder)

  onProgress?.({ stage: 'scanning', message: `Scanning ${normalizedFolder}...`, completed: 0, total: 0 })

  // 1. Scan physical disk files
  const diskFiles = await scanDirectory(folderPath)
  const diskFileMap = new Map<string, string>() // normalized path -> original path
  for (const file of diskFiles) {
    diskFileMap.set(file.replace(/\\/g, '/'), file)
  }

  // 2. Query DB photos belonging to this folder
  const dbPhotos = getPhotos({ limit: 100000 }).filter(p => {
    const pPath = p.file_path.replace(/\\/g, '/')
    return p.source_folder_path === normalizedFolder || pPath.startsWith(normalizedFolder + '/')
  })
  const dbFileSet = new Set<string>()
  for (const photo of dbPhotos) {
    dbFileSet.add(photo.file_path.replace(/\\/g, '/'))
  }

  // 3. Find deleted files (in DB but not on disk)
  let removedCount = 0
  for (const photo of dbPhotos) {
    const normalizedDbPath = photo.file_path.replace(/\\/g, '/')
    if (!diskFileMap.has(normalizedDbPath) && !existsSync(photo.file_path)) {
      try {
        deletePermanently([photo.id])
        removedCount++
      } catch (err) {
        console.error(`Failed to remove stale record for ${photo.file_path}:`, err)
      }
    }
  }

  // 4. Find new files (on disk but not in DB)
  const newFiles: string[] = []
  for (const [normPath, origPath] of diskFileMap.entries()) {
    if (!dbFileSet.has(normPath)) {
      newFiles.push(origPath)
    }
  }

  let addedCount = 0
  if (newFiles.length > 0) {
    onProgress?.({ stage: 'processing', message: `Importing ${newFiles.length} new files...`, completed: 0, total: newFiles.length })

    const processedItems = []
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i]
      try {
        const item = await processFile(file)
        item.photo.source_folder_path = normalizedFolder
        processedItems.push(item)
      } catch (err) {
        console.error(`Failed to process ${file}:`, err)
      }
      onProgress?.({ stage: 'processing', message: `Processing files... ${i + 1}/${newFiles.length}`, completed: i + 1, total: newFiles.length })
    }

    if (processedItems.length > 0) {
      const inserted = insertPhotoBatch(processedItems)
      addedCount = inserted.length

      if (inserted.length > 0) {
        onProgress?.({ stage: 'thumbnails', message: `Generating thumbnails...`, completed: 0, total: inserted.length })
        let lastSent = 0
        await generateThumbnailBatch(
          inserted,
          (completed, total, id, thumbPath, prevPath) => {
            if (thumbPath || prevPath) {
              updatePhotoThumbnails(id, thumbPath || prevPath, prevPath || thumbPath)
            }
            const now = Date.now()
            if (now - lastSent > 30 || completed === total) {
              lastSent = now
              onProgress?.({ stage: 'thumbnails', message: `Generating thumbnails... ${completed}/${total}`, completed, total })
            }
          }
        )
      }
    }
  }

  updateFolderSyncTime(normalizedFolder)
  onProgress?.({ stage: 'done', message: `Sync complete! +${addedCount} added, -${removedCount} removed`, completed: 100, total: 100 })

  return { folderPath: normalizedFolder, addedCount, removedCount }
}

export async function syncAllTrackedFolders(window?: BrowserWindow): Promise<SyncResult[]> {
  const folders = getImportedFolders()
  const results: SyncResult[] = []

  if (folders.length > 0) {
    pauseVideoQueue()
  }

  for (const folder of folders) {
    try {
      const res = await syncFolder(folder.folder_path, (status) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('sync:status', { folderPath: folder.folder_path, ...status })
        }
      })
      results.push(res)
    } catch (err) {
      console.error(`Sync error for ${folder.folder_path}:`, err)
    }
  }

  if (folders.length > 0) {
    resumeVideoQueue()
  }

  if (window && !window.isDestroyed()) {
    window.webContents.send('sync:all-completed', results)
  }

  return results
}
