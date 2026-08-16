import { basename, extname } from 'path'
import { existsSync, readFileSync } from 'fs'
import exifr from 'exifr'
import { imageSize } from 'image-size'
import ffmpeg from 'fluent-ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

// Configure ffprobe path if available
if (ffprobeInstaller && ffprobeInstaller.path) {
  try {
    ffmpeg.setFfprobePath(ffprobeInstaller.path)
  } catch {}
}

export type ScreenshotClassification = 'photo' | 'uncertain' | 'screenshot'

export interface ScreenshotDetectionResult {
  classification: ScreenshotClassification
  score: number
  matchedSignals: string[]
}

export interface SignalResult {
  matched: boolean
  score: number
  reason: string
}

export interface ClassifyScreenshotOptions {
  osNativeScreenshot?: boolean
}

/**
 * Standard phone, tablet, and desktop display resolutions (exact pixel dimensions).
 */
export const KNOWN_SCREENSHOT_RESOLUTIONS: readonly [number, number][] = [
  // Phones
  [1080, 1920],
  [1080, 2340],
  [1080, 2400],
  [1080, 2460],
  [1170, 2532],
  [1179, 2556],
  [1284, 2778],
  [1290, 2796],
  [1320, 2868],
  [1440, 3120],
  [1440, 3200],
  // Tablets
  [1620, 2160],
  [2048, 2732],
  [1640, 2360],
  [1668, 2388],
  [1600, 2560],
  // Desktop / Laptops
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1680, 1050],
  [1920, 1080],
  [1920, 1200],
  [2560, 1440],
  [2560, 1600],
  [3024, 1964],
  [3440, 1440],
  [3840, 2160],
  [5120, 2880]
] as const

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.heic', '.webp', '.bmp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm'])

/**
 * Helper to check if a filename unambiguously matches a specific OS screenshot pattern
 */
export function isExactOsFilenamePattern(filename: string): boolean {
  const name = filename.trim()
  return (
    // 1. Windows: Screenshot 2026-08-16 193021.png
    /^Screenshot[ _-]\d{4}-\d{2}-\d{2}[ _-]\d{6}/i.test(name) ||
    // 2. macOS: Screen Shot 2026-08-16 at 7.30.21 PM.png or Screenshot 2026-08-16 at ...
    /^Screen ?Shot \d{4}-\d{2}-\d{2} at \d{1,2}\.\d{2}\.\d{2}/i.test(name) ||
    // 3. Android: Screenshot_20260816-193021.png or Screenshot_20260816_193021
    /^Screenshot_\d{8}[-_]\d{6}/i.test(name)
  )
}

// ─── Signal 1: Filename regex match (+40) ──────────────────────────────────
export function checkFilenameSignal(filename: string): SignalResult {
  const name = filename.trim()

  // 1. Windows: Screenshot 2026-08-16 193021.png
  if (/^Screenshot[ _-]\d{4}-\d{2}-\d{2}[ _-]\d{6}/i.test(name)) {
    return {
      matched: true,
      score: 40,
      reason: 'Filename matches Windows screenshot pattern'
    }
  }

  // 2. Windows fallback: contains "screenshot" AND a date-like token (\d{4}-\d{2}-\d{2} or \d{8})
  const hasScreenshotWord = /screenshot/i.test(name)
  const hasDateToken = /\d{4}-\d{2}-\d{2}|\d{8}/.test(name)
  if (hasScreenshotWord && hasDateToken) {
    return {
      matched: true,
      score: 40,
      reason: "Filename contains 'screenshot' and date token"
    }
  }

  // 3. macOS: Screen Shot 2026-08-16 at 7.30.21 PM.png
  if (/^Screen ?Shot \d{4}-\d{2}-\d{2} at \d{1,2}\.\d{2}\.\d{2}/i.test(name)) {
    return {
      matched: true,
      score: 40,
      reason: 'Filename matches macOS screenshot pattern'
    }
  }

  // 4. Android: Screenshot_20260816-193021.png
  if (/^Screenshot_\d{8}[-_]\d{6}/i.test(name)) {
    return {
      matched: true,
      score: 40,
      reason: 'Filename matches Android screenshot pattern'
    }
  }

  // 5. Generic fallback: contains "screenshot" or "screen shot" or "screen_shot" as whole word
  if (/\b(screenshot|screen[ _]shot)\b/i.test(name) || /(?:^|[\s_\-.])screen[\s_]?shot(?:$|[\s_\-.])/i.test(name)) {
    return {
      matched: true,
      score: 40,
      reason: 'Filename contains generic screenshot keyword'
    }
  }

  return {
    matched: false,
    score: 0,
    reason: ''
  }
}

