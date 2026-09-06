import sharp from 'sharp'
import { existsSync } from 'fs'
import { BrowserWindow } from 'electron'
import { getPhotos, getUnscannedDocuments, saveDocumentScan, PhotoRow } from './database'
import { detectDocument, classifyExtractedText } from './services/document/documentDetector'

// ─── Configuration ──────────────────────────────────────────────────────
const BATCH_SIZE = 25            // Photos analyzed concurrently in Phase 1 pre-filter
const PREFILTER_IMAGE_SIZE = 160 // Tiny thumbnail for fast edge/geometry analysis (px)

// ─── State ──────────────────────────────────────────────────────────────
let isScanning = false
let shouldStop = false

export interface DocumentScanLiveProgress {
  phase: 'prefilter' | 'ocr' | 'done'
  completed: number
  total: number
  percent: number
  currentFile: string
  status: string
  isComplete: boolean
  isScanning: boolean
  docsFound: number
}

function broadcast(progress: DocumentScanLiveProgress) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
      w.webContents.send('doc-detect:progress', progress)
    }
  })
}

// ─── Phase 1: Fast Image-Feature Pre-filter (Sharp, ~2-5ms/photo) ──────
async function isDocumentCandidate(photo: PhotoRow): Promise<boolean> {
  try {
    // 1. Ignore video files immediately
    if (photo.mime_type && photo.mime_type.startsWith('video')) return false
    const filename = (photo.filename || '').toLowerCase()
    if (filename.endsWith('.mov') || filename.endsWith('.mp4') || filename.endsWith('.m4v') || filename.endsWith('.avi')) {
      return false
    }

    const filePath = photo.thumbnail_path || photo.preview_path || photo.file_path
    if (!filePath || !existsSync(filePath)) return false

    // 2. Explicit document filename keywords or PDFs get instant candidate pass
    const hasExplicitDocName = [
      'aadhaar', 'aadhar', 'pancard', 'pan_card', 'passport', 'voter_id',
      'driving_licence', 'driving_license', 'marksheet', 'certificate',
      'invoice', 'receipt', 'tax_invoice', 'salary_slip', 'payslip',
      'bank_statement', 'passbook', 'electricity_bill', 'water_bill',
      'rc_book', 'vehicle_rc', 'pollution_certificate', 'puc', 'doc', 'scan'
    ].some(kw => filename.includes(kw)) || filename.endsWith('.pdf')

    if (hasExplicitDocName) return true

    // 3. Photos with existing extracted text get instant pass (reclassified in 0ms)
    if (photo.extracted_text && photo.extracted_text.length > 5 && photo.extracted_text !== 'NONE' && photo.extracted_text !== 'ERROR') {
      return true
    }

    // 4. Fast color saturation check (documents are predominantly low chroma paper/cards)
    const img = sharp(filePath, { failOn: 'none' })
    const stats = await img.stats()
    const rM = stats.channels[0].mean, gM = stats.channels[1].mean, bM = stats.channels[2].mean
    const maxCh = Math.max(rM, gM, bM), minCh = Math.min(rM, gM, bM)
    const sat = maxCh === 0 ? 0 : (maxCh - minCh) / maxCh
    if (sat > 0.55) return false // Immediately reject colorful nature, clothing, portraits, outdoors

    // 5. Downsample to tiny thumbnail for text-line & edge density analysis
    const raw = await img
      .resize(PREFILTER_IMAGE_SIZE, PREFILTER_IMAGE_SIZE, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { data, info } = raw
    const { width, height } = info
    const pixels = width * height
    if (pixels === 0) return false

    let whitePixels = 0, darkPixels = 0, totalEdges = 0, hEdges = 0, vEdges = 0
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const val = data[idx]
        if (val > 210) whitePixels++
        if (val < 50) darkPixels++
        const gx = Math.abs(data[idx + 1] - data[idx - 1])
        const gy = Math.abs(data[idx + width] - data[idx - width])
        if (gx + gy > 30) totalEdges++
        if (gy > 20) hEdges++
        if (gx > 20) vEdges++
      }
    }

    const whiteRatio = whitePixels / pixels
    const darkRatio = darkPixels / pixels
    const edgeDensity = totalEdges / pixels
    const hvRatio = vEdges > 0 ? hEdges / vEdges : 1

    const isWhitePaperDoc = whiteRatio > 0.25 && edgeDensity > 0.05 && sat < 0.25
    const isTextDoc = sat < 0.25 && edgeDensity > 0.06 && (hvRatio > 1.10 || whiteRatio > 0.15 || darkRatio > 0.15)
    const isCardDoc = sat < 0.45 && edgeDensity > 0.08 && hvRatio > 1.10
    const isGeneralDoc = sat < 0.35 && edgeDensity > 0.06

    return isWhitePaperDoc || isTextDoc || isCardDoc || isGeneralDoc
  } catch {
    return false
  }
}

