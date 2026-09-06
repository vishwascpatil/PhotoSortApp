const fs = require('fs')
const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')

const rules = JSON.parse(fs.readFileSync('c:/Users/vishw/Desktop/photo-sort/src/main/services/document/ocr_rules.json', 'utf8'))

function detectMemeOrSocialSignals(text) {
  const lower = text.toLowerCase()
  const memeMatches = []

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
    /\b(verify your number|enter the 6-digit code|resend code in|share your ticket)\b/i,
    /\b(business chat|whatsapp|signal chat|telegram chat|last seen|typing\.\.\.)\b/i,
    /\b(online\s+today|message to business|view business profile)\b/i,
    /airport transfers and sightseeing/i,
    /breakfast \+ \d+ dinner/i,
    /inclusions:.*sightseeing/i
  ]

  for (const pattern of memePatterns) {
    if (pattern.test(lower)) {
      memeMatches.push(pattern.source)
    }
  }

  return { isMeme: memeMatches.length > 0, matchedSignals: memeMatches }
}

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

async function debugRun() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db')
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  // Test on specific candidate docs we saw earlier:
  // UOZG9928.JPG (Birth certificate), WQCS1135.JPG (IRCTC ticket), XDJE6646.JPG (Electricity commission),
  // ULGM1796.JPG (Eye hospital), OLRO0202.JPG (Children's clinic), SQAG4255.JPG (HDFC letter)
  const testFiles = ['UOZG9928.JPG', 'WQCS1135.JPG', 'XDJE6646.JPG', 'ULGM1796.JPG', 'OLRO0202.JPG', 'SQAG4255.JPG', 'UPVI1423.JPG', 'SWMB9971.JPG', 'RAJS8026.JPG']
  
  for (const fn of testFiles) {
    const row = db.exec(`SELECT id, filename, is_document, document_category, extracted_text FROM photos WHERE filename = '${fn}'`)[0]?.values[0]
    if (!row) {
      console.log(`File not found in DB: ${fn}`)
      continue
    }
    const [id, filename, currIsDoc, currCat, text] = row
    console.log(`\n======================================================`)
    console.log(`TESTING: ${filename} (DB isDoc: ${currIsDoc}, cat: ${currCat})`)
    
    // Check meme
    const meme = detectMemeOrSocialSignals(text)
    if (meme.isMeme) {
      console.log(`  -> DISQUALIFIED BY MEME FILTER: ${meme.matchedSignals.join(', ')}`)
      continue
    }
    
    // Check which rules match required keywords
    const lower = text.toLowerCase()
    const matchingRules = []
    for (const rule of rules) {
      // Check negative keywords
      let hasNeg = false
      for (const neg of rule.negativeKeywords || []) {
        if (neg && neg.length >= 3 && lower.includes(neg.toLowerCase())) {
          hasNeg = true
          break
        }
      }
      if (hasNeg) continue

      let matchedReq = false
      for (const req of rule.requiredKeywords || []) {
        if (req && fuzzyIncludes(lower, req.toLowerCase(), 1)) {
          matchedReq = true
          break
        }
      }
      if (!matchedReq) continue

      let rulePoints = 35
      if (rule.regex) {
        try {
          if (new RegExp(rule.regex, 'i').test(text)) rulePoints += 30
        } catch {}
      }
      for (const s of rule.strongIndicators || []) {
        if (s && fuzzyIncludes(lower, s.toLowerCase(), 1)) rulePoints += 15
      }
      for (const w of rule.weakIndicators || []) {
        if (w && fuzzyIncludes(lower, w.toLowerCase(), 0)) rulePoints += 5
      }

      matchingRules.push({ name: rule.name, category: rule.category, points: rulePoints })
    }

    matchingRules.sort((a, b) => b.points - a.points)
    console.log(`  Matching rules count: ${matchingRules.length}`)
    if (matchingRules.length > 0) {
      console.log(`  Top 3 matching rules:`, matchingRules.slice(0, 3))
    } else {
      console.log(`  NO TAXONOMY RULES MATCHED AT ALL!`)
    }
  }
}

debugRun().catch(console.error)
