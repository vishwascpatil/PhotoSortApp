import { app } from 'electron'
import { join, extname } from 'path'
import { existsSync, mkdirSync, statSync } from 'fs'
import { createHash } from 'crypto'
import sharp from 'sharp'
import { heicPool } from './heic-pool'

const BROWSER_NATIVE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.svg'
])

const VIDEO_EXTS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v', '.3gp', '.flv'
])

let highResDir = ''

export function ensureHighResDir(): void {
  highResDir = join(app.getPath('userData'), 'highres_previews')
  if (!existsSync(highResDir)) {
    try {
      mkdirSync(highResDir, { recursive: true })
    } catch {}
  }
}

function getHashName(filePath: string): string {
  return createHash('md5').update(filePath).digest('hex')
}

export function isVideoFile(filePath: string): boolean {
  if (!filePath) return false
  const ext = extname(filePath).toLowerCase()
  return VIDEO_EXTS.has(ext)
}

export function isBrowserNativeImage(filePath: string): boolean {
  if (!filePath) return true
  const ext = extname(filePath).toLowerCase()
  return BROWSER_NATIVE_EXTS.has(ext)
}

/**
 * On-demand High-Res image converter.
 * For browser-native images (.jpg, .png, .webp) and videos, returns the original filePath directly (0ms).
 * For non-browser images (.dng, .heic, .raw, .cr2, .nef, .arw, .tiff), converts to a crisp 4K/full-res JPEG in highres_previews/ and caches it.
 */
export async function getOrGenerateHighResPreview(filePath: string): Promise<string> {
  if (!filePath || !existsSync(filePath)) return ''

  if (isVideoFile(filePath) || isBrowserNativeImage(filePath)) {
    return filePath
  }

  ensureHighResDir()
  const hash = getHashName(filePath)
  const targetPath = join(highResDir, `${hash}.jpg`)

  if (existsSync(targetPath)) {
    try {
      const stats = statSync(targetPath)
      if (stats.size > 1024) {
        return targetPath
      }
    } catch {}
  }

  const ext = extname(filePath).toLowerCase()
  const isHeic = ext === '.heic' || ext === '.heif'

  if (isHeic) {
    try {
      const res = await heicPool.convert(0, filePath, targetPath, 3840, 0.88)
      if (res.success && existsSync(targetPath)) {
        return targetPath
      }
    } catch {}
  }

  // Handle DNG, Camera RAW (CR2, NEF, ARW, RAF, etc.) and TIFF via native Sharp
  try {
    await sharp(filePath, { failOn: 'none' })
      .rotate()
      .resize({
        width: 3840,
        height: 3840,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 90, mozjpeg: false })
      .toFile(targetPath)

    if (existsSync(targetPath)) {
      return targetPath
    }
  } catch (err) {
    console.error(`[HighRes] Failed to convert high-res preview for ${filePath}:`, err)
  }

  return ''
}

// Background prefetch queue for adjacent photos in the filmstrip
const prefetchQueue = new Set<string>()
let isProcessingPrefetch = false

export function prefetchHighResPreviews(filePaths: string[]): void {
  for (const fp of filePaths) {
    if (fp && !isBrowserNativeImage(fp) && !isVideoFile(fp) && !prefetchQueue.has(fp)) {
      prefetchQueue.add(fp)
    }
  }

  if (!isProcessingPrefetch) {
    processPrefetchQueue()
  }
}

async function processPrefetchQueue(): Promise<void> {
  if (isProcessingPrefetch || prefetchQueue.size === 0) return
  isProcessingPrefetch = true

  try {
    while (prefetchQueue.size > 0) {
      const nextPath = prefetchQueue.values().next().value
      if (!nextPath) break
      prefetchQueue.delete(nextPath)
      await getOrGenerateHighResPreview(nextPath).catch(() => {})
    }
  } finally {
    isProcessingPrefetch = false
  }
}
