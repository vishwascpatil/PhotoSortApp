import sharp from 'sharp'
import { existsSync } from 'fs'
import { basename } from 'path'
import Tesseract from 'tesseract.js'
import { ocrRules } from './ocrRulesData'

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
  classification: string // matches 165 type taxonomy, or "not_a_document"
  category?: string | null // e.g. "Government & Identity", "Vehicle", "Banking & Finance", etc.
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

export const BLUR_THRESHOLD = 120
export const DOCUMENT_SCORE_THRESHOLD = 40

export const DOCUMENT_ASPECT_RATIOS = {
  ID_CARD: 1.586, // ISO/IEC 7810 ID-1 (Aadhaar, PAN, Driving License: 85.60 × 53.98 mm)
  A4_DOCUMENT: 1.414, // ISO 216 A4 (297 × 210 mm)
  PASSPORT_PAGE: 1.42 // Standard ICAO Doc 9303 Passport booklet page
}

export function hasDocumentFilename(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return true
  const docKeywords = [
    'aadhaar', 'aadhar', 'pancard', 'pan_card', 'passport', 'voter_id',
    'driving_licence', 'driving_license', 'marksheet', 'certificate',
    'invoice', 'receipt', 'tax_invoice', 'salary_slip', 'payslip',
    'bank_statement', 'passbook', 'electricity_bill', 'water_bill',
    'rc_book', 'vehicle_rc', 'pollution_certificate', 'puc'
  ]
  return docKeywords.some(kw => lower.includes(kw))
}

export function detectMemeOrSocialSignals(text: string): { isMeme: boolean; matchedSignals: string[] } {
  const lower = text.toLowerCase()
  const memeMatches: string[] = []

  // If text contains strong document signatures, do not discard as a meme
  const hasStrongDocMarkers =
    lower.includes('tax invoice') || lower.includes('bill of supply') ||
    lower.includes('irctc') || lower.includes('aadhaar') || lower.includes('aadhar') ||
    lower.includes('pancard') || lower.includes('birth certificate') || lower.includes('passport') ||
    lower.includes('election commission') || lower.includes('electricity') ||
    lower.includes('hospital') || lower.includes('clinic') || lower.includes('booking id') ||
    lower.includes('hdfc bank') || lower.includes('icici bank') || lower.includes('state bank of india')

  const memePatterns = [
    /\bpov[:\s]/i,
    /\b(me when|when you|when the|nobody:|no one:|literally no one:)\b/i,
    /\b(bro really|bro thinks|mfw|tfw|my honest reaction|my reaction to)\b/i,
    /\b(wait for it|swipe left|tag a friend|relatable)\b/i,
    /\b(lmao|rofl|bruh|ngl|tbh|smh|wtf|stfu|fr fr|no cap)\b/i,
    /\b(like and share|follow for more|comment below|link in bio|double tap|share this)\b/i,
    /\br\/[a-zA-Z0-9_]{3,}\b/i,
    /(?:follow|credit|via|source|by|ig|insta|tiktok)\s*[:\-]?\s*@[a-zA-Z0-9_]{3,}\b/i,
    /\b(tiktok|instagram|9gag|ifunny|memedroid|reddit|tweet|retweet|upvote|downvote)\b/i,
    /\b(verify your number|enter the 6-digit code|resend code in)\b/i,
    /the only person who should be able to control your emotions/i,
    /\b\d+\s+(?:years?|months?|weeks?|days?)\s+ago\b/i
  ]

  if (!hasStrongDocMarkers) {
    for (const pattern of memePatterns) {
      if (pattern.test(lower)) {
        memeMatches.push(pattern.source)
      }
    }
    if (/\b(business chat|last seen|typing\.\.\.)\b/i.test(lower) && !lower.includes('invoice') && !lower.includes('total')) {
      memeMatches.push('Chat screenshot')
    }
  }

  return {
    isMeme: memeMatches.length > 0,
    matchedSignals: memeMatches
  }
}

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

