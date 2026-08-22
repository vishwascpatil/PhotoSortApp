import sharp from 'sharp'
import { existsSync } from 'fs'
import { basename } from 'path'
import { createRequire } from 'module'
import Tesseract from 'tesseract.js'

const require = createRequire(import.meta.url)
const ocrRules: Array<{ id: number; name: string; category: string; keywords: string[]; regex: string | null }> = require('./ocr_rules.json')

// ─── Interfaces & Types ───────────────────────────────────────────────────

export interface QualityFlags {
  blurry: boolean
  lowResolution: boolean
  glareDetected: boolean
  perspectiveCorrected: boolean
}

export interface MatchedSignal {
  signal: string
  points: number
  reason: string
}

export interface DocumentDetectionResult {
  classification: string // matches existing 150+ type taxonomy, or "unknown" / "not_a_document"
  category?: string | null // e.g. "Government & Identity", "Business & Commerce", etc.
  confidence: number // 0-100
  ocrQualityScore: number // mean OCR word-confidence, 0-100
  matchedSignals: MatchedSignal[]
  qualityFlags: QualityFlags
  extractedText?: string
}

export interface Point {
  x: number
  y: number
}

// ─── Configurable Constants & Thresholds ──────────────────────────────────

/**
 * Blur detection threshold based on Laplacian variance.
 * Variance below this threshold indicates significant motion/focus blur.
 */
export const BLUR_THRESHOLD = 120

/**
 * General document classification confidence threshold.
 * NOTE: This constant should be tuned empirically against a labeled test set
 * (real documents vs. real non-documents) to calibrate precision and recall.
 */
export const DOCUMENT_SCORE_THRESHOLD = 45

/**
 * Known standard document aspect ratios (width/height in landscape, or height/width in portrait)
 */
export const DOCUMENT_ASPECT_RATIOS = {
  ID_CARD: 1.586, // ISO/IEC 7810 ID-1 (Aadhaar, PAN, Driving License: 85.60 × 53.98 mm)
  A4_DOCUMENT: 1.414, // ISO 216 A4 (297 × 210 mm)
  PASSPORT_PAGE: 1.42 // Standard ICAO Doc 9303 Passport booklet page
}

const FAST_PASS_KEYWORDS = [
  'doc', 'scan', 'aadhaar', 'aadhar', 'adhar', 'adhaar',
  'pan', 'card', 'id', 'bill', 'receipt', 'invoice',
  'pdf', 'yebj', 'ycdo', 'statement', 'license', 'licence', 'certificate'
]

// ─── Levenshtein Distance & Fuzzy Match Helper ───────────────────────────

export function levenshteinDistance(a: string, b: string): number {
  const an = a.length
  const bn = b.length
  if (an === 0) return bn
  if (bn === 0) return an

  const matrix: number[][] = []
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[bn][an]
}

