import { join, dirname, basename, extname, isAbsolute } from 'path'
import {
  existsSync, mkdirSync, copyFileSync, unlinkSync,
  statSync, writeFileSync
} from 'fs'
import { app, dialog, BrowserWindow } from 'electron'
import { getDb, saveDatabase, PhotoRow } from '../../database'

export interface OrganizationOptions {
  mode: 'copy' | 'move'
  destinationDir: string
  preset?: 'smart-hierarchy' | 'year-month' | 'category-first'
  separateTrips?: boolean
  smartTripInference?: boolean
  separateDocuments?: boolean
  separateScreenshots?: boolean
  separateVideos?: boolean
  fileIds?: number[]
  folderPathFilter?: string
  collisionStrategy?: 'rename' | 'skip' | 'overwrite'
}

export interface TripWindow {
  locationName: string
  year: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  photoCount: number
}

export interface PreviewSubfolder {
  name: string
  fileCount: number
  totalBytes: number
  sampleFilenames: string[]
}

export interface PreviewYearGroup {
  year: string
  fileCount: number
  totalBytes: number
  subfolders: PreviewSubfolder[]
}

export interface OrganizationPreviewPlan {
  totalFiles: number
  totalBytes: number
  yearGroups: PreviewYearGroup[]
  categoryBreakdown: {
    trips: number
    documents: number
    screenshots: number
    videos: number
    generalPhotos: number
  }
}

export interface OrganizationProgress {
  completed: number
  total: number
  currentFile: string
  bytesTransferred: number
  totalBytes: number
  percentage: number
  speedBytesPerSec?: number
}

export interface OrganizedFileEntry {
  photoId: number
  originalPath: string
  newPath: string
  relativeSubpath: string
  fileSize: number
  category: string
  status: 'copied' | 'moved' | 'skipped' | 'failed'
  error?: string
}

export interface OrganizationResult {
  success: boolean
  mode: 'copy' | 'move'
  destinationDir: string
  totalFiles: number
  processedCount: number
  skippedCount: number
  failedCount: number
  totalBytesTransferred: number
  manifestPath?: string
  reportPath?: string
  entries: OrganizedFileEntry[]
  errors: string[]
}

let isCancelled = false

export function cancelOrganization(): void {
  isCancelled = true
}

const MONTH_NAMES = [
  '01 - January', '02 - February', '03 - March', '04 - April',
  '05 - May', '06 - June', '07 - July', '08 - August',
  '09 - September', '10 - October', '11 - November', '12 - December'
]

function isPhotoScreenshot(photo: PhotoRow): boolean {
  const name = (photo.filename || '').toLowerCase()
  const path = (photo.file_path || '').toLowerCase()
  if (name.includes('screenshot') || name.includes('screen shot') || name.includes('screencap') || name.startsWith('ss_') || name.startsWith('scr_')) {
    return true
  }
  if (path.includes('screenshot') || path.includes('screen shot') || path.includes('screencaps')) {
    return true
  }
  return false
}

function isPhotoVideo(photo: PhotoRow): boolean {
  if (photo.mime_type && photo.mime_type.toLowerCase().startsWith('video')) {
    return true
  }
  const ext = extname(photo.filename || photo.file_path || '').toLowerCase()
  return ['.mp4', '.mov', '.mkv', '.avi', '.wmv', '.webm', '.m4v', '.3gp', '.flv'].includes(ext)
}

function isPhotoDocument(photo: PhotoRow): boolean {
  if (photo.is_document === 1) return true
  if (photo.document_category && photo.document_category !== 'not_a_document') return true
  const name = (photo.filename || '').toLowerCase()
  if (
    name.includes('aadhaar') || name.includes('aadhar') || name.includes('adhar') ||
    name.includes('pan_card') || name.includes('pancard') || name.includes('passport') ||
    name.includes('receipt') || name.includes('invoice') || name.includes('bill_') ||
    name.endsWith('.pdf') || name.endsWith('.txt')
  ) {
    return true
  }
  return false
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'General'
}

/**
 * Builds contiguous trip time windows from geotagged / location-identified photos.
 * E.g., if camera photos are in "Delhi" between 2024-05-12 and 2024-05-16,
 * it creates a known Trip Window for Delhi during that date interval.
 */
