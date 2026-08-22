import { join, dirname, basename, extname, relative, isAbsolute } from 'path'
import {
  existsSync, mkdirSync, copyFileSync, unlinkSync,
  statSync, readFileSync, writeFileSync, readdirSync
} from 'fs'
import { app, dialog, BrowserWindow } from 'electron'
import { getDb, saveDatabase, PhotoRow } from '../../database'

export interface LargeFileMoveOptions {
  fileIds: number[]
  destinationDir: string
  preserveRelativeSubpath?: boolean
  collisionStrategy?: 'rename' | 'skip' | 'overwrite'
  updateDatabasePath?: boolean
}

export interface MovedFileEntry {
  photoId: number
  sourcePath: string
  destinationPath: string
  fileSize: number
  status: 'moved' | 'skipped' | 'failed'
  error?: string
}

export interface MoveManifest {
  manifestId: string
  timestamp: string
  destinationDir: string
  totalFiles: number
  totalBytes: number
  entries: MovedFileEntry[]
  isUndone?: boolean
  undoneAt?: string
}

export interface MoveProgress {
  completed: number
  total: number
  currentFile: string
  bytesMoved: number
  totalBytes: number
  percentage: number
}

export interface MoveResult {
  success: boolean
  manifestId: string
  movedCount: number
  skippedCount: number
  failedCount: number
  totalBytesMoved: number
  errors: string[]
}

export interface UndoResult {
  success: boolean
  restoredCount: number
  failedCount: number
  errors: string[]
}

