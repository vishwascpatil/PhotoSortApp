const fs = require('fs')
const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')

// Load the compiled rules and classifier logic
const rules = JSON.parse(fs.readFileSync('src/main/services/document/ocr_rules.json', 'utf8'))

function levenshteinDistance(a, b) {
  const an = a.length, bn = b.length
  if (an === 0) return bn
  if (bn === 0) return an
  const matrix = []
  for (let i = 0; i <= bn; i++) matrix[i] = [i]
  for (let j = 0; j <= an; j++) matrix[0][j] = j
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1]
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
    }
  }
  return matrix[bn][an]
}

function fuzzyIncludes(text, keyword, maxDistance = 1) {
  const kwLower = keyword.trim().toLowerCase()
  const textLower = text.toLowerCase()
  if (kwLower.length < 3) {
    const rx = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i')
    return rx.test(textLower)
  }
  if (textLower.includes(kwLower)) return true
  const allowedDist = kwLower.length >= 8 ? Math.min(2, maxDistance) : (kwLower.length >= 5 ? 1 : 0)
  if (allowedDist === 0) {
    const rx = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i')
    return rx.test(textLower)
  }
  const words = textLower.split(/[\s,.:;!?'"()\[\]{}\/\-_]+/).filter(w => w.length >= 3)
  for (const word of words) {
    if (Math.abs(word.length - kwLower.length) <= allowedDist) {
      if (levenshteinDistance(word, kwLower) <= allowedDist) return true
    }
  }
  if (kwLower.includes(' ')) {
    const phraseWords = kwLower.split(' ')
    for (let i = 0; i <= words.length - phraseWords.length; i++) {
      const windowStr = words.slice(i, i + phraseWords.length).join(' ')
      if (levenshteinDistance(windowStr, kwLower) <= allowedDist) return true
    }
  }
  return false
}

function detectMemeOrSocialSignals(text) {
  const lower = text.toLowerCase()
  const memeMatches = []

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

  return { isMeme: memeMatches.length > 0, matchedSignals: memeMatches }
}

function checkIdentitySignatures(rawText) {
  const memeCheck = detectMemeOrSocialSignals(rawText)
  if (memeCheck.isMeme) {
    return { matched: false, classification: '', category: '', confidence: 0 }
  }

  const lowerText = rawText.toLowerCase()

  // 1. Aadhaar
  const aadhaarKeywords = ['aadhaar', 'aadhar', 'uidai', 'unique identification', 'mera aadhaar']
  const matchedAadhaarKw = aadhaarKeywords.filter(kw => fuzzyIncludes(lowerText, kw, 1))
  const aadhaarRegex = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/
  if (aadhaarRegex.test(rawText) || matchedAadhaarKw.length >= 1) {
    if (matchedAadhaarKw.length >= 1 || lowerText.includes('government of india') || lowerText.includes('unique identification')) {
      return { matched: true, classification: 'Aadhaar Card', category: 'Government & Identity', confidence: 98 }
    }
  }

  // 2. PAN Card
  const isCommercialInvoice = /\b(tax invoice|bill of supply|invoice number|order number|shipping address|billing address|sold by)\b/i.test(rawText)
  if (!isCommercialInvoice) {
    const panRegex = /\b[A-Z]{5}\d{4}[A-Z]\b/
    const hasPanNumber = panRegex.test(rawText)
    const hasPanKeywords = fuzzyIncludes(lowerText, 'income tax', 2) || fuzzyIncludes(lowerText, 'permanent account', 2)
    if (hasPanNumber && (hasPanKeywords || lowerText.includes('pan card') || lowerText.includes('father'))) {
      return { matched: true, classification: 'PAN Card', category: 'Government & Identity', confidence: 95 }
    }
  }

  // 3. Passport
  if (fuzzyIncludes(lowerText, 'republic of india', 2) || (fuzzyIncludes(lowerText, 'passport', 1) && (lowerText.includes('type p') || lowerText.includes('given name')))) {
    return { matched: true, classification: 'Passport', category: 'Government & Identity', confidence: 95 }
  }

  // 4. Voter ID
  if (fuzzyIncludes(lowerText, 'election commission', 2) || fuzzyIncludes(lowerText, 'elector', 1)) {
    return { matched: true, classification: 'Voter ID Card', category: 'Government & Identity', confidence: 95 }
  }

  // 5. Driving License
  if (fuzzyIncludes(lowerText, 'driving licence', 2) || fuzzyIncludes(lowerText, 'driving license', 2) || (lowerText.includes('dl no') && lowerText.includes('valid'))) {
    return { matched: true, classification: 'Driving License', category: 'Government & Identity', confidence: 95 }
  }

  // 6. Birth Certificate
  const hasBirthKeywords =
    lowerText.includes('birth certificate') ||
    lowerText.includes('certificate of birth') ||
    lowerText.includes('art certihcate') ||
    ((lowerText.includes('date of birth') || lowerText.includes('place of birth') || lowerText.includes('placo of birth')) &&
     (lowerText.includes('mother') || lowerText.includes('father')) &&
     (lowerText.includes('hospital') || lowerText.includes('registration') || lowerText.includes('medical officer')))
  if (hasBirthKeywords) {
    return { matched: true, classification: 'Birth Certificate', category: 'Government & Identity', confidence: 95 }
  }

  // 7. Tax Invoice / Bill of Supply
  const isTaxInvoice =
    /\b(tax invoice|bill of supply|cash memo|invoice\/bill of supply)\b/i.test(lowerText) ||
    (lowerText.includes('original for recipient') && lowerText.includes('sold by')) ||
    (lowerText.includes('sold by') && (lowerText.includes('billing address') || lowerText.includes('pan no') || lowerText.includes('gstin')))
  if (isTaxInvoice) {
    return { matched: true, classification: 'Tax Invoice', category: 'Business & Commerce', confidence: 95 }
  }

  // 8. Train Ticket
  const isTrainTicket =
    lowerText.includes('irctc') ||
    (lowerText.includes('rail reservation') && lowerText.includes('ticket confirmation')) ||
    (lowerText.includes('passenger details') && lowerText.includes('ticket fare') && lowerText.includes('convenience fee'))
  if (isTrainTicket) {
    return { matched: true, classification: 'Train Ticket', category: 'Travel', confidence: 95 }
  }

  // 9. Flight Ticket
  const isFlightTicket =
    (lowerText.includes('indigo') || lowerText.includes('air india') || lowerText.includes('spicejet') || lowerText.includes('vistara') || lowerText.includes('flight to') || lowerText.includes('flight ticket') || lowerText.includes('boarding pass')) &&
    (lowerText.includes('itinerary') || lowerText.includes('terminal') || lowerText.includes('departure') || lowerText.includes('arrival') || lowerText.includes('boarding'))
  if (isFlightTicket) {
    return { matched: true, classification: 'Flight Ticket', category: 'Travel', confidence: 95 }
  }

  // 10. UPI Receipt
  const isUpiReceipt =
    (lowerText.includes('transaction successful') || lowerText.includes('payment successful') || lowerText.includes('scan qr code to pay') || lowerText.includes('paid to')) &&
    (lowerText.includes('utr') || lowerText.includes('transaction id') || lowerText.includes('debited from') || lowerText.includes('@kbl') || lowerText.includes('@upi') || lowerText.includes('upi ref'))
  if (isUpiReceipt) {
    return { matched: true, classification: 'UPI Receipt', category: 'Banking & Finance', confidence: 95 }
  }

  // 11. Event / Movie Ticket
  const isEventTicket =
    (lowerText.includes('share your ticket') || lowerText.includes('booking id:')) &&
    (lowerText.includes('pvr') || lowerText.includes('inox') || lowerText.includes('cinepolis') || lowerText.includes('audi') || lowerText.includes('ticket(s)'))
  if (isEventTicket) {
    return { matched: true, classification: 'Event Ticket', category: 'Travel', confidence: 90 }
  }

  return { matched: false, classification: '', category: '', confidence: 0 }
}

function classifyExtractedText(extractedText) {
  const memeDetection = detectMemeOrSocialSignals(extractedText)
  if (memeDetection.isMeme) {
    return { isDocument: false, classification: 'not_a_document', category: null, confidence: 0 }
  }

  const identityMatch = checkIdentitySignatures(extractedText)
  if (identityMatch.matched) {
    return {
      isDocument: true,
      classification: identityMatch.classification,
      category: identityMatch.category,
      confidence: identityMatch.confidence
    }
  }

  const lowerText = extractedText.toLowerCase()
  const words = extractedText.split(/\s+/).filter(w => w.length > 0)

  let bestType = ''
  let bestCategory = null
  let bestRuleScore = 0

  if (words.length >= 3) {
    for (const rule of rules) {
      let hasNegative = false
      for (const neg of rule.negativeKeywords || []) {
        if (neg && neg.length >= 3 && lowerText.includes(neg.toLowerCase())) {
          hasNegative = true
          break
        }
      }
      if (hasNegative) continue

      let matchedRequired = false
      for (const req of rule.requiredKeywords || []) {
        if (req && fuzzyIncludes(lowerText, req.toLowerCase(), 1)) {
          matchedRequired = true
          break
        }
      }
      if (!matchedRequired) continue

      let rulePoints = 35
      if (rule.regex) {
        try {
          if (new RegExp(rule.regex, 'i').test(extractedText)) rulePoints += 30
        } catch {}
      }

      for (const strong of rule.strongIndicators || []) {
        if (strong && fuzzyIncludes(lowerText, strong.toLowerCase(), 1)) {
          rulePoints += 15
        }
      }

      for (const weak of rule.weakIndicators || []) {
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
  if (/\b\d{2}[/.-]\d{2}[/.-]\d{4}\b/.test(extractedText)) totalScore += 10
  if (/[$₹€£]\s?\d+/.test(extractedText) || /\b(total|amount|subtotal|balance)\s*:?\s*\d+/i.test(extractedText)) {
    totalScore += 10
  }

  const finalConfidence = Math.max(0, Math.min(100, totalScore))
  const isDocument = Boolean(bestCategory) && bestRuleScore >= 35 && finalConfidence >= 40

  return {
    isDocument,
    classification: isDocument && bestCategory ? bestType : 'not_a_document',
    category: isDocument && bestCategory ? bestCategory : null,
    confidence: isDocument ? finalConfidence : 0
  }
}

async function syncDb() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db')
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const rows = db.exec("SELECT id, filename, extracted_text, is_document, document_category FROM photos")[0]?.values || []
  console.log(`Inspecting ${rows.length} photos in DB for document sync...`)

  let updatedDocs = 0
  let clearedDocs = 0

  for (const r of rows) {
    const [id, filename, text, currentIsDoc, currentCat] = r
    if (text && text.length > 5 && text !== 'NONE' && text !== 'ERROR') {
      const res = classifyExtractedText(text)
      if (res.isDocument && res.category) {
        db.run("UPDATE photos SET is_document = 1, document_category = ? WHERE id = ?", [res.category, id])
        updatedDocs++
      } else {
        if (currentIsDoc === 1) clearedDocs++
        db.run("UPDATE photos SET is_document = 0, document_category = NULL WHERE id = ?", [id])
      }
    }
  }

  // Save changes to database file
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  console.log(`\nSuccessfully updated database at: ${dbPath}`)
  console.log(`Verified documents enabled: ${updatedDocs}`)
  console.log(`False positives cleared: ${clearedDocs}`)

  // Show new category counts
  const catRows = db.exec("SELECT document_category, count(*) FROM photos WHERE is_document = 1 GROUP BY document_category")[0]?.values || []
  console.log('\nNew Document Category counts in Database:')
  console.table(catRows)
}

syncDb().catch(console.error)