export function fuzzyIncludes(text: string, keyword: string, maxDistance = 2): boolean {
  const kwLower = keyword.toLowerCase()
  const textLower = text.toLowerCase()

  if (textLower.includes(kwLower)) return true

  // Word-by-word fuzzy match for short & medium terms
  const words = textLower.split(/[\s,.:;!?'"()\[\]{}\/\-_]+/).filter(w => w.length > 0)
  for (const word of words) {
    if (Math.abs(word.length - kwLower.length) <= maxDistance) {
      if (levenshteinDistance(word, kwLower) <= maxDistance) {
        return true
      }
    }
  }

  // Sliding window check for multi-word phrases (e.g. "unique identification", "income tax")
  if (kwLower.includes(' ')) {
    const phraseWords = kwLower.split(' ')
    for (let i = 0; i <= words.length - phraseWords.length; i++) {
      const windowStr = words.slice(i, i + phraseWords.length).join(' ')
      if (levenshteinDistance(windowStr, kwLower) <= maxDistance + 1) {
        return true
      }
    }
  }

  return false
}

// ─── Phase 1: Pre-Filter, Geometry & Quadrilateral Detection ─────────────

/**
 * Orders 4 corner points in clockwise order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
 */
export function orderQuadCorners(points: Point[]): [Point, Point, Point, Point] {
  if (points.length !== 4) throw new Error('Expected exactly 4 points')

  // Sum of coordinates (TL has minimum sum, BR has maximum sum)
  const sumSorted = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const tl = sumSorted[0]
  const br = sumSorted[3]

  // Difference of coordinates (TR has minimum diff (y - x), BL has maximum diff (y - x))
  const remaining = [sumSorted[1], sumSorted[2]]
  const diffSorted = remaining.sort((a, b) => (a.y - a.x) - (b.y - b.x))
  const tr = diffSorted[0]
  const bl = diffSorted[1]

  return [tl, tr, br, bl]
}

/**
 * Calculates Euclidean polygon area using Shoelace formula
 */
function calculatePolygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

/**
 * Ray-casting algorithm to test whether a 2D point is inside a convex or arbitrary quadrilateral polygon
 */
export function isPointInsidePolygon(pt: Point, poly: [Point, Point, Point, Point]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export interface DetectedFace {
  box: { x: number; y: number; width: number; height: number }
  areaRatio: number
  center: Point
}

/**
 * Fast skin-tone and facial proportion region detector
 */
export async function detectFacesInFrame(
  rgbBuffer: Buffer,
  width: number,
  height: number
): Promise<DetectedFace[]> {
  try {
    const totalArea = width * height
    if (totalArea === 0) return []

    // Skin detection in standard normalized RGB space
    const skinMask = new Uint8Array(width * height)
    let skinPixelCount = 0

    for (let i = 0; i < width * height; i++) {
      const r = rgbBuffer[i * 3]
      const g = rgbBuffer[i * 3 + 1]
      const b = rgbBuffer[i * 3 + 2]

      const isSkin =
        r > 95 && g > 40 && b > 20 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
        Math.abs(r - g) > 15 &&
        r > g && r > b

      if (isSkin) {
        skinMask[i] = 1
        skinPixelCount++
      }
    }

    if (skinPixelCount < totalArea * 0.04) return []

    let minX = width, maxX = 0, minY = height, maxY = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (skinMask[y * width + x] === 1) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    const faceW = Math.max(0, maxX - minX)
    const faceH = Math.max(0, maxY - minY)
    const faceArea = faceW * faceH
    const areaRatio = totalArea > 0 ? faceArea / totalArea : 0

    if (areaRatio > 0.05) {
      return [{
        box: { x: minX, y: minY, width: faceW, height: faceH },
        areaRatio,
        center: { x: minX + faceW / 2, y: minY + faceH / 2 }
      }]
    }

    return []
  } catch {
    return []
  }
}

/**
 * Detects whether an image contains a document quadrilateral and computes its aspect ratio
 */
export async function detectQuadrilateral(
  rawBuffer: Buffer,
  width: number,
  height: number
): Promise<{ hasQuad: boolean; corners: [Point, Point, Point, Point] | null; aspectRatio: number; areaRatio: number }> {
  try {
    const totalArea = width * height
    // 1. Sobel Gradient Magnitude to get edge response
    const edgeMap = new Uint8Array(width * height)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const gx = Math.abs(rawBuffer[idx + 1] - rawBuffer[idx - 1])
        const gy = Math.abs(rawBuffer[idx + width] - rawBuffer[idx - width])
        const grad = gx + gy
        edgeMap[idx] = grad > 35 ? 255 : 0
      }
    }

    // 2. Scan for outer bounding quadrilaterals by finding horizontal & vertical edge bands
    const minX = Math.floor(width * 0.03)
    const maxX = Math.floor(width * 0.97)
    const minY = Math.floor(height * 0.03)
    const maxY = Math.floor(height * 0.97)

    // Find extreme corners of high edge concentration
    const candidateCorners: Point[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ]

    // Refine corners inward toward document boundaries
    for (let y = minY; y < height / 2; y += 4) {
      let rowEdges = 0
      for (let x = minX; x < maxX; x += 4) {
        if (edgeMap[y * width + x] > 0) rowEdges++
      }
      if (rowEdges > (maxX - minX) / 16) {
        candidateCorners[0].y = y
        candidateCorners[1].y = y
        break
      }
    }

    for (let y = maxY; y > height / 2; y -= 4) {
      let rowEdges = 0
      for (let x = minX; x < maxX; x += 4) {
        if (edgeMap[y * width + x] > 0) rowEdges++
      }
      if (rowEdges > (maxX - minX) / 16) {
        candidateCorners[2].y = y
        candidateCorners[3].y = y
        break
      }
    }

    const corners = orderQuadCorners(candidateCorners)
    const [tl, tr, br, bl] = corners

    const quadArea = calculatePolygonArea(corners)
    const areaRatio = quadArea / totalArea

    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y)
    const botW = Math.hypot(br.x - bl.x, br.y - bl.y)
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y)
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y)

    const avgW = (topW + botW) / 2
    const avgH = (leftH + rightH) / 2
    const aspectRatio = avgH > 0 ? (avgW >= avgH ? avgW / avgH : avgH / avgW) : 1

    // Document aspect ratio matching (ID card ~1.58, A4/Passport ~1.41-1.42)
    const matchesIdCard = aspectRatio >= 1.35 && aspectRatio <= 1.85
    const matchesA4OrPassport = aspectRatio >= 1.20 && aspectRatio <= 1.65

    const isValidDocQuad = areaRatio >= 0.25 && (matchesIdCard || matchesA4OrPassport)

    return {
      hasQuad: isValidDocQuad,
      corners: isValidDocQuad ? corners : null,
      aspectRatio,
      areaRatio
    }
  } catch {
    return { hasQuad: false, corners: null, aspectRatio: 1, areaRatio: 0 }
  }
}