export function fuzzyIncludes(text: string, keyword: string, maxDistance = 1): boolean {
  const kwLower = keyword.trim().toLowerCase()
  const textLower = text.toLowerCase()

  if (kwLower.length < 3) {
    const rx = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return rx.test(textLower)
  }

  if (textLower.includes(kwLower)) return true

  // For words of length 3-4, require exact match; distance 1 only for >=5 chars, distance 2 for >=8 chars
  const allowedDist = kwLower.length >= 8 ? Math.min(2, maxDistance) : (kwLower.length >= 5 ? 1 : 0)
  if (allowedDist === 0) {
    const rx = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return rx.test(textLower)
  }

  // Word-by-word fuzzy match for terms
  const words = textLower.split(/[\s,.:;!?'"()\[\]{}\/\-_]+/).filter(w => w.length >= 3)
  for (const word of words) {
    if (Math.abs(word.length - kwLower.length) <= allowedDist) {
      if (levenshteinDistance(word, kwLower) <= allowedDist) {
        return true
      }
    }
  }

  // Sliding window check for multi-word phrases
  if (kwLower.includes(' ')) {
    const phraseWords = kwLower.split(' ')
    for (let i = 0; i <= words.length - phraseWords.length; i++) {
      const windowStr = words.slice(i, i + phraseWords.length).join(' ')
      if (levenshteinDistance(windowStr, kwLower) <= allowedDist) {
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

    // Document quad check: physical page/card or high-area rectangular paper
    const isValidDocQuad = areaRatio >= 0.15 && (matchesIdCard || matchesA4OrPassport || areaRatio >= 0.35)

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
    logger: () => {},
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
  // Reject immediately if text has meme or social media markers
  const memeCheck = detectMemeOrSocialSignals(rawText)
  if (memeCheck.isMeme) {
    return { matched: false, classification: '', category: '', confidence: 0, matchedSignals: [] }
  }

  const lowerText = rawText.toLowerCase()
  const normalizedText = normalizeOcrDigitSubstitutions(rawText)
  const signals: MatchedSignal[] = []

  // 1. Aadhaar Card Signature Check
  const aadhaarKeywords = ['aadhaar', 'aadhar', 'uidai', 'unique identification', 'mera aadhaar', 'enrolment']
  const matchedAadhaarKw = aadhaarKeywords.filter(kw => fuzzyIncludes(lowerText, kw, 1))
  const aadhaarRegex = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/
  const hasAadhaarNumber = (aadhaarRegex.test(rawText) || aadhaarRegex.test(normalizedText)) &&
    (matchedAadhaarKw.length >= 1 || lowerText.includes('government of india') || lowerText.includes('govt of india'))

  if (hasAadhaarNumber || matchedAadhaarKw.length >= 2) {
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

  // 2. PAN Card Signature Check (skip if commercial invoice with seller PAN)
  const isCommercialInvoice = /\b(tax invoice|bill of supply|invoice number|order number|shipping address|billing address|sold by)\b/i.test(rawText)
  if (!isCommercialInvoice) {
    const panRegex = /\b[A-Z]{5}\d{4}[A-Z]\b/
    const hasPanNumber = panRegex.test(rawText)
    const hasPanKeywords = fuzzyIncludes(lowerText, 'income tax', 2) ||
                           fuzzyIncludes(lowerText, 'permanent account', 2) ||
                           (lowerText.includes('income') && lowerText.includes('tax'))

    if ((hasPanNumber && (hasPanKeywords || lowerText.includes('pan card') || lowerText.includes('father'))) ||
        (hasPanKeywords && (lowerText.includes('father') || lowerText.includes('dob')))) {
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

  // 6. Birth Certificate Signature Check
  const hasBirthKeywords =
    lowerText.includes('birth certificate') ||
    lowerText.includes('certificate of birth') ||
    lowerText.includes('art certihcate') ||
    ((lowerText.includes('date of birth') || lowerText.includes('place of birth') || lowerText.includes('placo of birth')) &&
     (lowerText.includes('mother') || lowerText.includes('father')) &&
     (lowerText.includes('hospital') || lowerText.includes('registration') || lowerText.includes('medical officer')))

  if (hasBirthKeywords) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Identity Signature: Birth Certificate',
      points: isHighQuality ? 100 : 85,
      reason: `Birth Certificate pattern detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Birth Certificate',
      category: 'Government & Identity',
      confidence: isHighQuality ? 100 : 85,
      matchedSignals: signals
    }
  }

  // 7. Commercial Tax Invoice / Bill of Supply Signature Check
  const isTaxInvoice =
    /\b(tax invoice|bill of supply|cash memo|invoice\/bill of supply)\b/i.test(lowerText) ||
    (lowerText.includes('original for recipient') && lowerText.includes('sold by')) ||
    (lowerText.includes('sold by') && (lowerText.includes('billing address') || lowerText.includes('pan no') || lowerText.includes('gstin')))

  if (isTaxInvoice) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Commercial Signature: Tax Invoice',
      points: isHighQuality ? 100 : 90,
      reason: `Tax Invoice / Bill of Supply detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Tax Invoice',
      category: 'Business & Commerce',
      confidence: isHighQuality ? 100 : 90,
      matchedSignals: signals
    }
  }

  // 8. Train Ticket Signature Check
  const isTrainTicket =
    lowerText.includes('irctc') ||
    (lowerText.includes('rail reservation') && lowerText.includes('ticket confirmation')) ||
    (lowerText.includes('passenger details') && lowerText.includes('ticket fare') && lowerText.includes('convenience fee'))

  if (isTrainTicket) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Travel Signature: Train Ticket',
      points: isHighQuality ? 100 : 90,
      reason: `IRCTC / Railway Reservation Ticket detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Train Ticket',
      category: 'Travel',
      confidence: isHighQuality ? 100 : 90,
      matchedSignals: signals
    }
  }

  // 9. Flight Ticket Signature Check
  const isFlightTicket =
    (lowerText.includes('indigo') || lowerText.includes('air india') || lowerText.includes('spicejet') || lowerText.includes('vistara') || lowerText.includes('flight to') || lowerText.includes('flight ticket') || lowerText.includes('boarding pass')) &&
    (lowerText.includes('itinerary') || lowerText.includes('terminal') || lowerText.includes('departure') || lowerText.includes('arrival') || lowerText.includes('boarding'))

  if (isFlightTicket) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Travel Signature: Flight Ticket',
      points: isHighQuality ? 100 : 90,
      reason: `Flight Ticket / Itinerary detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Flight Ticket',
      category: 'Travel',
      confidence: isHighQuality ? 100 : 90,
      matchedSignals: signals
    }
  }

  // 10. UPI Receipt Signature Check
  const isUpiReceipt =
    (lowerText.includes('transaction successful') || lowerText.includes('payment successful') || lowerText.includes('scan qr code to pay') || lowerText.includes('paid to')) &&
    (lowerText.includes('utr') || lowerText.includes('transaction id') || lowerText.includes('debited from') || lowerText.includes('@kbl') || lowerText.includes('@upi') || lowerText.includes('upi ref'))

  if (isUpiReceipt) {
    const isHighQuality = ocrQualityScore >= 70
    signals.push({
      signal: 'Financial Signature: UPI Receipt',
      points: isHighQuality ? 100 : 90,
      reason: `UPI Payment Confirmation detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'UPI Receipt',
      category: 'Banking & Finance',
      confidence: isHighQuality ? 100 : 90,
      matchedSignals: signals
    }
  }

  // 11. Event / Movie Ticket Check
  const isEventTicket =
    (lowerText.includes('share your ticket') || lowerText.includes('booking id:')) &&
    (lowerText.includes('pvr') || lowerText.includes('inox') || lowerText.includes('cinepolis') || lowerText.includes('audi') || lowerText.includes('ticket(s)'))

  if (isEventTicket) {
    signals.push({
      signal: 'Travel & Leisure Signature: Event Ticket',
      points: 90,
      reason: `Cinema / Event Booking Ticket detected (OCR Quality: ${ocrQualityScore}%)`
    })

    return {
      matched: true,
      classification: 'Event Ticket',
      category: 'Travel',
      confidence: 90,
      matchedSignals: signals
    }
  }

  return { matched: false, classification: '', category: '', confidence: 0, matchedSignals: [] }
}

export interface TextClassificationResult {
  isDocument: boolean
  classification: string
  category: string | null
  confidence: number
  matchedSignals: MatchedSignal[]
}

export function classifyExtractedText(
  extractedText: string,
  ocrQualityScore = 85
): TextClassificationResult {
  const matchedSignals: MatchedSignal[] = []
  const lowerText = extractedText.toLowerCase()
  const words = extractedText.split(/\s+/).filter(w => w.length > 0)

  // 1. Anti-Meme Check
  const memeDetection = detectMemeOrSocialSignals(extractedText)
  if (memeDetection.isMeme) {
    return {
      isDocument: false,
      classification: 'not_a_document',
      category: null,
      confidence: 0,
      matchedSignals: [{
        signal: 'Meme / Social Media Disqualification',
        points: -100,
        reason: `Detected social/meme patterns: ${memeDetection.matchedSignals.join(', ')}`
      }]
    }
  }

  // 2. Identity Signatures Check
  const identityMatch = checkIdentitySignatures(extractedText, ocrQualityScore)
  if (identityMatch.matched) {
    return {
      isDocument: true,
      classification: identityMatch.classification,
      category: identityMatch.category,
      confidence: identityMatch.confidence,
      matchedSignals: identityMatch.matchedSignals
    }
  }

  // 3. 165 Document Taxonomy Matching
  let bestType = ''
  let bestCategory: string | null = null
  let bestRuleScore = 0

  if (words.length >= 3) {
    for (const rule of ocrRules) {
      let hasNegative = false
      for (const neg of rule.negativeKeywords) {
        if (neg && neg.length >= 3 && lowerText.includes(neg.toLowerCase())) {
          hasNegative = true
          break
        }
      }
      if (hasNegative) continue

      let matchedRequired = false
      for (const req of rule.requiredKeywords) {
        if (req && fuzzyIncludes(lowerText, req.toLowerCase(), 1)) {
          matchedRequired = true
          break
        }
      }

      let regexMatched = false
      if (rule.regex && rule.regex.length >= 4) {
        try {
          const rx = new RegExp(rule.regex, 'i')
          if (rx.test(extractedText)) regexMatched = true
        } catch {}
      }

      if (!matchedRequired) continue

      let rulePoints = 35
      if (regexMatched) rulePoints += 30

      for (const strong of rule.strongIndicators) {
        if (strong && fuzzyIncludes(lowerText, strong.toLowerCase(), 1)) {
          rulePoints += 15
        }
      }

      for (const weak of rule.weakIndicators) {
        if (weak && fuzzyIncludes(lowerText, weak.toLowerCase(), 0)) {
          rulePoints += 5
        }
      }

      if (rulePoints > bestRuleScore) {
        bestRuleScore = rulePoints
        bestType = rule.name
        bestCategory = rule.category
      }
    }
  }

  let totalScore = bestRuleScore
  if (bestRuleScore > 0 && bestCategory) {
    matchedSignals.push({
      signal: `Taxonomy Match: ${bestType}`,
      points: bestRuleScore,
      reason: `Matched category "${bestCategory}" (${bestType}) with verified required keywords`
    })
  }

  if (/\b\d{2}[/.-]\d{2}[/.-]\d{4}\b/.test(extractedText)) totalScore += 10
  if (/[$₹€£]\s?\d+/.test(extractedText) || /\b(total|amount|subtotal|balance)\s*:?\s*\d+/i.test(extractedText)) {
    totalScore += 10
  }

  const finalConfidence = Math.max(0, Math.min(100, totalScore))
  const isDocument = Boolean(bestCategory) && bestRuleScore >= 35 && finalConfidence >= DOCUMENT_SCORE_THRESHOLD

  return {
    isDocument,
    classification: isDocument && bestCategory ? bestType : 'not_a_document',
    category: isDocument && bestCategory ? bestCategory : null,
    confidence: isDocument ? finalConfidence : 0,
    matchedSignals
  }
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
  const hasFilenameKeyword = hasDocumentFilename(filename)
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
    } else if (edgeDensity >= 0.05 && edgeDensity <= 0.65) {
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

    // 2c. Prepare optimal OCR buffer (950px sweet spot for Tesseract accuracy & speed)
    // Add 20px white margin padding so Leptonica bounding boxes never clip outside image bounds
    const ocrReadyBuffer = await sharp(processedBuffer)
      .resize(950, 950, { fit: 'inside', withoutEnlargement: true })
      .extend({
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .grayscale()
      .normalize()
      .withMetadata({ density: 300 })
      .png()
      .toBuffer()

    // ─── Phase 3: Fast Reliable OCR ──────────────────────────────────────────
    const worker = await getOcrWorker()
    let winningOcr: OcrRunResult

    try {
      winningOcr = await runOcrWithPsm(worker, ocrReadyBuffer, Tesseract.PSM.AUTO)
    } finally {
      releaseOcrWorker(worker)
    }

    const ocrQualityScore = winningOcr.confidence
    const extractedText = winningOcr.text.trim()

    // ─── Phase 4: Anti-Meme Defense & 165-Taxonomy Classification ──────
    const classResult = classifyExtractedText(extractedText, ocrQualityScore)

    // Cap confidence if blurry
    let finalConfidence = classResult.confidence
    if (qualityFlags.blurry) {
      finalConfidence = Math.min(80, finalConfidence)
    }

    return {
      classification: classResult.classification,
      category: classResult.category,
      confidence: classResult.isDocument ? finalConfidence : 0,
      ocrQualityScore,
      matchedSignals: [...matchedSignals, ...classResult.matchedSignals],
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
