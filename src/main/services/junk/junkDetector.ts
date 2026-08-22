import { basename, extname } from 'path'
import { existsSync, statSync } from 'fs'
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

export type JunkClassification = 'junk' | 'uncertain' | 'keep'

export interface MatchedSignal {
  signal: string
  points: number
  reason: string
}

export interface JunkDetectionResult {
  classification: JunkClassification
  score: number
  matchedSignals: MatchedSignal[]
  suggestedAction: 'move_to_junk_folder' | 'flag_for_review' | 'none'
  category?: 'whatsapp' | 'telegram' | 'facebook' | 'instagram' | 'sticker' | 'other'
}

export const KNOWN_PLATFORM_DIMENSIONS: readonly [number, number][] = [
  // WhatsApp caps
  [1600, 1600],
  [1600, 900],
  [1280, 1280],
  // Instagram feed / story / reels
  [1080, 1080],
  [1080, 1350],
  [1080, 1920],
  [1080, 608],
  // Facebook / Messenger
  [1200, 630],
  [960, 960],
  // Standard low-res forward caps
  [848, 480],
  [640, 480],
  [512, 512]
] as const

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.heic', '.webp', '.bmp', '.gif'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.3gp'])

// ─── Signal 1: Filename Pattern (+35) ───────────────────────────────────────
export function checkFilenamePattern(filename: string): { matched: boolean; points: number; reason: string; category?: JunkDetectionResult['category'] } {
  const name = filename.trim()

  // 1. WhatsApp image
  if (/^IMG-\d{8}-WA\d{4}\./i.test(name)) {
    return { matched: true, points: 35, reason: 'WhatsApp image naming pattern (IMG-YYYYMMDD-WAxxxx)', category: 'whatsapp' }
  }

  // 2. WhatsApp video
  if (/^VID-\d{8}-WA\d{4}\./i.test(name)) {
    return { matched: true, points: 35, reason: 'WhatsApp video naming pattern (VID-YYYYMMDD-WAxxxx)', category: 'whatsapp' }
  }

  // 3. WhatsApp sticker
  if (/^STK-\d{8}-WA\d{4}\./i.test(name)) {
    return { matched: true, points: 35, reason: 'WhatsApp sticker naming pattern (STK-YYYYMMDD-WAxxxx)', category: 'sticker' }
  }

  // 4. Telegram image
  if (/^photo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\./i.test(name)) {
    return { matched: true, points: 35, reason: 'Telegram photo naming pattern', category: 'telegram' }
  }

  // 5. Telegram video
  if (/^video_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\./i.test(name)) {
    return { matched: true, points: 35, reason: 'Telegram video naming pattern', category: 'telegram' }
  }

  // 6. Facebook / Messenger download
  if (/^received_\d+/i.test(name) || /^FB_IMG_\d+/i.test(name)) {
    return { matched: true, points: 35, reason: 'Facebook / Messenger downloaded image pattern', category: 'facebook' }
  }

  // 7. Generic downloaded hash pattern (weak tiebreaker)
  if (!/^(IMG_|DSC_|PXL_|DJI_|GOPR|SAM_|DCIM)/i.test(name)) {
    if (/^[0-9a-f]{16,32}\./i.test(name) || /^[0-9]{12,20}\./i.test(name) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(name)) {
      return { matched: true, points: 20, reason: 'Generated hash / timestamp filename from messaging app', category: 'other' }
    }
  }

  return { matched: false, points: 0, reason: '' }
}

// ─── Signal 2: Source Folder Path (+40) ─────────────────────────────────────
export function checkSourceFolderSignal(filePath: string): { matched: boolean; points: number; reason: string; category?: JunkDetectionResult['category'] } {
  const norm = filePath.replace(/\\/g, '/').toLowerCase()

  if (norm.includes('whatsapp/media/whatsapp images') || norm.includes('whatsapp images')) {
    return { matched: true, points: 40, reason: 'Source path is WhatsApp Images directory', category: 'whatsapp' }
  }
  if (norm.includes('whatsapp/media/whatsapp video') || norm.includes('whatsapp video')) {
    return { matched: true, points: 40, reason: 'Source path is WhatsApp Video directory', category: 'whatsapp' }
  }
  if (norm.includes('whatsapp/media/whatsapp animated gifs') || norm.includes('whatsapp animated gifs') || norm.includes('whatsapp stickers')) {
    return { matched: true, points: 40, reason: 'Source path is WhatsApp GIFs / Stickers directory', category: 'sticker' }
  }
  if (norm.includes('whatsapp/media/whatsapp documents') || norm.includes('whatsapp documents')) {
    return { matched: true, points: 35, reason: 'Source path is WhatsApp Documents directory', category: 'whatsapp' }
  }
  if (norm.includes('telegram/telegram images') || norm.includes('telegram images') || norm.includes('telegram video') || norm.includes('/telegram/')) {
    return { matched: true, points: 40, reason: 'Source path is Telegram media folder', category: 'telegram' }
  }
  if (norm.includes('/instagram/')) {
    return { matched: true, points: 35, reason: 'Source path is Instagram saved folder', category: 'instagram' }
  }
  if (norm.includes('/messenger/') || norm.includes('/facebook/')) {
    return { matched: true, points: 35, reason: 'Source path is Messenger / Facebook folder', category: 'facebook' }
  }
  if (norm.includes('/downloads/whatsapp') || norm.includes('/whatsapp/')) {
    return { matched: true, points: 35, reason: 'Source path contains WhatsApp directory structure', category: 'whatsapp' }
  }

  return { matched: false, points: 0, reason: '' }
}