/**
 * Applies projective perspective transform to rectify a detected document quad into a front-on rectangle
 */
export async function applyPerspectiveTransform(
  imageBuffer: Buffer,
  corners: [Point, Point, Point, Point],
  srcWidth: number,
  srcHeight: number
): Promise<Buffer> {
  try {
    const [tl, tr, br, bl] = corners
    const targetWidth = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)))
    const targetHeight = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)))

    if (targetWidth <= 20 || targetHeight <= 20) return imageBuffer

    // Crop bounding region around the detected quad with a small safe margin
    const minX = Math.max(0, Math.floor(Math.min(tl.x, bl.x) * 0.95))
    const minY = Math.max(0, Math.floor(Math.min(tl.y, tr.y) * 0.95))
    const maxX = Math.min(srcWidth, Math.ceil(Math.max(tr.x, br.x) * 1.05))
    const maxY = Math.min(srcHeight, Math.ceil(Math.max(bl.y, br.y) * 1.05))

    const cropW = Math.max(10, maxX - minX)
    const cropH = Math.max(10, maxY - minY)

    return await sharp(imageBuffer)
      .extract({ left: minX, top: minY, width: cropW, height: cropH })
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .toBuffer()
  } catch {
    return imageBuffer
  }
}

// ─── Phase 2: Image Quality Gate ──────────────────────────────────────────

/**
 * Calculates Laplacian variance of grayscale pixels to measure image sharpness/blur
 */
export function calculateLaplacianVariance(data: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0

  let sum = 0
  let sumSq = 0
  const n = (width - 2) * (height - 2)
  if (n <= 0) return 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      // 3x3 discrete Laplacian operator
      const lap =
        data[idx - width] +
        data[idx - 1] - 4 * data[idx] +
        data[idx + 1] +
        data[idx + width]

      sum += lap
      sumSq += lap * lap
    }
  }

  const mean = sum / n
  const variance = (sumSq / n) - (mean * mean)
  return Math.max(0, variance)
}

/**
 * Analyzes image for localized glare / overexposure hotspots
 */
export function checkGlareDetection(data: Uint8Array, width: number, height: number): boolean {
  if (width < 8 || height < 8) return false

  const gridCols = 4
  const gridRows = 4
  const cellW = Math.floor(width / gridCols)
  const cellH = Math.floor(height / gridRows)

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      let glareCount = 0
      let totalCellPixels = 0

      for (let y = row * cellH; y < (row + 1) * cellH; y++) {
        for (let x = col * cellW; x < (col + 1) * cellW; x++) {
          const val = data[y * width + x]
          if (val >= 240) glareCount++
          totalCellPixels++
        }
      }

      // If more than 15% of pixels in this spatial region are blown out white (>240)
      if (totalCellPixels > 0 && (glareCount / totalCellPixels) > 0.15) {
        return true
      }
    }
  }

  return false
}

