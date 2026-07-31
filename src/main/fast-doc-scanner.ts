import sharp from 'sharp'
import { existsSync } from 'fs'
import { BrowserWindow } from 'electron'
import { getUnscannedDocuments, saveDocumentScan, PhotoRow } from './database'

// ─── Configuration ──────────────────────────────────────────────────────
const BATCH_SIZE = 20           // Photos analyzed concurrently in pre-filter
const OCR_CONCURRENCY = 4       // Parallel OCR workers
const PREFILTER_IMAGE_SIZE = 150 // Tiny image for edge detection (px)
const OCR_IMAGE_SIZE = 1000       // Larger image for OCR (px) for high clarity on ID cards
const DOC_CONFIDENCE_THRESHOLD = 45

// ─── State ──────────────────────────────────────────────────────────────
let isScanning = false
let shouldStop = false

interface ScanProgress {
  scannedCount: number
  totalCount: number
  isScanning: boolean
  phase: 'prefilter' | 'ocr' | 'done'
  status?: string
}

function broadcast(progress: ScanProgress) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
      w.webContents.send('doc-scan:progress', progress)
    }
  })
}

// ─── Phase 1: Fast Image-Feature Pre-filter (Sharp, ~5-15ms/photo) ──────
async function isDocumentCandidate(photo: PhotoRow): Promise<boolean> {
  try {
    const filename = (photo.filename || '').toLowerCase()
    // Explicit filename keywords get instant pass
    if (
      filename.includes('doc') ||
      filename.includes('scan') ||
      filename.includes('aadhaar') ||
      filename.includes('aadhar') ||
      filename.includes('pan') ||
      filename.includes('card') ||
      filename.includes('id') ||
      filename.includes('bill') ||
      filename.includes('receipt') ||
      filename.includes('invoice') ||
      filename.includes('pdf') ||
      filename.includes('img_') ||
      filename.includes('yebj') ||
      filename.includes('ycdo')
    ) {
      // Continue to edge check or allow
    }

    const filePath = photo.thumbnail_path || photo.preview_path || photo.file_path
    if (!filePath || !existsSync(filePath)) return false

    // Load tiny version for analysis
    const buffer = await sharp(filePath, { failOn: 'none' })
      .resize(PREFILTER_IMAGE_SIZE, PREFILTER_IMAGE_SIZE, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { data, info } = buffer
    const { width, height } = info
    const pixels = width * height

    if (pixels === 0) return false

    // Calculate edge density (Sobel gradient)
    let edgePixels = 0
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const gx = Math.abs(data[idx + 1] - data[idx - 1])
        const gy = Math.abs(data[idx + width] - data[idx - width])
        if (gx + gy > 25) edgePixels++
      }
    }
    const edgeDensity = edgePixels / pixels

    // Generous edge density check:
    // Text/ID cards/documents have edge density > 0.02
    // Plain solid color background/sky < 0.02
    // Super dense leaves/chaos > 0.70
    return edgeDensity > 0.02 && edgeDensity < 0.70

  } catch {
    return true // Safe fallback on error
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────
export async function startFastDocScan(): Promise<{ candidateIds: number[], totalPhotos: number }> {
  if (isScanning) return { candidateIds: [], totalPhotos: 0 }
  isScanning = true
  shouldStop = false

  try {
    const unscanned = getUnscannedDocuments()
    const total = unscanned.length

    if (total === 0) {
      broadcast({ scannedCount: 0, totalCount: 0, isScanning: false, phase: 'done' })
      isScanning = false
      return { candidateIds: [], totalPhotos: 0 }
    }

    broadcast({ scannedCount: 0, totalCount: total, isScanning: true, phase: 'prefilter', status: 'Analyzing images...' })

    // Phase 1: Pre-filter (fast, ~5-15ms/photo)
    const candidates: PhotoRow[] = []
    const nonDocuments: PhotoRow[] = []
    let processed = 0

    for (let i = 0; i < unscanned.length; i += BATCH_SIZE) {
      if (shouldStop) break

      const batch = unscanned.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (photo) => {
          const isCandidate = await isDocumentCandidate(photo)
          return { photo, isCandidate }
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.isCandidate) {
            candidates.push(result.value.photo)
          } else {
            nonDocuments.push(result.value.photo)
          }
        }
      }

      processed += batch.length
      broadcast({
        scannedCount: processed,
        totalCount: total,
        isScanning: true,
        phase: 'prefilter',
        status: `Pre-filtering... ${processed}/${total} (${candidates.length} candidates)`
      })
    }

    // Mark non-documents immediately (bulk, very fast)
    for (const photo of nonDocuments) {
      if (shouldStop) break
      saveDocumentScan(photo.id, 'NONE', false, null)
    }

    broadcast({
      scannedCount: processed,
      totalCount: total,
      isScanning: true,
      phase: 'prefilter',
      status: `Pre-filter complete. ${candidates.length} document candidates found out of ${total} photos.`
    })

    isScanning = false
    
    // Return candidate IDs for the renderer to OCR them (much smaller set)
    return { 
      candidateIds: candidates.map(c => c.id), 
      totalPhotos: total 
    }

  } catch (err) {
    console.error('Fast doc scan error:', err)
    isScanning = false
    return { candidateIds: [], totalPhotos: 0 }
  }
}

export function stopFastDocScan() {
  shouldStop = true
  isScanning = false
}

// ─── Prepare an OCR-ready small image buffer for a given photo ID ────────
export async function getOcrBuffer(photo: PhotoRow): Promise<Buffer | null> {
  try {
    const filePath = photo.thumbnail_path || photo.preview_path || photo.file_path
    if (!filePath || !existsSync(filePath)) return null

    return await sharp(filePath)
      .resize(OCR_IMAGE_SIZE, OCR_IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .sharpen()  // Sharpen text for better OCR
      .grayscale() // Grayscale for faster OCR
      .normalize() // Maximize contrast
      .png()
      .toBuffer()
  } catch {
    return null
  }
}