export function buildTripWindows(photos: PhotoRow[], maxGapDays = 2): TripWindow[] {
  const locMap = new Map<string, { date: string; photo: PhotoRow }[]>()

  for (const p of photos) {
    if (p.location_name && p.location_name.trim() && p.created_at) {
      const loc = p.location_name.trim()
      const datePart = p.created_at.split('T')[0].split(' ')[0]
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        if (!locMap.has(loc)) {
          locMap.set(loc, [])
        }
        locMap.get(loc)!.push({ date: datePart, photo: p })
      }
    }
  }

  const tripWindows: TripWindow[] = []

  for (const [locationName, items] of locMap.entries()) {
    const sorted = items.sort((a, b) => a.date.localeCompare(b.date))
    if (sorted.length === 0) continue

    let clusterStart = sorted[0].date
    let clusterEnd = sorted[0].date
    let count = 1

    for (let i = 1; i < sorted.length; i++) {
      const currentDate = sorted[i].date
      const prevDate = sorted[i - 1].date

      const dPrev = new Date(prevDate).getTime()
      const dCurr = new Date(currentDate).getTime()
      const diffDays = Math.round((dCurr - dPrev) / (1000 * 60 * 60 * 24))

      if (diffDays <= maxGapDays) {
        clusterEnd = currentDate
        count++
      } else {
        const year = clusterStart.split('-')[0]
        tripWindows.push({
          locationName,
          year,
          startDate: clusterStart,
          endDate: clusterEnd,
          photoCount: count
        })
        clusterStart = currentDate
        clusterEnd = currentDate
        count = 1
      }
    }

    const year = clusterStart.split('-')[0]
    tripWindows.push({
      locationName,
      year,
      startDate: clusterStart,
      endDate: clusterEnd,
      photoCount: count
    })
  }

  return tripWindows
}

/**
 * Finds a matching trip window for an untagged / WhatsApp photo based on its timestamp.
 */
export function findMatchingTripWindow(photoDate: string, tripWindows: TripWindow[]): TripWindow | null {
  if (!photoDate || !/^\d{4}-\d{2}-\d{2}$/.test(photoDate) || !tripWindows || tripWindows.length === 0) {
    return null
  }

  for (const trip of tripWindows) {
    if (photoDate >= trip.startDate && photoDate <= trip.endDate) {
      return trip
    }
  }
  return null
}

/**
 * Calculates the destination relative subpath for a photo based on selected options and trip windows.
 */
export function calculateRelativeSubpath(
  photo: PhotoRow,
  options: OrganizationOptions,
  tripWindows: TripWindow[] = []
): { relativePath: string; category: string; isInferredTrip?: boolean } {
  const preset = options.preset || 'smart-hierarchy'
  const separateTrips = options.separateTrips ?? true
  const smartTripInference = options.smartTripInference ?? true
  const separateDocs = options.separateDocuments ?? true
  const separateScreenshots = options.separateScreenshots ?? true
  const separateVideos = options.separateVideos ?? true

  // 1. Date extraction
  let year = 'No Date'
  let month = 'General'
  let datePart = ''
  if (photo.created_at) {
    const rawDate = photo.created_at.split('T')[0].split(' ')[0]
    const parts = rawDate.split('-')
    if (parts.length >= 1 && parts[0].length === 4 && !isNaN(Number(parts[0]))) {
      year = parts[0]
      datePart = rawDate
      if (parts.length >= 2) {
        const monthNum = parseInt(parts[1], 10)
        if (monthNum >= 1 && monthNum <= 12) {
          month = MONTH_NAMES[monthNum - 1]
        }
      }
    }
  }

  // 2. Identify Category
  const isDoc = separateDocs && isPhotoDocument(photo)
  const isScrn = separateScreenshots && isPhotoScreenshot(photo)
  const isVid = separateVideos && isPhotoVideo(photo)

  // 3. Trip detection (Direct GPS location vs Smart Inferred Time-Window location)
  let effectiveLocation = photo.location_name && photo.location_name.trim().length > 0
    ? photo.location_name.trim()
    : null
  let isInferredTrip = false

  if (!effectiveLocation && separateTrips && smartTripInference && datePart && !isDoc && !isScrn) {
    const matchedTrip = findMatchingTripWindow(datePart, tripWindows)
    if (matchedTrip) {
      effectiveLocation = matchedTrip.locationName
      isInferredTrip = true
    }
  }

  const hasTrip = separateTrips && effectiveLocation !== null

  // 4. Construct Relative Path based on preset
  if (preset === 'category-first') {
    if (isDoc) {
      const docCat = photo.document_category ? sanitizeFolderName(photo.document_category) : 'General Documents'
      return { relativePath: join('Documents', docCat, year), category: 'Documents' }
    }
    if (isScrn) {
      return { relativePath: join('Screenshots', year), category: 'Screenshots' }
    }
    if (isVid) {
      return { relativePath: join('Videos', year, month), category: 'Videos' }
    }
    if (hasTrip) {
      const tripName = sanitizeFolderName(effectiveLocation!)
      return { relativePath: join('Trips', tripName, year), category: 'Trips', isInferredTrip }
    }
    return { relativePath: join('Photos', year, month), category: 'Photos' }
  }

  if (preset === 'year-month') {
    return { relativePath: join(year, month), category: isVid ? 'Videos' : 'Photos' }
  }

  // Default: 'smart-hierarchy' (Year -> Event/Trip / Documents / Screenshots / Videos / Month)
  if (hasTrip) {
    const tripName = sanitizeFolderName(effectiveLocation!)
    return { relativePath: join(year, `Trip - ${tripName}`), category: 'Trips', isInferredTrip }
  }
  if (isDoc) {
    const docCat = photo.document_category ? sanitizeFolderName(photo.document_category) : 'General'
    return { relativePath: join(year, 'Documents', docCat), category: 'Documents' }
  }
  if (isScrn) {
    return { relativePath: join(year, 'Screenshots'), category: 'Screenshots' }
  }
  if (isVid) {
    return { relativePath: join(year, 'Videos'), category: 'Videos' }
  }
  return { relativePath: join(year, month), category: 'Photos' }
}