// ─── Signal 5: Platform Resize Dimensions (+15) ─────────────────────────────
export function checkPlatformDimensions(width: number, height: number): { matched: boolean; points: number; reason: string } {
  if (!width || !height) return { matched: false, points: 0, reason: '' }

  for (const [kw, kh] of KNOWN_PLATFORM_DIMENSIONS) {
    if ((width === kw && height === kh) || (width === kh && height === kw)) {
      return {
        matched: true,
        points: 15,
        reason: `Matches platform standard forward resolution (${width}×${height})`
      }
    }
  }

  return { matched: false, points: 0, reason: '' }
}

// ─── Signal 8: Sticker / WebP short-circuit (+40) ───────────────────────────
export function checkStickerShortCircuit(ext: string, width?: number, height?: number, fileSize?: number): { matched: boolean; points: number; reason: string } {
  if (ext === '.webp') {
    if (width && height && Math.max(width, height) <= 800) {
      return { matched: true, points: 40, reason: 'WebP sticker format (< 800px dimension)' }
    }
    if (fileSize && fileSize < 250 * 1024) {
      return { matched: true, points: 40, reason: 'WebP small animated/static sticker file' }
    }
  }

  return { matched: false, points: 0, reason: '' }
}

// ─── Video Compression Signature via ffprobe (+20) ──────────────────────────
async function checkVideoCompressionSignature(filePath: string): Promise<{ matched: boolean; points: number; reason: string }> {
  return new Promise((resolve) => {
    try {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err || !metadata || !metadata.streams) {
          return resolve({ matched: false, points: 0, reason: '' })
        }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
        if (!videoStream) {
          return resolve({ matched: false, points: 0, reason: '' })
        }

        const width = videoStream.width || 0
        const height = videoStream.height || 0
        const bitrate = Number(videoStream.bit_rate || metadata.format.bit_rate || 0)

        // WhatsApp video caps: 848x480, 640x480, 640x360 with low bitrate < 1.8 Mbps
        const isLowRes = (width <= 848 && height <= 480) || (width <= 480 && height <= 848)
        const isLowBitrate = bitrate > 0 && bitrate < 1800000

        if (isLowRes && isLowBitrate) {
          return resolve({
            matched: true,
            points: 20,
            reason: `WhatsApp video compression signature (${width}×${height} @ ${Math.round(bitrate / 1000)}kbps)`
          })
        }

        resolve({ matched: false, points: 0, reason: '' })
      })
    } catch {
      resolve({ matched: false, points: 0, reason: '' })
    }
  })
}

/**
 * Classifies a single file using the full 9-signal Junk/Forwarded Media algorithm.
 */
