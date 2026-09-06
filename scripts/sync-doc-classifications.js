const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');

const rules = JSON.parse(fs.readFileSync('c:/Users/vishw/Desktop/photo-sort/src/main/services/document/ocr_rules.json', 'utf8'));

function detectMemeOrSocialSignals(text) {
  const lower = text.toLowerCase();
  const memeMatches = [];

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
  ];

  for (const pattern of memePatterns) {
    if (pattern.test(lower)) {
      memeMatches.push(pattern.source);
    }
  }

  return { isMeme: memeMatches.length > 0, matchedSignals: memeMatches };
}

function levenshteinDistance(a, b) {
  const an = a.length, bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[bn][an];
}

function fuzzyIncludes(text, keyword, maxDistance = 1) {
  const kwLower = keyword.trim().toLowerCase();
  const textLower = text.toLowerCase();
  if (kwLower.length < 3) {
    const rx = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
    return rx.test(textLower);
  }
  if (textLower.includes(kwLower)) return true;
  const allowedDist = kwLower.length >= 8 ? Math.min(2, maxDistance) : (kwLower.length >= 5 ? 1 : 0);
  if (allowedDist === 0) {
    const rx = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
    return rx.test(textLower);
  }
  const words = textLower.split(/[\s,.:;!?'"()\[\]{}\/\-_]+/).filter(w => w.length >= 3);
  for (const word of words) {
    if (Math.abs(word.length - kwLower.length) <= allowedDist) {
      if (levenshteinDistance(word, kwLower) <= allowedDist) return true;
    }
  }
  if (kwLower.includes(' ')) {
    const phraseWords = kwLower.split(' ');
    for (let i = 0; i <= words.length - phraseWords.length; i++) {
      const windowStr = words.slice(i, i + phraseWords.length).join(' ');
      if (levenshteinDistance(windowStr, kwLower) <= allowedDist) return true;
    }
  }
  return false;
}

function checkIdentitySignatures(rawText) {
  const memeCheck = detectMemeOrSocialSignals(rawText);
  if (memeCheck.isMeme) return { matched: false, classification: '', category: '', confidence: 0 };
  const lowerText = rawText.toLowerCase();

  const aadhaarKeywords = ['aadhaar', 'aadhar', 'uidai', 'unique identification', 'mera aadhaar', 'enrolment'];
  const matchedAadhaarKw = aadhaarKeywords.filter(kw => fuzzyIncludes(lowerText, kw, 1));
  const aadhaarRegex = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/;
  const hasAadhaarNumber = aadhaarRegex.test(rawText) && (matchedAadhaarKw.length >= 1 || lowerText.includes('government of india') || lowerText.includes('govt of india'));

  if (hasAadhaarNumber || matchedAadhaarKw.length >= 2) {
    return { matched: true, classification: 'Aadhaar Card', category: 'Government & Identity', confidence: 95 };
  }

  const isCommercialInvoice = /\b(tax invoice|bill of supply|invoice number|order number|shipping address|billing address|sold by)\b/i.test(rawText);
  if (!isCommercialInvoice) {
    const panRegex = /\b[A-Z]{5}\d{4}[A-Z]\b/;
    const hasPanNumber = panRegex.test(rawText);
    const hasPanKeywords = fuzzyIncludes(lowerText, 'income tax', 2) || fuzzyIncludes(lowerText, 'permanent account', 2);
    if ((hasPanNumber && (hasPanKeywords || lowerText.includes('pan card') || lowerText.includes('father'))) ||
        (hasPanKeywords && (lowerText.includes('father') || lowerText.includes('dob')))) {
      return { matched: true, classification: 'PAN Card', category: 'Government & Identity', confidence: 95 };
    }
  }

  return { matched: false, classification: '', category: '', confidence: 0 };
}

function classifyExtractedText(extractedText) {
  const memeDetection = detectMemeOrSocialSignals(extractedText);
  if (memeDetection.isMeme) {
    return { isDocument: false, classification: 'not_a_document', category: null, confidence: 0 };
  }

  const identityMatch = checkIdentitySignatures(extractedText);
  if (identityMatch.matched) {
    return { isDocument: true, classification: identityMatch.classification, category: identityMatch.category, confidence: identityMatch.confidence };
  }

  const lowerText = extractedText.toLowerCase();
  const words = extractedText.split(/\s+/).filter(w => w.length > 0);

  let bestType = '';
  let bestCategory = null;
  let bestRuleScore = 0;

  if (words.length >= 3) {
    for (const rule of rules) {
      let hasNegative = false;
      for (const neg of rule.negativeKeywords || []) {
        if (neg && neg.length >= 3 && lowerText.includes(neg.toLowerCase())) {
          hasNegative = true;
          break;
        }
      }
      if (hasNegative) continue;

      let matchedRequired = false;
      for (const req of rule.requiredKeywords || []) {
        if (req && fuzzyIncludes(lowerText, req.toLowerCase(), 1)) {
          matchedRequired = true;
          break;
        }
      }
      if (!matchedRequired) continue;

      let rulePoints = 35;
      if (rule.regex) {
        try {
          const rx = new RegExp(rule.regex, 'i');
          if (rx.test(extractedText)) rulePoints += 30;
        } catch {}
      }

      for (const strong of rule.strongIndicators || []) {
        if (strong && fuzzyIncludes(lowerText, strong.toLowerCase(), 1)) {
          rulePoints += 15;
        }
      }

      for (const weak of rule.weakIndicators || []) {
        if (weak && fuzzyIncludes(lowerText, weak.toLowerCase(), 0)) {
          rulePoints += 5;
        }
      }

      if (rulePoints > bestRuleScore) {
        bestRuleScore = rulePoints;
        bestType = rule.name;
        bestCategory = rule.category;
      }
    }
  }

  let totalScore = bestRuleScore;
  if (/\b\d{2}[/.-]\d{2}[/.-]\d{4}\b/.test(extractedText)) totalScore += 10;
  if (/[$₹€£]\s?\d+/.test(extractedText) || /\b(total|amount|subtotal|balance)\s*:?\s*\d+/i.test(extractedText)) {
    totalScore += 10;
  }

  const finalConfidence = Math.max(0, Math.min(100, totalScore));
  const isDocument = Boolean(bestCategory) && bestRuleScore >= 35 && finalConfidence >= 35;

  return {
    isDocument,
    classification: isDocument && bestCategory ? bestType : 'not_a_document',
    category: isDocument && bestCategory ? bestCategory : null,
    confidence: isDocument ? finalConfidence : 0
  };
}

async function sync() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Reset false positives explicitly
  db.run("UPDATE photos SET is_document = 0, document_category = NULL WHERE filename IN ('PSNS9945.JPG', 'FZQB2179.JPG')");

  // Re-evaluate all photos with extracted text
  const rows = db.exec("SELECT id, filename, extracted_text FROM photos WHERE extracted_text IS NOT NULL AND extracted_text NOT IN ('', 'NONE', 'ERROR')")[0]?.values || [];

  let docCount = 0;
  let clearedCount = 0;

  for (const [id, filename, text] of rows) {
    const res = classifyExtractedText(text);
    if (res.isDocument) {
      db.run("UPDATE photos SET is_document = 1, document_category = ? WHERE id = ?", [res.category, id]);
      docCount++;
      console.log(`[DOC] ${filename} -> ${res.category} (${res.classification})`);
    } else {
      db.run("UPDATE photos SET is_document = 0, document_category = NULL WHERE id = ?", [id]);
      clearedCount++;
    }
  }

  // Save database back to disk
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log(`\nSuccessfully updated database: ${docCount} documents active, ${clearedCount} non-docs cleared.`);
}

sync().catch(console.error);