// ─── Main Two-Phase High-Speed Scanner ───────────────────────────────────
export async function startFullDocumentScan(allLibrary = false): Promise<{ total: number; candidatesCount: number; docsFound: number }> {
  if (isScanning) return { total: 0, candidatesCount: 0, docsFound: 0 }
  isScanning = true
  shouldStop = false

  try {
    const photosToScan = allLibrary
      ? getPhotos({}).filter(p => !p.mime_type || !p.mime_type.startsWith('video'))
      : getUnscannedDocuments()

    const total = photosToScan.length

    if (total === 0) {
      broadcast({
        phase: 'done',
        completed: 0,
        total: 0,
        percent: 100,
        currentFile: '',
        status: 'No photos to scan.',
        isComplete: true,
        isScanning: false,
        docsFound: 0
      })
      isScanning = false
      return { total: 0, candidatesCount: 0, docsFound: 0 }
    }

    broadcast({
      phase: 'prefilter',
      completed: 0,
      total,
      percent: 0,
      currentFile: photosToScan[0]?.filename || '',
      status: `Phase 1/2: Pre-filtering ${total.toLocaleString()} photos with fast edge analysis...`,
      isComplete: false,
      isScanning: true,
      docsFound: 0
    })

    // ── Phase 1: Pre-filter (Parallel Sharp, ~5ms/photo) ──────────────────
    const candidates: PhotoRow[] = []
    let processed = 0
    let docsFound = 0

    for (let i = 0; i < photosToScan.length; i += BATCH_SIZE) {
      if (shouldStop) break

      const batch = photosToScan.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (photo) => {
          const isCandidate = await isDocumentCandidate(photo)
          return { photo, isCandidate }
        })
      )

      for (const res of results) {
        if (res.status === 'fulfilled') {
          if (res.value.isCandidate) {
            candidates.push(res.value.photo)
          } else {
            // Mark non-candidate immediately
            saveDocumentScan(res.value.photo.id, 'NONE', false, null)
          }
        }
      }

      processed += batch.length
      const percent = Math.min(50, Math.round((processed / total) * 50))
      const lastPhoto = batch[batch.length - 1]

      broadcast({
        phase: 'prefilter',
        completed: processed,
        total,
        percent,
        currentFile: lastPhoto?.filename ? `Scanning ${lastPhoto.filename}...` : 'Analyzing media...',
        status: `Phase 1/2: Pre-filtering... ${processed.toLocaleString()}/${total.toLocaleString()} photos (${candidates.length} candidates)`,
        isComplete: false,
        isScanning: true,
        docsFound: 0
      })
    }

    if (shouldStop) {
      isScanning = false
      return { total, candidatesCount: candidates.length, docsFound }
    }

    // ── Phase 2: Precision 165-Taxonomy AI OCR on Candidates Only ─────────
    const candTotal = candidates.length
    const OCR_CONCURRENCY = 2 // 2 parallel OCR workers for fast throughput without CPU thrashing

    for (let idx = 0; idx < candTotal; idx += OCR_CONCURRENCY) {
      if (shouldStop) break

      const chunk = candidates.slice(idx, idx + OCR_CONCURRENCY)
      const lastCand = chunk[chunk.length - 1]
      const currentCount = Math.min(candTotal, idx + chunk.length)
      const ocrPercent = 50 + Math.min(49, Math.round((currentCount / candTotal) * 49))

      broadcast({
        phase: 'ocr',
        completed: (total - candTotal) + currentCount,
        total,
        percent: ocrPercent,
        currentFile: lastCand?.filename || '',
        status: `Phase 2/2: AI OCR on candidate ${currentCount}/${candTotal} (${total - candTotal} non-docs skipped)...`,
        isComplete: false,
        isScanning: true,
        docsFound
      })

      await Promise.all(
        chunk.map(async (cand) => {
          try {
            let isDoc = false
            let category: string | null = null
            let extractedText = ''

            // Ultra-fast path: If photo already has extracted text from prior scan, reclassify in 0ms!
            if (cand.extracted_text && cand.extracted_text.length > 5 && cand.extracted_text !== 'NONE' && cand.extracted_text !== 'ERROR') {
              const classRes = classifyExtractedText(cand.extracted_text)
              isDoc = classRes.isDocument
              category = classRes.category
              extractedText = cand.extracted_text
            } else {
              // Fresh candidate: Run optimized document detector
              const res = await detectDocument(cand.file_path)
              isDoc = res.classification !== 'not_a_document' && Boolean(res.category)
              category = res.category || null
              extractedText = res.extractedText || ''
            }

            if (isDoc) {
              docsFound++
            }
            saveDocumentScan(
              cand.id,
              extractedText || 'NONE',
              isDoc,
              isDoc ? category : null
            )
          } catch (err) {
            console.error('Candidate OCR error on', cand.filename, err)
            saveDocumentScan(cand.id, 'ERROR', false, null)
          }
        })
      )
    }

    // ── Phase 3: Done ─────────────────────────────────────────────────────
    broadcast({
      phase: 'done',
      completed: total,
      total,
      percent: 100,
      currentFile: 'Complete Scan',
      status: `Complete! Analyzed all ${total.toLocaleString()} photos (${docsFound} verified documents found).`,
      isComplete: true,
      isScanning: false,
      docsFound
    })

    isScanning = false
    return { total, candidatesCount: candidates.length, docsFound }

  } catch (err) {
    console.error('Fast doc scan error:', err)
    isScanning = false
    broadcast({
      phase: 'done',
      completed: 0,
      total: 0,
      percent: 100,
      currentFile: '',
      status: 'Error during scan.',
      isComplete: true,
      isScanning: false,
      docsFound: 0
    })
    return { total: 0, candidatesCount: 0, docsFound: 0 }
  }
}

export function stopFullDocumentScan(): void {
  shouldStop = true
  isScanning = false
}

// ─── Legacy Backward Compatibility Exports ──────────────────────────────
const OCR_IMAGE_SIZE = 1200

export async function getOcrBuffer(photo: PhotoRow): Promise<Buffer | null> {
  try {
    const filePath = photo.thumbnail_path || photo.preview_path || photo.file_path
    if (!filePath || !existsSync(filePath)) return null

    return await sharp(filePath)
      .resize(OCR_IMAGE_SIZE, OCR_IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .extend({
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .sharpen()
      .grayscale()
      .normalize()
      .withMetadata({ density: 300 })
      .png()
      .toBuffer()
  } catch {
    return null
  }
}

export async function startFastDocScan(): Promise<{ candidateIds: number[]; totalPhotos: number }> {
  const res = await startFullDocumentScan(false)
  return { candidateIds: [], totalPhotos: res.total }
}

export const stopFastDocScan = stopFullDocumentScan

