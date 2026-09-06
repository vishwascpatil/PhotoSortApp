import Tesseract from 'tesseract.js'
import ocrRules from './ocr_rules.json'

export interface DocumentScanProgress {
  scannedCount: number
  totalCount: number
  isScanning: boolean
  currentFile?: string
  status?: string
  phase?: 'prefilter' | 'ocr' | 'done'
}

let isScanningDocs = false
let currentProgress: DocumentScanProgress | null = null
type ScanListener = (progress: DocumentScanProgress | null) => void
let listeners: ScanListener[] = []
let onDocumentFound: (() => void) | null = null

export function setOnDocumentFound(cb: (() => void) | null) {
  onDocumentFound = cb
}

export function subscribeToDocScan(listener: ScanListener) {
  listeners.push(listener)
  listener(currentProgress)
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function updateProgress(progress: DocumentScanProgress | null) {
  currentProgress = progress
  listeners.forEach(l => l(progress))
}

// Production-Grade Document Detection Engine Thresholds
const DOC_CONFIDENCE_THRESHOLD = 45
const OCR_CONCURRENCY = 4 // Process 4 photos simultaneously

// ─── Classify extracted text against OCR rules ──────────────────────────
function classifyText(text: string): { confidence: number; category: string | null } {
  const lowerText = text.toLowerCase()
  const words = text.split(/\s+/).filter(w => w.length > 0)

  // Stopwords to ignore in rule matching to avoid false positives
  const stopWords = new Set(['of', 'no', 'id', 'to', 'in', 'is', 'at', 'by', 'on', 'it', 'as', 'an', 'or', 'and', 'for', 'the', 'be', 'code', 'year', 'date', 'name', 'number'])

  // 0. High-Priority Signature Check for Government & Identity Documents
  const aadhaarKeywords = [
    'aadhaar', 'aadhar', 'adhar', 'adhaar', 'aadaar', 'aadar',
    'andnaar', 'andhaar', 'andahar', 'andhar', 'uidai', 'uidal', 'uida1', 'ulda', 'uldai',
    'mera aadhaar', 'unique identification', 'identity card'
  ]
  const hasAadhaarWord = aadhaarKeywords.some(kw => lowerText.includes(kw))

  // Count ID metadata terms (DOB, YOB, Male, Female, Address, Enrolment, Govt of India)
  const idMetaTerms = ['dob', 'yob', 'date of birth', 'year of birth', 'male', 'female', 'enrolment', 'address', 'govt of india', 'government of india']
  const matchedMetaCount = idMetaTerms.filter(term => lowerText.includes(term)).length

  const isAadhaar = hasAadhaarWord ||
                    (matchedMetaCount >= 2) ||
                    (/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/.test(text) && (matchedMetaCount >= 1 || lowerText.includes('india') || lowerText.includes('govt')))

  const isPAN = /\b[A-Z]{5}\d{4}[A-Z]{1}\b/.test(text) || /\b(income tax department|permanent account number|govt of india)\b/i.test(text)
  const isPassport = /\b(republic of india|passport|passport no|type p)\b/i.test(text)
  const isVoterID = /\b(election commission|elector|voter id|epic)\b/i.test(text)
  const isDL = /\b(driving licence|driver licence|driving license|dl no)\b/i.test(text)

  if (isAadhaar || isPAN || isPassport || isVoterID || isDL) {
    return { confidence: 100, category: 'Government & Identity' }
  }

  let confidence = 0

  // 1. Text Density Score (0 - 20)
  let densityScore = 0
  if (words.length > 50) densityScore += 10
  else if (words.length >= 10) densityScore += 5
  if (words.length >= 5) densityScore += 5
  confidence += Math.min(20, densityScore)

  // 2. Layout & Structural Score (0 - 20)
  let layoutScore = 0
  const kvMatches = text.match(/[A-Za-z]+:/g)
  if (kvMatches) {
    layoutScore += Math.min(10, kvMatches.length * 5)
  }
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  let structuredLines = 0
  for (const line of lines) {
    if (/\d/.test(line) && /[a-zA-Z]/.test(line)) structuredLines++
  }
  if (structuredLines > 3) layoutScore += 10
  confidence += Math.min(20, layoutScore)

  // 3. Universal Keyword Score (0 - 20)
  let keywordScore = 0
  const docKeywords = ['invoice', 'receipt', 'tax', 'hospital', 'bank', 'statement', 'government', 'goverment', 'certificate', 'signature', 'authorized', 'department', 'registration', 'total', 'aadhaar', 'uidai', 'pan', 'dob', 'india']
  let uniqueKeywords = 0
  for (const kw of docKeywords) {
    if (lowerText.includes(kw)) uniqueKeywords++
  }
  keywordScore += Math.min(20, uniqueKeywords * 5)
  confidence += keywordScore

  // 4. Regex Pattern Score (0 - 50)
  let regexScore = 0
  if (/\b\d{2}[/.-]\d{2}[/.-]\d{4}\b/.test(text)) regexScore += 10
  if (/[$₹€£]\s?\d+/.test(text)) regexScore += 10
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text)) regexScore += 10
  if (/\b\d{10}\b/.test(text)) regexScore += 10
  confidence += Math.min(40, regexScore)

  // 5. Penalty / Exclusion Score
  let penaltyScore = 0
  const junkKeywords = ['http://', 'https://', 'www.', 'subscribe', 'like', 'comment', 'share', 'follow us']
  for (const junk of junkKeywords) {
    if (lowerText.includes(junk)) penaltyScore += 30
  }
  confidence -= penaltyScore

  // Category matching
  let bestMatchCategory: string | null = null
  if (confidence >= DOC_CONFIDENCE_THRESHOLD) {
    let bestScore = 0

    for (const rule of ocrRules) {
      let ruleScore = 0
      for (const keyword of rule.keywords) {
        const cleanKw = keyword.replace(/^(keywords:|strong|weak|negative|indicators:|common|ocr|mistakes:|classification|notes:)/g, '').trim().toLowerCase()
        if (cleanKw.length < 3 || stopWords.has(cleanKw)) continue
        if (lowerText.includes(cleanKw)) ruleScore += 2
      }
      if (rule.regex) {
        try {
          const rx = new RegExp(rule.regex, 'i')
          if (rx.test(text)) ruleScore += 5
        } catch { }
      }
      if (ruleScore > bestScore) {
        bestScore = ruleScore
        bestMatchCategory = rule.category
      }
    }
  }

  const isDocument = confidence >= DOC_CONFIDENCE_THRESHOLD
  return { confidence, category: isDocument ? (bestMatchCategory || 'Unknown / Other') : null }
}