/**
 * Fetch candidate photos from database according to options.
 */
function fetchCandidatePhotos(options: OrganizationOptions): PhotoRow[] {
  const database = getDb()
  let sql = 'SELECT * FROM photos WHERE is_trashed = 0'
  const params: any[] = []

  if (options.fileIds && options.fileIds.length > 0) {
    const placeholders = options.fileIds.map(() => '?').join(',')
    sql += ` AND id IN (${placeholders})`
    params.push(...options.fileIds)
  } else if (options.folderPathFilter) {
    sql += ' AND file_path LIKE ?'
    params.push(`${options.folderPathFilter}%`)
  }

  sql += ' ORDER BY created_at DESC'

  const stmt = database.prepare(sql)
  if (params.length > 0) stmt.bind(params)

  const rows: PhotoRow[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as PhotoRow)
  }
  stmt.free()

  return rows
}

/**
 * Prompts user for destination folder selection.
 */
export async function selectOrganizationDestination(browserWindow?: BrowserWindow): Promise<string | null> {
  const dialogOptions: Electron.OpenDialogOptions = {
    title: 'Select Destination Folder for Organized Photos',
    properties: ['openDirectory', 'createDirectory']
  }

  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

/**
 * Generates an interactive preview plan of how the library will be structured.
 */
export function generateOrganizationPreviewPlan(options: OrganizationOptions): OrganizationPreviewPlan {
  const photos = fetchCandidatePhotos(options)
  const tripWindows = buildTripWindows(photos)
  const yearMap = new Map<string, { totalBytes: number; subfolderMap: Map<string, PreviewSubfolder> }>()

  let totalBytes = 0
  const categoryBreakdown = {
    trips: 0,
    documents: 0,
    screenshots: 0,
    videos: 0,
    generalPhotos: 0
  }

  for (const photo of photos) {
    const size = photo.file_size || 0
    totalBytes += size

    const { relativePath, category } = calculateRelativeSubpath(photo, options, tripWindows)
    const parts = relativePath.split(/[\\/]/)
    const topYear = parts[0] || 'No Date'
    const subfolderName = parts.slice(1).join(' / ') || 'Root'

    // Update category counts
    if (category === 'Trips') categoryBreakdown.trips++
    else if (category === 'Documents') categoryBreakdown.documents++
    else if (category === 'Screenshots') categoryBreakdown.screenshots++
    else if (category === 'Videos') categoryBreakdown.videos++
    else categoryBreakdown.generalPhotos++

    if (!yearMap.has(topYear)) {
      yearMap.set(topYear, { totalBytes: 0, subfolderMap: new Map() })
    }

    const yearData = yearMap.get(topYear)!
    yearData.totalBytes += size

    if (!yearData.subfolderMap.has(subfolderName)) {
      yearData.subfolderMap.set(subfolderName, {
        name: subfolderName,
        fileCount: 0,
        totalBytes: 0,
        sampleFilenames: []
      })
    }

    const subData = yearData.subfolderMap.get(subfolderName)!
    subData.fileCount++
    subData.totalBytes += size
    if (subData.sampleFilenames.length < 3 && photo.filename) {
      subData.sampleFilenames.push(photo.filename)
    }
  }

  const yearGroups: PreviewYearGroup[] = []
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => {
    if (a === 'No Date') return 1
    if (b === 'No Date') return -1
    return b.localeCompare(a)
  })

  for (const year of sortedYears) {
    const yearData = yearMap.get(year)!
    const subfolders = Array.from(yearData.subfolderMap.values()).sort((a, b) => b.fileCount - a.fileCount)
    const fileCount = subfolders.reduce((acc, s) => acc + s.fileCount, 0)
    yearGroups.push({
      year,
      fileCount,
      totalBytes: yearData.totalBytes,
      subfolders
    })
  }

  return {
    totalFiles: photos.length,
    totalBytes,
    yearGroups,
    categoryBreakdown
  }
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
 * Executes the full library organization (Copy or Move) with real-time progress and zero-loss audit.
 */
export async function executeOrganization(
  options: OrganizationOptions,
  onProgress?: (progress: OrganizationProgress) => void
): Promise<OrganizationResult> {
  isCancelled = false
  const photos = fetchCandidatePhotos(options)
  const tripWindows = buildTripWindows(photos)
  const mode = options.mode || 'copy'
  const strategy = options.collisionStrategy || 'rename'
  const destDir = options.destinationDir

  if (!destDir) {
    throw new Error('Destination directory is required')
  }

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }

  let completed = 0
  let skippedCount = 0
  let failedCount = 0
  let bytesTransferred = 0
  const totalFiles = photos.length
  const totalBytes = photos.reduce((acc, p) => acc + (p.file_size || 0), 0)
  const entries: OrganizedFileEntry[] = []
  const errors: string[] = []

  const startTime = Date.now()

  for (const photo of photos) {
    if (isCancelled) {
      errors.push('Organization operation cancelled by user.')
      break
    }

    const srcPath = photo.file_path
    const fileName = photo.filename || basename(srcPath)
    const { relativePath, category } = calculateRelativeSubpath(photo, options, tripWindows)
    const targetFolder = join(destDir, relativePath)
    const initialTargetPath = join(targetFolder, fileName)

    if (!existsSync(srcPath)) {
      failedCount++
      errors.push(`Source file missing: ${srcPath}`)
      entries.push({
        photoId: photo.id,
        originalPath: srcPath,
        newPath: initialTargetPath,
        relativeSubpath: relativePath,
        fileSize: photo.file_size || 0,
        category,
        status: 'failed',
        error: 'Source file does not exist on disk'
      })
      continue
    }

    const resolvedTargetPath = resolveCollision(initialTargetPath, strategy)
    if (!resolvedTargetPath) {
      skippedCount++
      entries.push({
        photoId: photo.id,
        originalPath: srcPath,
        newPath: initialTargetPath,
        relativeSubpath: relativePath,
        fileSize: photo.file_size || 0,
        category,
        status: 'skipped',
        error: 'Skipped due to duplicate collision strategy'
      })
      continue
    }

    try {
      const srcStat = statSync(srcPath)
      const targetDirName = dirname(resolvedTargetPath)
      if (!existsSync(targetDirName)) {
        mkdirSync(targetDirName, { recursive: true })
      }

      // 1. Copy file to destination
      copyFileSync(srcPath, resolvedTargetPath)

      // 2. Zero-Loss Verification: Check destination file exists and byte size matches exactly
      if (!existsSync(resolvedTargetPath)) {
        throw new Error('Destination file not found after copy operation')
      }
      const dstStat = statSync(resolvedTargetPath)
      if (dstStat.size !== srcStat.size) {
        try { unlinkSync(resolvedTargetPath) } catch {}
        throw new Error(`Size mismatch verification failed: source (${srcStat.size}B) != destination (${dstStat.size}B)`)
      }

      // 3. If Mode === 'move', safely unlink source only after byte verification
      if (mode === 'move') {
        try {
          unlinkSync(srcPath)
        } catch (unlinkErr: any) {
          errors.push(`Copied successfully, but could not delete source ${srcPath}: ${unlinkErr.message}`)
        }

        // Update database photo path
        const database = getDb()
        database.run('UPDATE photos SET file_path = ?, filename = ? WHERE id = ?', [
          resolvedTargetPath,
          basename(resolvedTargetPath),
          photo.id
        ])
      }

      bytesTransferred += srcStat.size
      completed++

      entries.push({
        photoId: photo.id,
        originalPath: srcPath,
        newPath: resolvedTargetPath,
        relativeSubpath: relativePath,
        fileSize: srcStat.size,
        category,
        status: mode === 'move' ? 'moved' : 'copied'
      })
    } catch (err: any) {
      failedCount++
      const msg = `Failed to process ${fileName}: ${err.message}`
      errors.push(msg)
      entries.push({
        photoId: photo.id,
        originalPath: srcPath,
        newPath: resolvedTargetPath || initialTargetPath,
        relativeSubpath: relativePath,
        fileSize: photo.file_size || 0,
        category,
        status: 'failed',
        error: err.message
      })
    }

    // Emit live progress
    if (onProgress) {
      const elapsedSec = (Date.now() - startTime) / 1000
      const speed = elapsedSec > 0 ? bytesTransferred / elapsedSec : 0
      onProgress({
        completed,
        total: totalFiles,
        currentFile: fileName,
        bytesTransferred,
        totalBytes,
        percentage: totalFiles > 0 ? Math.round((completed / totalFiles) * 100) : 100,
        speedBytesPerSec: speed
      })
    }
  }

  if (mode === 'move') {
    saveDatabase()
  }

  // 4. Generate Manifest and Report Files in Destination Directory
  let manifestPath: string | undefined
  let reportPath: string | undefined

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    manifestPath = join(destDir, `PhotoSort_Manifest_${timestamp}.json`)
    const manifestData = {
      app: 'PhotoSort',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      mode,
      destinationDir: destDir,
      totalCandidateFiles: totalFiles,
      successfullyProcessed: completed,
      skipped: skippedCount,
      failed: failedCount,
      totalBytesTransferred: bytesTransferred,
      zeroLossVerified: failedCount === 0 && completed + skippedCount === totalFiles,
      entries
    }
    writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8')

    reportPath = join(destDir, `PhotoSort_Organization_Report_${timestamp}.txt`)
    const reportText = [
      '========================================================================',
      '               PHOTOSORT - FOLDER ORGANIZATION REPORT                   ',
      '========================================================================',
      `Date & Time        : ${new Date().toLocaleString()}`,
      `Operation Mode     : ${mode.toUpperCase()} (${mode === 'copy' ? 'Non-destructive Copy' : 'In-Place Move'})`,
      `Destination Folder : ${destDir}`,
      `Total Files Scanned: ${totalFiles}`,
      `Successfully Sorted: ${completed}`,
      `Skipped Files      : ${skippedCount}`,
      `Failed / Errored   : ${failedCount}`,
      `Data Transferred   : ${(bytesTransferred / (1024 * 1024)).toFixed(2)} MB`,
      `Zero-Loss Audit    : ${failedCount === 0 ? 'PASSED (100% Zero-Loss Verified)' : 'FAILED (Review errors below)'}`,
      '------------------------------------------------------------------------',
      errors.length > 0 ? `Errors Encountered:\n${errors.join('\n')}\n------------------------------------------------------------------------` : '',
      'Sorted File List (Sample):',
      ...entries.slice(0, 100).map(e => `[${e.status.toUpperCase()}] ${e.category} -> ${e.newPath}`),
      entries.length > 100 ? `... and ${entries.length - 100} more files (see JSON manifest for full detail)` : '',
      '========================================================================'
    ].filter(Boolean).join('\n')

    writeFileSync(reportPath, reportText, 'utf-8')
  } catch (manifestErr) {
    console.error('Failed to write manifest/report:', manifestErr)
  }

  return {
    success: failedCount === 0,
    mode,
    destinationDir: destDir,
    totalFiles,
    processedCount: completed,
    skippedCount,
    failedCount,
    totalBytesTransferred: bytesTransferred,
    manifestPath,
    reportPath,
    entries,
    errors
  }
}