// ─── Signal 2: PNG metadata tag match (+30, PNG files only) ────────────────
export function checkPngMetadataSignal(
  metadata: Record<string, any> | null,
  isPng: boolean
): SignalResult {
  if (!isPng || !metadata) {
    return { matched: false, score: 0, reason: '' }
  }

  const KNOWN_SOFTWARE_NAMES = [
    'screencapture',
    'Snipping Tool',
    'Screenshot',
    'Greenshot',
    'ShareX',
    'Lightshot'
  ]

  // Deep inspect string values and keys in metadata object
  const searchValues: string[] = []
  const searchKeys: string[] = []

  function collectStrings(obj: any, depth = 0): void {
    if (!obj || depth > 3) return
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        searchKeys.push(k)
        if (typeof v === 'string') {
          searchValues.push(v)
        } else if (typeof v === 'object' && v !== null) {
          collectStrings(v, depth + 1)
        }
      }
    }
  }

  collectStrings(metadata)

  // Check Software field or any string property
  for (const val of searchValues) {
    const lowerVal = val.toLowerCase()
    for (const tool of KNOWN_SOFTWARE_NAMES) {
      if (lowerVal.includes(tool.toLowerCase())) {
        return {
          matched: true,
          score: 30,
          reason: `PNG software/text chunk matches screenshot tool (${tool})`
        }
      }
    }
    if (lowerVal.includes('com.apple.nsscreenshot')) {
      return {
        matched: true,
        score: 30,
        reason: 'PNG metadata contains Apple screenshot identifier (com.apple.NSScreenshot)'
      }
    }
  }

  for (const k of searchKeys) {
    if (k.toLowerCase().includes('com.apple.nsscreenshot')) {
      return {
        matched: true,
        score: 30,
        reason: 'PNG metadata key contains Apple screenshot identifier (com.apple.NSScreenshot)'
      }
    }
  }

  return { matched: false, score: 0, reason: '' }
}

// ─── Signal 3: Camera EXIF absence (+20, PNG files only) ───────────────────
export function checkExifAbsenceSignal(
  metadata: Record<string, any> | null,
  isPng: boolean
): SignalResult {
  // Spec: Only for PNG. Skip this signal entirely for JPEG/HEIC
  if (!isPng) {
    return { matched: false, score: 0, reason: '' }
  }

  // True only if ALL camera EXIF fields (Make, Model, FNumber, ExposureTime, ISO, GPS) are absent
  const make = metadata?.Make
  const model = metadata?.Model
  const fNumber = metadata?.FNumber
  const exposureTime = metadata?.ExposureTime
  const iso = metadata?.ISO
  const gpsLat = metadata?.GPSLatitude
  const gpsLon = metadata?.GPSLongitude

  const hasAnyCameraExif = Boolean(
    (make && String(make).trim()) ||
    (model && String(model).trim()) ||
    (fNumber !== undefined && fNumber !== null && fNumber !== 0) ||
    (exposureTime !== undefined && exposureTime !== null) ||
    (iso !== undefined && iso !== null && iso !== 0) ||
    (gpsLat !== undefined && gpsLat !== null && gpsLat !== 0) ||
    (gpsLon !== undefined && gpsLon !== null && gpsLon !== 0)
  )

  if (!hasAnyCameraExif) {
    return {
      matched: true,
      score: 20,
      reason: 'No camera EXIF metadata in PNG format'
    }
  }

  return { matched: false, score: 0, reason: '' }
}

// ─── Signal 4: Known resolution match (+15) ────────────────────────────────
export function checkResolutionSignal(width?: number, height?: number): SignalResult {
  if (!width || !height || width <= 0 || height <= 0) {
    return { matched: false, score: 0, reason: '' }
  }

  for (const [rw, rh] of KNOWN_SCREENSHOT_RESOLUTIONS) {
    // Check in either orientation (portrait or landscape)
    if ((width === rw && height === rh) || (width === rh && height === rw)) {
      return {
        matched: true,
        score: 15,
        reason: `Image resolution matches standard screen resolution (${width}x${height})`
      }
    }
  }

  return { matched: false, score: 0, reason: '' }
}