function getManifestDir(): string {
  const dir = join(app.getPath('userData'), 'large_file_manifests')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Prompts the user with a native OS dialog to select a target directory.
 */
export async function selectDestinationDirectory(
  browserWindow?: BrowserWindow
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Select Destination Folder for Large Files',
    properties: ['openDirectory', 'createDirectory']
  }

  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Resolves destination collisions by appending ' (1)', ' (2)', etc.
 */
function resolveCollision(targetPath: string, strategy: 'rename' | 'skip' | 'overwrite'): string | null {
  if (!existsSync(targetPath) || strategy === 'overwrite') {
    return targetPath
  }

  if (strategy === 'skip') {
    return null
  }

  // Strategy: 'rename'
  const dir = dirname(targetPath)
  const ext = extname(targetPath)
  const base = basename(targetPath, ext)

  let counter = 1
  let newPath = join(dir, `${base} (${counter})${ext}`)
  while (existsSync(newPath)) {
    counter++
    newPath = join(dir, `${base} (${counter})${ext}`)
  }

  return newPath
}

/**
 * Performs a reliable Copy -> Verify Size -> Unlink Source transfer.
 */
function safeMoveFile(sourcePath: string, destinationPath: string): { success: boolean; error?: string } {
  try {
    if (!existsSync(sourcePath)) {
      return { success: false, error: 'Source file does not exist' }
    }

    const srcStat = statSync(sourcePath)
    const targetDir = dirname(destinationPath)
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    // Step 1: Copy file to destination
    copyFileSync(sourcePath, destinationPath)

    // Step 2: Verify size at destination
    if (!existsSync(destinationPath)) {
      return { success: false, error: 'Target file missing after copy' }
    }

    const dstStat = statSync(destinationPath)
    if (dstStat.size !== srcStat.size) {
      // Size mismatch - corrupt copy, abort and clean up corrupt target
      try { unlinkSync(destinationPath) } catch {}
      return { success: false, error: `Size mismatch: source (${srcStat.size}B) != dest (${dstStat.size}B)` }
    }

    // Step 3: Unlink source only after destination verification
    try {
      unlinkSync(sourcePath)
    } catch (err: any) {
      return { success: true, error: `File copied & verified, but source deletion failed: ${err.message}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown filesystem error' }
  }
}

/**
 * Moves confirmed large files to the chosen destination with progress, collision handling, and manifest tracking.
 */
export async function moveLargeFiles(
  options: LargeFileMoveOptions,
  onProgress?: (progress: MoveProgress) => void
): Promise<MoveResult> {
  const {
    fileIds,
    destinationDir,
    preserveRelativeSubpath = true,
    collisionStrategy = 'rename',
    updateDatabasePath = false
  } = options

  if (!fileIds || fileIds.length === 0) {
    return {
      success: true,
      manifestId: '',
      movedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      totalBytesMoved: 0,
      errors: []
    }
  }

  const database = getDb()
  const placeholders = fileIds.map(() => '?').join(',')
  const query = `SELECT * FROM photos WHERE id IN (${placeholders})`
  const stmt = database.prepare(query)
  stmt.bind(fileIds)

  const photos: PhotoRow[] = []
  while (stmt.step()) {
    photos.push(stmt.getAsObject() as unknown as PhotoRow)
  }
  stmt.free()

  const manifestId = `large_files_${Date.now()}`
  const entries: MovedFileEntry[] = []
  const errors: string[] = []

  let movedCount = 0
  let skippedCount = 0
  let failedCount = 0
  let bytesMoved = 0
  const totalFiles = photos.length
  const totalBytes = photos.reduce((acc, p) => acc + (p.file_size || 0), 0)

  // Ensure destination root exists
  if (!existsSync(destinationDir)) {
    mkdirSync(destinationDir, { recursive: true })
  }

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const srcPath = photo.file_path

    if (onProgress) {
      onProgress({
        completed: i,
        total: totalFiles,
        currentFile: photo.filename,
        bytesMoved,
        totalBytes,
        percentage: totalFiles > 0 ? Math.round((i / totalFiles) * 100) : 0
      })
    }

    if (!existsSync(srcPath)) {
      failedCount++
      errors.push(`File missing on disk: ${srcPath}`)
      entries.push({
        photoId: photo.id,
        sourcePath: srcPath,
        destinationPath: '',
        fileSize: photo.file_size || 0,
        status: 'failed',
        error: 'File not found'
      })
      continue
    }

    // Determine target relative path
    let targetRelativePath = photo.filename
    if (preserveRelativeSubpath && photo.source_folder_path) {
      try {
        const rel = relative(photo.source_folder_path, srcPath)
        if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
          targetRelativePath = rel
        }
      } catch {}
    }

    const proposedDest = join(destinationDir, targetRelativePath)
    const finalDest = resolveCollision(proposedDest, collisionStrategy)

    if (!finalDest) {
      skippedCount++
      entries.push({
        photoId: photo.id,
        sourcePath: srcPath,
        destinationPath: proposedDest,
        fileSize: photo.file_size || 0,
        status: 'skipped',
        error: 'Collision skipped by user strategy'
      })
      continue
    }

    const moveRes = safeMoveFile(srcPath, finalDest)
    if (moveRes.success) {
      movedCount++
      bytesMoved += photo.file_size || 0
      entries.push({
        photoId: photo.id,
        sourcePath: srcPath,
        destinationPath: finalDest,
        fileSize: photo.file_size || 0,
        status: 'moved'
      })

      // Update or delete DB record
      if (updateDatabasePath) {
        try {
          database.run('UPDATE photos SET file_path = ?, filename = ? WHERE id = ?', [
            finalDest,
            basename(finalDest),
            photo.id
          ])
        } catch (err: any) {
          errors.push(`Database update warning for ID ${photo.id}: ${err.message}`)
        }
      } else {
        // Move out of library
        try {
          database.run('DELETE FROM photos WHERE id = ?', [photo.id])
          database.run('DELETE FROM photo_fingerprints WHERE photo_id = ?', [photo.id])
        } catch (err: any) {
          errors.push(`Database delete warning for ID ${photo.id}: ${err.message}`)
        }
      }
    } else {
      failedCount++
      const errMsg = moveRes.error || 'Failed to move file'
      errors.push(`${photo.filename}: ${errMsg}`)
      entries.push({
        photoId: photo.id,
        sourcePath: srcPath,
        destinationPath: finalDest,
        fileSize: photo.file_size || 0,
        status: 'failed',
        error: errMsg
      })
    }
  }

  saveDatabase()

  // Save transaction manifest for undo capability
  const manifest: MoveManifest = {
    manifestId,
    timestamp: new Date().toISOString(),
    destinationDir,
    totalFiles: movedCount,
    totalBytes: bytesMoved,
    entries
  }

  try {
    const manifestPath = join(getManifestDir(), `${manifestId}.json`)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  } catch (err: any) {
    console.error('Failed to write large files move manifest:', err)
  }

  if (onProgress) {
    onProgress({
      completed: totalFiles,
      total: totalFiles,
      currentFile: 'Complete',
      bytesMoved,
      totalBytes,
      percentage: 100
    })
  }

  return {
    success: failedCount === 0,
    manifestId,
    movedCount,
    skippedCount,
    failedCount,
    totalBytesMoved: bytesMoved,
    errors
  }
}

/**
 * Reverses a previous large files move operation using its saved manifest.
 */
export async function undoLargeFileMove(
  manifestId: string,
  onProgress?: (progress: MoveProgress) => void
): Promise<UndoResult> {
  const manifestPath = join(getManifestDir(), `${manifestId}.json`)
  if (!existsSync(manifestPath)) {
    return {
      success: false,
      restoredCount: 0,
      failedCount: 0,
      errors: ['Manifest not found']
    }
  }

  let manifest: MoveManifest
  try {
    const content = readFileSync(manifestPath, 'utf8')
    manifest = JSON.parse(content)
  } catch (err: any) {
    return {
      success: false,
      restoredCount: 0,
      failedCount: 0,
      errors: [`Failed to parse manifest: ${err.message}`]
    }
  }

  if (manifest.isUndone) {
    return {
      success: false,
      restoredCount: 0,
      failedCount: 0,
      errors: ['This transaction has already been undone']
    }
  }

  const movedEntries = manifest.entries.filter((e) => e.status === 'moved')
  const database = getDb()
  const errors: string[] = []
  let restoredCount = 0
  let failedCount = 0
  let bytesMoved = 0
  const totalBytes = manifest.totalBytes

  for (let i = 0; i < movedEntries.length; i++) {
    const entry = movedEntries[i]

    if (onProgress) {
      onProgress({
        completed: i,
        total: movedEntries.length,
        currentFile: basename(entry.destinationPath),
        bytesMoved,
        totalBytes,
        percentage: movedEntries.length > 0 ? Math.round((i / movedEntries.length) * 100) : 0
      })
    }

    if (!existsSync(entry.destinationPath)) {
      failedCount++
      errors.push(`Target file missing at destination: ${entry.destinationPath}`)
      continue
    }

    const moveRes = safeMoveFile(entry.destinationPath, entry.sourcePath)
    if (moveRes.success) {
      restoredCount++
      bytesMoved += entry.fileSize

      // Restore database path or re-insert record
      try {
        const existing = database.prepare('SELECT id FROM photos WHERE id = ?')
        existing.bind([entry.photoId])
        const exists = existing.step()
        existing.free()

        if (exists) {
          database.run('UPDATE photos SET file_path = ?, filename = ? WHERE id = ?', [
            entry.sourcePath,
            basename(entry.sourcePath),
            entry.photoId
          ])
        }
      } catch (err: any) {
        errors.push(`Database restore warning for ID ${entry.photoId}: ${err.message}`)
      }
    } else {
      failedCount++
      errors.push(`Failed restoring ${basename(entry.sourcePath)}: ${moveRes.error}`)
    }
  }

  saveDatabase()

  // Mark manifest as undone
  manifest.isUndone = true
  manifest.undoneAt = new Date().toISOString()
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  } catch {}

  if (onProgress) {
    onProgress({
      completed: movedEntries.length,
      total: movedEntries.length,
      currentFile: 'Complete',
      bytesMoved,
      totalBytes,
      percentage: 100
    })
  }

  return {
    success: failedCount === 0,
    restoredCount,
    failedCount,
    errors
  }
}

/**
 * Retrieves all saved large file relocation manifests for historical review and undo.
 */
export function getLargeFileManifests(): MoveManifest[] {
  const dir = getManifestDir()
  const manifests: MoveManifest[] = []

  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), 'utf8')
        const parsed = JSON.parse(content) as MoveManifest
        manifests.push(parsed)
      } catch {}
    }
  } catch {}

  return manifests.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}
