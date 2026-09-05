import { readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { statSync } from 'fs'
import sharp from 'sharp'
import exifReader from 'exif-reader'
import { PhotoInsert, ExifInsert } from './database'

function convertDMSToDecimal(dms: number[] | undefined, ref: string | undefined): number | undefined {
  if (!dms || !Array.isArray(dms) || dms.length !== 3) return undefined;
  let decimal = dms[0] + (dms[1] / 60) + (dms[2] / 3600);
  if (ref && (ref.toUpperCase() === 'S' || ref.toUpperCase() === 'W')) {
    decimal = -decimal;
  }
  return decimal;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.avif', '.svg', '.heic', '.heif',
  '.dng', '.cr2', '.nef', '.arw', '.raw', '.orf', '.rw2', '.pef', '.raf',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v', '.3gp', '.flv', '.mts', '.m2ts',
  '.pdf', '.txt', '.doc', '.docx'
])

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.dng': 'image/x-adobe-dng',
  '.cr2': 'image/x-canon-cr2',
  '.nef': 'image/x-nikon-nef',
  '.arw': 'image/x-sony-arw',
  '.raw': 'image/x-panasonic-raw',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.wmv': 'video/x-ms-wmv',
  '.m4v': 'video/x-m4v',
  '.3gp': 'video/3gpp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export interface ImportedFile {
  photo: PhotoInsert
  exif?: ExifInsert
}

export async function scanDirectory(dirPath: string): Promise<string[]> {
  const files: string[] = []

  async function walk(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          // Skip hidden dirs and system dirs
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath)
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            files.push(fullPath)
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning ${dir}:`, err)
    }
  }

  await walk(dirPath)
  return files
}

export async function processFile(filePath: string): Promise<ImportedFile> {
  const ext = extname(filePath).toLowerCase()
  const filename = basename(filePath)
  const fileStat = statSync(filePath)
  const mimeType = MIME_TYPES[ext] || 'image/jpeg'

  let width = 0
  let height = 0
  let createdAt = fileStat.birthtime.toISOString()
  let exifData: ExifInsert | undefined
  const isVideoOrDoc = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v', '.3gp', '.flv', '.mts', '.m2ts', '.pdf', '.txt', '.doc', '.docx'].includes(ext)

  if (!isVideoOrDoc) {
    try {
      const metadata = await sharp(filePath).metadata()
      width = metadata.width || 0
      height = metadata.height || 0

    // Try to extract EXIF data
    if (metadata.exif) {
      try {
        const parsed: any = exifReader(metadata.exif)
        const photoObj = parsed.Photo || parsed.exif || parsed.image || {}
        const imageObj = parsed.Image || parsed.image || {}
        const gpsObj = parsed.GPSInfo || parsed.gps || {}

        // Get date from EXIF
        if (photoObj.DateTimeOriginal) {
          const d = photoObj.DateTimeOriginal
          if (d instanceof Date) {
            createdAt = d.toISOString()
          }
        } else if (photoObj.DateTimeDigitized) {
          const d = photoObj.DateTimeDigitized
          if (d instanceof Date) {
            createdAt = d.toISOString()
          }
        }

        const lat = convertDMSToDecimal(gpsObj.GPSLatitude as number[] | undefined, gpsObj.GPSLatitudeRef as string | undefined)
        const lon = convertDMSToDecimal(gpsObj.GPSLongitude as number[] | undefined, gpsObj.GPSLongitudeRef as string | undefined)

        exifData = {
          photo_id: 0, // Will be set after insert
          make: imageObj.Make as string | undefined,
          model: imageObj.Model as string | undefined,
          iso: photoObj.ISO as number | undefined,
          f_number: photoObj.FNumber as number | undefined,
          exposure_time: photoObj.ExposureTime
            ? `1/${Math.round(1 / (photoObj.ExposureTime as number))}`
            : undefined,
          focal_length: photoObj.FocalLength as number | undefined,
          gps_lat: lat,
          gps_lon: lon,
          date_taken: createdAt,
          lens_model: photoObj.LensModel as string | undefined
        }
      } catch (e) {
        console.warn('EXIF parsing error for', filePath, e)
      }
    }
  } catch {
    // If sharp can't read it, we still import with basic info
  }
}

  const photo: PhotoInsert = {
    file_path: filePath,
    filename,
    mime_type: mimeType,
    width,
    height,
    file_size: fileStat.size,
    created_at: createdAt
  }

  return { photo, exif: exifData }
}

export async function processFiles(
  filePaths: string[],
  onProgress?: (completed: number, total: number, currentFile: string) => void
): Promise<ImportedFile[]> {
  const total = filePaths.length
  const results: ImportedFile[] = new Array(total)
  const CONCURRENCY = 16
  let completed = 0

  for (let i = 0; i < total; i += CONCURRENCY) {
    const chunk = filePaths.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async (filePath, idx) => {
        const fileIndex = i + idx
        try {
          results[fileIndex] = await processFile(filePath)
        } catch (err) {
          console.error(`Error processing ${filePath}:`, err)
        }
        completed++
        onProgress?.(completed, total, filePath)
      })
    )
  }

  return results.filter(Boolean)
}