// ─── Phase 3: OCR Dual PSM Comparison Pool ────────────────────────────────

let ocrWorkerPool: Tesseract.Worker[] = []
let isInitializingPool = false

async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (ocrWorkerPool.length > 0) {
    return ocrWorkerPool.pop()!
  }

  const worker = await Tesseract.createWorker('eng', 1, {
    errorHandler: () => {}
  })
  return worker
}

function releaseOcrWorker(worker: Tesseract.Worker) {
  if (ocrWorkerPool.length < 4) {
    ocrWorkerPool.push(worker)
  } else {
    try { worker.terminate() } catch {}
  }
}

interface OcrRunResult {
  text: string
  confidence: number
  words: { text: string; confidence: number }[]
}

async function runOcrWithPsm(
  worker: Tesseract.Worker,
  imageBuffer: Buffer,
  psmMode: Tesseract.PSM
): Promise<OcrRunResult> {
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psmMode
    })

    const res = await worker.recognize(imageBuffer)
    const data = res.data

    const words: { text: string; confidence: number }[] = []
    if (data.words && Array.isArray(data.words)) {
      for (const w of data.words) {
        const txt = (w.text || '').trim()
        if (txt.length > 0) {
          words.push({ text: txt, confidence: w.confidence || 0 })
        }
      }
    }

    const meanWordConf = words.length > 0
      ? words.reduce((acc, w) => acc + w.confidence, 0) / words.length
      : (data.confidence || 0)

    return {
      text: data.text || '',
      confidence: Math.round(meanWordConf),
      words
    }
  } catch {
    return { text: '', confidence: 0, words: [] }
  }
}

// ─── Phase 4: Classification & Normalization Logic ────────────────────────

/**
 * Normalizes common OCR character-digit confusions for 12-digit Aadhaar / ID number recognition
 */
export function normalizeOcrDigitSubstitutions(text: string): string {
  return text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/[Zz]/g, '2')
}

/**
 * Checks for high-priority identity signatures (Aadhaar, PAN, Passport, Voter ID, Driving License)
 */