export async function classifyJunkMedia(filePath: string): Promise<JunkDetectionResult> {
  const ext = extname(filePath).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.has(ext)
  const isVideo = VIDEO_EXTENSIONS.has(ext)

  // Step 0: Gate by media file type
  if (!isImage && !isVideo) {
    return {
      classification: 'keep',
      score: 0,
      matchedSignals: [],
      suggestedAction: 'none'
    }
  }

  if (!existsSync(filePath)) {
    return {
      classification: 'keep',
      score: 0,
      matchedSignals: [],
      suggestedAction: 'none'
    }
  }

  const filename = basename(filePath)
  const matchedSignals: MatchedSignal[] = []
  let detectedCategory: JunkDetectionResult['category'] = 'other'

  // Signal 1: Filename Pattern (+35)
  const sig1 = checkFilenamePattern(filename)
  if (sig1.matched) {
    matchedSignals.push({ signal: 'Signal 1: Filename Pattern', points: sig1.points, reason: sig1.reason })
    if (sig1.category) detectedCategory = sig1.category
  }

  // Signal 2: Source Folder Path (+40)
  const sig2 = checkSourceFolderSignal(filePath)
  if (sig2.matched) {
    matchedSignals.push({ signal: 'Signal 2: Source Folder Path', points: sig2.points, reason: sig2.reason })
    if (sig2.category) detectedCategory = sig2.category
  }

  let width = 0
  let height = 0
  let fileSize = 0

  try {
    const st = statSync(filePath)
    fileSize = st.size
  } catch {}

  // Read dimensions for images
  if (isImage) {
    try {
      const dims = imageSize(filePath)
      width = dims.width || 0
      height = dims.height || 0
    } catch {}
  }

  // Signal 8: Sticker / WebP Short-Circuit (+40)
  const sig8 = checkStickerShortCircuit(ext, width, height, fileSize)
  if (sig8.matched) {
    matchedSignals.push({ signal: 'Signal 8: Sticker Short-Circuit', points: sig8.points, reason: sig8.reason })
    detectedCategory = 'sticker'
  }

  // Signal 5: Platform Resize Dimensions (+15)
  if (width && height) {
    const sig5 = checkPlatformDimensions(width, height)
    if (sig5.matched) {
      matchedSignals.push({ signal: 'Signal 5: Platform Resize Dimensions', points: sig5.points, reason: sig5.reason })
    }
  }

  // Signal 3: Re-compression Artifacts / Low bytes-per-pixel (+20)
  if (isImage && width > 0 && height > 0 && fileSize > 0) {
    const totalPixels = width * height
    const bytesPerPixel = fileSize / totalPixels
    // Camera JPEGs typically produce 1.5 - 3.0+ bytes/px. Aggressive messenger compression is < 0.25 bytes/px
    if (bytesPerPixel < 0.22 && totalPixels > 200000) {
      matchedSignals.push({
        signal: 'Signal 3: Re-compression Artifacts',
        points: 20,
        reason: `Aggressive messaging compression (${bytesPerPixel.toFixed(3)} bytes/px)`
      })
    }
  }

  // Signal 4 & Signal 9: EXIF Inspection (Complete strip vs Camera presence)
  let hasCameraExif = false
  let hasAnyExif = false

  if (isImage) {
    try {
      const exifData = await exifr.parse(filePath, {
        tiff: true,
        exif: true,
        gps: true,
        iptc: true,
        xmp: false
      })

      if (exifData) {
        hasAnyExif = Object.keys(exifData).length > 0
        const make = exifData.Make ? String(exifData.Make).trim() : ''
        const model = exifData.Model ? String(exifData.Model).trim() : ''
        const lat = exifData.latitude ?? exifData.GPSLatitude

        if (make.length > 0 || model.length > 0 || lat !== undefined) {
          hasCameraExif = true
        }
      }
    } catch {}

    // Signal 4: Complete metadata strip (+25)
    if (!hasAnyExif) {
      matchedSignals.push({
        signal: 'Signal 4: Metadata Strip',
        points: 25,
        reason: 'Entire EXIF/metadata block is stripped (forwarded media signature)'
      })
    }

    // Signal 9: Camera EXIF presence (-50 Penalty)
    if (hasCameraExif) {
      matchedSignals.push({
        signal: 'Signal 9: Camera EXIF Presence',
        points: -50,
        reason: 'Original camera hardware EXIF detected (penalty)'
      })
    }
  }

  // Signal 7: Video-specific compression (if video)
  if (isVideo) {
    const sig7 = await checkVideoCompressionSignature(filePath)
    if (sig7.matched) {
      matchedSignals.push({ signal: 'Signal 7: Video Compression Signature', points: sig7.points, reason: sig7.reason })
    }
  }

  // Instant Overrides:
  // 1. Folder match + Metadata strip together -> Instant Junk
  if (sig2.matched && !hasAnyExif && isImage && !hasCameraExif) {
    return {
      classification: 'junk',
      score: 95,
      matchedSignals,
      suggestedAction: 'move_to_junk_folder',
      category: detectedCategory
    }
  }

  // 2. Sticker short-circuit alone -> Instant Junk
  if (sig8.matched) {
    return {
      classification: 'junk',
      score: 90,
      matchedSignals,
      suggestedAction: 'move_to_junk_folder',
      category: 'sticker'
    }
  }

  // Score aggregation
  let totalScore = matchedSignals.reduce((acc, s) => acc + s.points, 0)
  totalScore = Math.max(0, Math.min(100, totalScore))

  // Step 3 — Classification
  let classification: JunkClassification = 'keep'
  let suggestedAction: JunkDetectionResult['suggestedAction'] = 'none'

  if (totalScore >= 70) {
    classification = 'junk'
    suggestedAction = 'move_to_junk_folder'
  } else if (totalScore >= 40) {
    classification = 'uncertain'
    suggestedAction = 'flag_for_review'
  }

  return {
    classification,
    score: totalScore,
    matchedSignals,
    suggestedAction,
    category: detectedCategory
  }
}

/**
 * Batch classifies a list of file paths.
 */
export async function classifyJunkMediaBatch(
  filePaths: string[]
): Promise<Map<string, JunkDetectionResult>> {
  const results = new Map<string, JunkDetectionResult>()
  const concurrency = 16

  for (let i = 0; i < filePaths.length; i += concurrency) {
    const chunk = filePaths.slice(i, i + concurrency)
    const promises = chunk.map(async (fp) => {
      try {
        const res = await classifyJunkMedia(fp)
        return { fp, res }
      } catch {
        return {
          fp,
          res: {
            classification: 'keep' as JunkClassification,
            score: 0,
            matchedSignals: [],
            suggestedAction: 'none' as const
          }
        }
      }
    })

    const settled = await Promise.all(promises)
    for (const { fp, res } of settled) {
      results.set(fp, res)
    }
  }

  return results
}