// ─── Signal 5: Camera EXIF presence penalty (-50) ──────────────────────────
export function checkExifPresencePenalty(
  metadata: Record<string, any> | null,
  videoTags?: Record<string, any> | null
): SignalResult {
  // Check image metadata
  const make = metadata?.Make
  const model = metadata?.Model
  const gpsLat = metadata?.GPSLatitude

  const isImageCameraExifPresent = Boolean(
    (make && String(make).trim()) ||
    (model && String(model).trim()) ||
    (gpsLat !== undefined && gpsLat !== null && gpsLat !== 0)
  )

  // Check video container tags
  const vMake = videoTags?.make || videoTags?.Make || videoTags?.['com.apple.quicktime.make']
  const vModel = videoTags?.model || videoTags?.Model || videoTags?.['com.apple.quicktime.model']
  const isVideoCameraPresent = Boolean(
    (vMake && String(vMake).trim()) ||
    (vModel && String(vModel).trim())
  )

  if (isImageCameraExifPresent || isVideoCameraPresent) {
    const cameraInfo = [make || vMake, model || vModel].filter(Boolean).join(' ')
    const desc = cameraInfo ? ` (${cameraInfo})` : ''
    return {
      matched: true,
      score: -50,
      reason: `Camera Make/Model or GPS EXIF present${desc} (penalty applied)`
    }
  }

  return { matched: false, score: 0, reason: '' }
}

// ─── Video Helper: Extract container metadata via ffprobe ──────────────────
async function extractVideoMetadata(filePath: string): Promise<Record<string, any> | null> {
  return new Promise((resolve) => {
    try {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err || !data || !data.format) {
          resolve(null)
        } else {
          resolve(data.format.tags || null)
        }
      })
    } catch {
      resolve(null)
    }
  })
}

/**
 * Classifies an imported image or video file into 'screenshot', 'uncertain', or 'photo'
 * using the 4-step explainable weighted signal algorithm.
 */