export function checkIdentitySignatures(
  rawText: string,
  ocrQualityScore: number
): { matched: boolean; classification: string; category: string; confidence: number; matchedSignals: MatchedSignal[] } {
  const lowerText = rawText.toLowerCase()
  const normalizedText = normalizeOcrDigitSubstitutions(rawText)
  const signals: MatchedSignal[] = []

  // 1. Aadhaar Card Signature Check
  const aadhaarKeywords = ['aadhaar', 'aadhar', 'uidai', 'unique identification', 'mera aadhaar', 'government of india', 'govt of india', 'enrolment']
  const matchedAadhaarKw = aadhaarKeywords.filter(kw => fuzzyIncludes(lowerText, kw, 2))
  const aadhaarRegex = /\b\d{4}\s?\d{4}\s?\d{4}\b/
  const hasAadhaarNumber = aadhaarRegex.test(rawText) || aadhaarRegex.test(normalizedText)

  if (hasAadhaarNumber || matchedAadhaarKw.length >= 2 || (matchedAadhaarKw.length >= 1 && (lowerText.includes('dob') || lowerText.includes('male') || lowerText.includes('female')))) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Identity Signature: Aadhaar Card',
      points: isHighQuality ? 100 : 85,
      reason: `Aadhaar pattern detected (Keywords: ${matchedAadhaarKw.join(', ') || 'UID Pattern'}, OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Aadhaar Card',
      category: 'Government & Identity',
      confidence: isHighQuality ? 100 : 85,
      matchedSignals: signals
    }
  }

  // 2. PAN Card Signature Check
  const panRegex = /\b[A-Z]{5}\d{4}[A-Z]\b/
  const hasPanNumber = panRegex.test(rawText)
  const hasPanKeywords = fuzzyIncludes(lowerText, 'income tax', 2) ||
                         fuzzyIncludes(lowerText, 'permanent account', 2) ||
                         (lowerText.includes('income') && lowerText.includes('tax'))

  if (hasPanNumber || (hasPanKeywords && (lowerText.includes('father') || lowerText.includes('dob')))) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Identity Signature: PAN Card',
      points: isHighQuality ? 100 : 85,
      reason: `PAN Card pattern detected (${hasPanNumber ? 'PAN Regex Match' : 'Income Tax Dept Keyword'}, OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'PAN Card',
      category: 'Government & Identity',
      confidence: isHighQuality ? 100 : 85,
      matchedSignals: signals
    }
  }

  // 3. Passport Signature Check
  if (fuzzyIncludes(lowerText, 'republic of india', 2) || (fuzzyIncludes(lowerText, 'passport', 1) && (lowerText.includes('type p') || lowerText.includes('given name')))) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Identity Signature: Passport',
      points: isHighQuality ? 100 : 85,
      reason: `Passport identity signature detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Passport',
      category: 'Government & Identity',
      confidence: isHighQuality ? 100 : 85,
      matchedSignals: signals
    }
  }

  // 4. Voter ID / EPIC Signature Check
  if (fuzzyIncludes(lowerText, 'election commission', 2) || fuzzyIncludes(lowerText, 'elector', 1) || (fuzzyIncludes(lowerText, 'voter id', 2) && lowerText.includes('india'))) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Identity Signature: Voter ID',
      points: isHighQuality ? 100 : 85,
      reason: `Voter ID / Election Commission pattern detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Voter ID Card',
      category: 'Government & Identity',
      confidence: isHighQuality ? 100 : 85,
      matchedSignals: signals
    }
  }

  // 5. Driving License Signature Check
  if (fuzzyIncludes(lowerText, 'driving licence', 2) || fuzzyIncludes(lowerText, 'driving license', 2) || (lowerText.includes('dl no') && lowerText.includes('valid'))) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Identity Signature: Driving License',
      points: isHighQuality ? 100 : 85,
      reason: `Driving License pattern detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Driving License',
      category: 'Government & Identity',
      confidence: isHighQuality ? 100 : 85,
      matchedSignals: signals
    }
  }

  return { matched: false, classification: '', category: '', confidence: 0, matchedSignals: [] }
}

// ─── Main Document Detection Function ─────────────────────────────────────

/**
 * Comprehensive 4-Phase Document Detection Engine.
 *
 * Replaces the legacy edge-density-only pipeline with geometry quadrilateral detection,
 * perspective correction, Laplacian blur & glare quality gates, dual-PSM OCR,
 * Levenshtein fuzzy keyword matching, and normalized 150+ taxonomy classification.
 */
export async function detectDocument(filePath: string): Promise<DocumentDetectionResult> {
  const qualityFlags: QualityFlags = {
    blurry: false,
    lowResolution: false,
    glareDetected: false,
    perspectiveCorrected: false
  }
  const matchedSignals: MatchedSignal[] = []

  // Check file existence
  if (!filePath || !existsSync(filePath)) {
    return {
      classification: 'not_a_document',
      category: null,
      confidence: 0,
      ocrQualityScore: 0,
      matchedSignals: [{ signal: 'Error', points: 0, reason: 'File does not exist on disk' }],
      qualityFlags
    }
  }

  const filename = basename(filePath)
  const lowerFilename = filename.toLowerCase()

  // 1a. Filename fast-pass check
  const hasFilenameKeyword = FAST_PASS_KEYWORDS.some(kw => lowerFilename.includes(kw))
  if (hasFilenameKeyword) {
    matchedSignals.push({
      signal: 'Filename Fast-Pass',
      points: 20,
      reason: `Filename contains document keyword: "${filename}"`
    })
  }

  try {
    // Read source image metadata & raw grayscale buffer for pre-filter
    const sharpInstance = sharp(filePath, { failOn: 'none' })
    const metadata = await sharpInstance.metadata()

    const srcWidth = metadata.width || 0
    const srcHeight = metadata.height || 0

    if (srcWidth === 0 || srcHeight === 0) {
      return {
        classification: 'not_a_document',
        category: null,
        confidence: 0,
        ocrQualityScore: 0,
        matchedSignals: [{ signal: 'Error', points: 0, reason: 'Unreadable image dimensions' }],
        qualityFlags
      }
    }

    // 1b. Geometry Pre-Filter (Quad Detection + Tightened Edge Density)
    const prefilterDim = 400
    const prefilterBuffer = await sharp(filePath, { failOn: 'none' })
      .resize(prefilterDim, prefilterDim, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const quadRes = await detectQuadrilateral(
      prefilterBuffer.data,
      prefilterBuffer.info.width,
      prefilterBuffer.info.height
    )

    // Sobel edge density check
    let edgePixelCount = 0
    const totalPrefilterPixels = prefilterBuffer.info.width * prefilterBuffer.info.height
    for (let y = 1; y < prefilterBuffer.info.height - 1; y++) {
      for (let x = 1; x < prefilterBuffer.info.width - 1; x++) {
        const idx = y * prefilterBuffer.info.width + x
        const gx = Math.abs(prefilterBuffer.data[idx + 1] - prefilterBuffer.data[idx - 1])
        const gy = Math.abs(prefilterBuffer.data[idx + prefilterBuffer.info.width] - prefilterBuffer.data[idx - prefilterBuffer.info.width])
        if (gx + gy > 30) edgePixelCount++
      }
    }
    const edgeDensity = totalPrefilterPixels > 0 ? edgePixelCount / totalPrefilterPixels : 0

    let isCandidate = false

    if (quadRes.hasQuad && quadRes.corners) {
      isCandidate = true
      matchedSignals.push({
        signal: 'Quadrilateral Geometry Match',
        points: 30,
        reason: `Detected document rectangle (Area: ${Math.round(quadRes.areaRatio * 100)}%, Ratio: ${quadRes.aspectRatio.toFixed(2)})`
      })
    } else if (edgeDensity >= 0.15 && edgeDensity <= 0.55) {
      isCandidate = true
      matchedSignals.push({
        signal: 'Tightened Edge Density Match',
        points: 15,
        reason: `Edge density in candidate band (${(edgeDensity * 100).toFixed(1)}%)`
      })
    } else if (hasFilenameKeyword) {
      isCandidate = true
    }

    // Early rejection for non-candidates
    if (!isCandidate) {
      return {
        classification: 'not_a_document',
        category: null,
        confidence: 0,
        ocrQualityScore: 0,
        matchedSignals,
        qualityFlags
      }
    }

    // 1c. Perspective Correction
    let processedBuffer = await sharpInstance.toBuffer()

    if (quadRes.hasQuad && quadRes.corners) {
      // Map normalized corners back to source dimensions
      const scaleX = srcWidth / prefilterBuffer.info.width
      const scaleY = srcHeight / prefilterBuffer.info.height
      const scaledCorners: [Point, Point, Point, Point] = [
        { x: quadRes.corners[0].x * scaleX, y: quadRes.corners[0].y * scaleY },
        { x: quadRes.corners[1].x * scaleX, y: quadRes.corners[1].y * scaleY },
        { x: quadRes.corners[2].x * scaleX, y: quadRes.corners[2].y * scaleY },
        { x: quadRes.corners[3].x * scaleX, y: quadRes.corners[3].y * scaleY }
      ]

      processedBuffer = await applyPerspectiveTransform(processedBuffer, scaledCorners, srcWidth, srcHeight)
      qualityFlags.perspectiveCorrected = true
      matchedSignals.push({
        signal: 'Perspective Correction',
        points: 10,
        reason: 'Applied perspective rectification to flatten document plane'
      })
    }

    // ─── Phase 2: Quality Gate (Blur, Glare, Targeted Upscaling) ──────────

    // 2a. Blur detection (Laplacian Variance)
    const blurVariance = calculateLaplacianVariance(prefilterBuffer.data, prefilterBuffer.info.width, prefilterBuffer.info.height)
    if (blurVariance < BLUR_THRESHOLD) {
      qualityFlags.blurry = true
      matchedSignals.push({
        signal: 'Quality Gate: Low Sharpness / Blur',
        points: -10,
        reason: `Laplacian variance (${Math.round(blurVariance)}) below sharpness threshold (${BLUR_THRESHOLD})`
      })
    }

    // 2b. Glare / Overexposure check
    const hasGlare = checkGlareDetection(prefilterBuffer.data, prefilterBuffer.info.width, prefilterBuffer.info.height)
    if (hasGlare) {
      qualityFlags.glareDetected = true
      matchedSignals.push({
        signal: 'Quality Gate: Glare / Overexposure',
        points: -10,
        reason: 'Localized high-luminance glare detected on document surface'
      })
    }

    // 2c. Targeted Upscale + Sharpen for compressed / low-res sources (WhatsApp images)
    const longEdge = Math.max(srcWidth, srcHeight)
    let ocrInput = sharp(processedBuffer)

    if (longEdge < 1200) {
      qualityFlags.lowResolution = true
      ocrInput = ocrInput
        .resize(Math.round(srcWidth * 2), Math.round(srcHeight * 2), {
          kernel: sharp.kernel.lanczos3
        })
        .sharpen({ sigma: 1.5, m1: 0.8, m2: 2.0 })
      matchedSignals.push({
        signal: 'Quality Enhancement: 2x Lanczos3 Upscale',
        points: 10,
        reason: `Low resolution source (${longEdge}px) upscaled and sharpened for OCR clarity`
      })
    } else {
      ocrInput = ocrInput.resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
    }

    // Optimize contrast & binarization for OCR
    const ocrReadyBuffer = await ocrInput
      .grayscale()
      .normalize()
      .png()
      .toBuffer()

    // ─── Phase 3: Dual PSM OCR Comparison ─────────────────────────────────

    const worker = await getOcrWorker()
    let winningOcr: OcrRunResult

    try {
      const [resPsm6, resPsm11] = await Promise.all([
        runOcrWithPsm(worker, ocrReadyBuffer, Tesseract.PSM.SINGLE_BLOCK),
        runOcrWithPsm(worker, ocrReadyBuffer, Tesseract.PSM.SPARSE_TEXT)
      ])

      // Pick result with higher mean word confidence
      winningOcr = resPsm6.confidence >= resPsm11.confidence ? resPsm6 : resPsm11
    } finally {
      releaseOcrWorker(worker)
    }

    const ocrQualityScore = winningOcr.confidence
    const extractedText = winningOcr.text.trim()

    // ─── Phase 4: Classification & Scoring ────────────────────────────────

    // 4a, 4b, 4c. Check High-Priority Identity Signatures
    const identityMatch = checkIdentitySignatures(extractedText, ocrQualityScore)
    if (identityMatch.matched) {
      return {
        classification: identityMatch.classification,
        category: identityMatch.category,
        confidence: identityMatch.confidence,
        ocrQualityScore,
        matchedSignals: [...matchedSignals, ...identityMatch.matchedSignals],
        qualityFlags,
        extractedText
      }
    }

    // 4d. General Document Scoring
    const lowerText = extractedText.toLowerCase()
    const words = extractedText.split(/\s+/).filter(w => w.length > 0)

    let totalScore = 0

    // Text Density Score (0 - 20)
    if (words.length >= 50) {
      totalScore += 20
      matchedSignals.push({ signal: 'High Text Density', points: 20, reason: `Found ${words.length} recognized words` })
    } else if (words.length >= 20) {
      totalScore += 15
      matchedSignals.push({ signal: 'Moderate Text Density', points: 15, reason: `Found ${words.length} recognized words` })
    } else if (words.length >= 6) {
      totalScore += 10
      matchedSignals.push({ signal: 'Sparse Text Density', points: 10, reason: `Found ${words.length} recognized words` })
    }

    // Layout Structure Score (0 - 20)
    const kvMatches = extractedText.match(/[A-Za-z]+:/g)
    if (kvMatches && kvMatches.length >= 2) {
      totalScore += 15
      matchedSignals.push({ signal: 'Structured Key-Value Layout', points: 15, reason: `Found ${kvMatches.length} field key-value pairs` })
    }

    // Regex Pattern Score (0 - 30)
    if (/\b\d{2}[/.-]\d{2}[/.-]\d{4}\b/.test(extractedText)) {
      totalScore += 10
      matchedSignals.push({ signal: 'Date Pattern', points: 10, reason: 'Detected standard date format (DD/MM/YYYY)' })
    }
    if (/[$₹€£]\s?\d+/.test(extractedText) || /\b(total|amount|subtotal|balance)\s*:?\s*\d+/i.test(extractedText)) {
      totalScore += 10
      matchedSignals.push({ signal: 'Financial Currency / Amount Pattern', points: 10, reason: 'Detected monetary currency symbol or total amount' })
    }
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(extractedText)) {
      totalScore += 10
      matchedSignals.push({ signal: 'Official Email Pattern', points: 10, reason: 'Detected organization email address' })
    }

    // 4e. Junk Penalties
    const junkKeywords = ['http://', 'https://', 'www.', 'subscribe', 'like and share', 'follow us']
    for (const junk of junkKeywords) {
      if (lowerText.includes(junk)) {
        totalScore -= 30
        matchedSignals.push({ signal: 'Social Media / Web Junk Penalty', points: -30, reason: `Contains social tag: "${junk}"` })
        break
      }
    }

    // Face-area penalty scoping fix:
    // Only penalize large faces if they are outside the document quad (avoids false-penalizing ID card portrait photos)
    try {
      const rgbSample = await sharp(filePath, { failOn: 'none' })
        .resize(200, 200, { fit: 'inside' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const detectedFaces = await detectFacesInFrame(
        rgbSample.data,
        rgbSample.info.width,
        rgbSample.info.height
      )

      for (const face of detectedFaces) {
        if (quadRes.hasQuad && quadRes.corners) {
          // Scale face coordinates to prefilter space to check against quad corners
          const scaleX = prefilterBuffer.info.width / rgbSample.info.width
          const scaleY = prefilterBuffer.info.height / rgbSample.info.height
          const faceCenterPrefilter: Point = {
            x: face.center.x * scaleX,
            y: face.center.y * scaleY
          }

          const isInsideQuad = isPointInsidePolygon(faceCenterPrefilter, quadRes.corners)

          if (isInsideQuad) {
            matchedSignals.push({
              signal: 'Face Inside Document Region',
              points: 0,
              reason: 'face detected but inside document region — not penalized'
            })
          } else if (face.areaRatio > 0.30) {
            totalScore -= 20
            matchedSignals.push({
              signal: 'Large Face / Portrait Penalty',
              points: -20,
              reason: `Detected large face (${Math.round(face.areaRatio * 100)}% area) outside document bounds`
            })
          }
        } else {
          // No quad detected: evaluate full frame
          if (face.areaRatio > 0.30) {
            totalScore -= 20
            matchedSignals.push({
              signal: 'Large Face / Portrait Penalty',
              points: -20,
              reason: `Detected large face (${Math.round(face.areaRatio * 100)}% frame area)`
            })
          }
        }
      }
    } catch {}

    // Taxonomy Rule Matching (150+ rules from ocr_rules.json)
    let bestType = 'General Document'
    let bestCategory: string | null = 'Unknown / Other'
    let bestRuleScore = 0

    for (const rule of ocrRules) {
      let rulePoints = 0
      for (const kw of rule.keywords) {
        if (fuzzyIncludes(lowerText, kw, 1)) {
          rulePoints += 4
        }
      }

      if (rule.regex) {
        try {
          const rx = new RegExp(rule.regex, 'i')
          if (rx.test(extractedText)) rulePoints += 10
        } catch {}
      }

      if (rulePoints > bestRuleScore) {
        bestRuleScore = rulePoints
        bestType = rule.name
        bestCategory = rule.category
      }
    }

    totalScore += bestRuleScore

    // Cap confidence if blurry
    let finalConfidence = Math.max(0, Math.min(100, totalScore))
    if (qualityFlags.blurry) {
      finalConfidence = Math.min(80, finalConfidence)
    }

    const isDocument = finalConfidence >= DOCUMENT_SCORE_THRESHOLD

    return {
      classification: isDocument ? bestType : 'not_a_document',
      category: isDocument ? bestCategory : null,
      confidence: finalConfidence,
      ocrQualityScore,
      matchedSignals,
      qualityFlags,
      extractedText
    }
  } catch (err: any) {
    return {
      classification: 'not_a_document',
      category: null,
      confidence: 0,
      ocrQualityScore: 0,
      matchedSignals: [{ signal: 'Scan Error', points: 0, reason: `Error during analysis: ${err?.message || err}` }],
      qualityFlags
    }
  }
}