// ─── Process a single photo with OCR ────────────────────────────────────
async function ocrSinglePhoto(
  photoId: number,
  worker: Tesseract.Worker
): Promise<{ id: number; text: string; isDocument: boolean; category: string | null }> {
  try {
    // Get pre-processed, small, sharp, grayscale image buffer from main process
    const base64 = await window.photoVault.getOcrBuffer(photoId)
    if (!base64) {
      return { id: photoId, text: 'NONE', isDocument: false, category: null }
    }

    // Convert base64 to data URL for Tesseract
    const dataUrl = `data:image/png;base64,${base64}`

    const result = await worker.recognize(dataUrl)
    const text = result.data.text

    if (!text || text.trim().length < 5) {
      return { id: photoId, text: 'NONE', isDocument: false, category: null }
    }

    const { category } = classifyText(text)
    const isDocument = category !== null

    return { id: photoId, text, isDocument, category }
  } catch (err) {
    console.error('OCR failed for photo', photoId, err)
    return { id: photoId, text: 'ERROR', isDocument: false, category: null }
  }
}

// ─── Main Two-Phase Scan ────────────────────────────────────────────────
export async function scanDocuments() {
  if (isScanningDocs) return
  isScanningDocs = true

  try {
    updateProgress({
      scannedCount: 0,
      totalCount: 1,
      isScanning: true,
      phase: 'prefilter',
      status: 'Phase 1/2: Analyzing image features with edge detection...'
    })

    let unsubscribe: (() => void) | null = null
    if (window.photoVault?.onDocDetectProgress) {
      unsubscribe = window.photoVault.onDocDetectProgress((p: any) => {
        updateProgress({
          scannedCount: p.completed,
          totalCount: p.total,
          isScanning: p.isScanning,
          currentFile: p.currentFile,
          status: p.status,
          phase: p.phase
        })
        if (p.docsFound > 0 && onDocumentFound) {
          onDocumentFound()
        }
      })
    }

    if (window.photoVault?.startDocumentScan) {
      await window.photoVault.startDocumentScan(true)
    }

    if (unsubscribe) unsubscribe()
  } catch (err) {
    console.error('Error in scanDocuments:', err)
  } finally {
    isScanningDocs = false
    updateProgress(null)
  }
}

export function stopDocumentScanning() {
  isScanningDocs = false
  if (window.photoVault?.stopDocumentScan) {
    window.photoVault.stopDocumentScan().catch(() => {})
  }
  updateProgress(null)
}