export async function classifyScreenshot(
  filePath: string,
  options?: ClassifyScreenshotOptions
): Promise<ScreenshotDetectionResult> {
  if (!filePath || !existsSync(filePath)) {
    return {
      classification: 'photo',
      score: 0,
      matchedSignals: ['File does not exist']
    }
  }

  // ─── Step 0: Gate by file type ───────────────────────────────────────────
  const ext = extname(filePath).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.has(ext)
  const isVideo = VIDEO_EXTENSIONS.has(ext)

  // Non-supported media: classify as Photo immediately, score 0
  if (!isImage && !isVideo) {
    return {
      classification: 'photo',
      score: 0,
      matchedSignals: ['Non-image/video file type']
    }
  }

  const fileName = basename(filePath)
  const isPng = ext === '.png'
  const matchedSignals: string[] = []

  // ─── Step 3: Instant-100% Override Check 1: OS-native screenshot flag ─────
  if (options?.osNativeScreenshot) {
    return {
      classification: 'screenshot',
      score: 100,
      matchedSignals: ['Instant Override: OS-native screenshot flag present']
    }
  }

  // ─── Video Handling ──────────────────────────────────────────────────────
  if (isVideo) {
    let videoTags: Record<string, any> | null = null
    try {
      videoTags = await extractVideoMetadata(filePath)
    } catch {
      matchedSignals.push('Video metadata read skipped')
    }

    const videoPenalty = checkExifPresencePenalty(null, videoTags)
    const isExactOs = isExactOsFilenamePattern(fileName)

    // Step 3 Override for Video
    if (isExactOs && !videoPenalty.matched) {
      return {
        classification: 'screenshot',
        score: 100,
        matchedSignals: [
          'Instant Override: Exact OS screenshot naming convention combined with zero camera metadata'
        ]
      }
    }

    let score = 0
    // Signal 1: Filename pattern (+40)
    const sig1 = checkFilenameSignal(fileName)
    if (sig1.matched) {
      score += sig1.score
      matchedSignals.push(sig1.reason)
    }

    // Signal 5: Camera EXIF presence penalty (-50)
    if (videoPenalty.matched) {
      score += videoPenalty.score
      matchedSignals.push(videoPenalty.reason)
    }

    const classification: ScreenshotClassification =
      score >= 60 ? 'screenshot' : score >= 30 ? 'uncertain' : 'photo'

    return {
      classification,
      score,
      matchedSignals
    }
  }

  // ─── Image Metadata Extraction ───────────────────────────────────────────
  let metadata: Record<string, any> | null = null
  let width: number | undefined
  let height: number | undefined
  let metadataReadFailed = false

  try {
    metadata = await exifr.parse(filePath, {
      tiff: true,
      xmp: true,
      png: true,
      ihdr: true,
      jfif: true,
      icc: false
    })

    if (metadata) {
      width = metadata.ImageWidth || metadata.ExifImageWidth || metadata.width
      height = metadata.ImageHeight || metadata.ExifImageHeight || metadata.height
    }
  } catch {
    metadataReadFailed = true
    matchedSignals.push('Metadata read failed — skipped EXIF signals')
  }

  // Fallback for image dimensions via image-size if not extracted from EXIF
  if (!width || !height) {
    try {
      const buf = readFileSync(filePath)
      const dim = imageSize(buf)
      if (dim && dim.width && dim.height) {
        width = dim.width
        height = dim.height
      }
    } catch {}
  }

  // ─── Step 3: Instant-100% Override Check 2: Exact OS Filename + Zero Camera EXIF ───
  const penalty = (!metadataReadFailed && metadata) ? checkExifPresencePenalty(metadata) : { matched: false, score: 0, reason: '' }
  const isExactOs = isExactOsFilenamePattern(fileName)
  const hasZeroCameraExif = !penalty.matched

  if (isExactOs && hasZeroCameraExif) {
    return {
      classification: 'screenshot',
      score: 100,
      matchedSignals: [
        'Instant Override: Exact OS screenshot naming convention combined with zero camera metadata'
      ]
    }
  }

  // ─── Step 1: Score each file against signals ──────────────────────────────
  let score = 0

  // Signal 1: Filename regex match (+40)
  const sig1 = checkFilenameSignal(fileName)
  if (sig1.matched) {
    score += sig1.score
    matchedSignals.push(sig1.reason)
  }

  if (!metadataReadFailed) {
    // Signal 2: Software/creator tag match (+30, PNG only)
    const sig2 = checkPngMetadataSignal(metadata, isPng)
    if (sig2.matched) {
      score += sig2.score
      matchedSignals.push(sig2.reason)
    }

    // Signal 3: Camera EXIF absence (+20, PNG only - skipped for JPEG/HEIC)
    const sig3 = checkExifAbsenceSignal(metadata, isPng)
    if (sig3.matched) {
      score += sig3.score
      matchedSignals.push(sig3.reason)
    }
  }

  // Signal 4: Known resolution match (+15)
  const sig4 = checkResolutionSignal(width, height)
  if (sig4.matched) {
    score += sig4.score
    matchedSignals.push(sig4.reason)
  }

  // Signal 5: Camera EXIF presence penalty (-50) — Always runs last
  if (penalty.matched) {
    score += penalty.score
    matchedSignals.push(penalty.reason)
  }

  // ─── Step 2: Classify by total score ─────────────────────────────────────
  const classification: ScreenshotClassification =
    score >= 60 ? 'screenshot' : score >= 30 ? 'uncertain' : 'photo'

  return {
    classification,
    score,
    matchedSignals
  }
}

/**
 * Helper to process a batch of files with controlled concurrency.
 */
export async function classifyScreenshotBatch(
  filePaths: string[],
  concurrency = 16
): Promise<Map<string, ScreenshotDetectionResult>> {
  const results = new Map<string, ScreenshotDetectionResult>()
  const limit = Math.max(1, concurrency)

  for (let i = 0; i < filePaths.length; i += limit) {
    const chunk = filePaths.slice(i, i + limit)
    const chunkResults = await Promise.all(
      chunk.map(async (fp) => {
        try {
          const res = await classifyScreenshot(fp)
          return { fp, res }
        } catch {
          return {
            fp,
            res: {
              classification: 'photo' as ScreenshotClassification,
              score: 0,
              matchedSignals: ['Classification error']
            }
          }
        }
      })
    )

    for (const { fp, res } of chunkResults) {
      results.set(fp, res)
    }
  }

  return results
}
