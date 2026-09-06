const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const ocrRules = JSON.parse(fs.readFileSync('c:/Users/vishw/Desktop/photo-sort/src/main/services/document/ocr_rules.json', 'utf8'));

const MEME_PATTERNS = [
  /\bpov[:\s]/i,
  /\b(me when|when you|when the|nobody:|no one:|literally no one:)\b/i,
  /\b(bro really|bro thinks|mfw|tfw|my honest reaction|my reaction to)\b/i,
  /\b(wait for it|swipe left|tag a friend|relatable)\b/i,
  /\b(lmao|rofl|bruh|ngl|tbh|smh|wtf|stfu|fr fr|no cap)\b/i,
  /\b(like and share|follow for more|comment below|link in bio|double tap|share this)\b/i,
  /\br\/[a-zA-Z0-9_]{3,}\b/i,
  /(?:^|\s)@[a-zA-Z0-9_]{3,}\b/i,
  /\b(tiktok|instagram|9gag|ifunny|memedroid|reddit|tweet|retweet|upvote|downvote)\b/i,
  /\b(verify your number|enter the 6-digit code|resend code in|share your ticket)\b/i
];

function classifyText(text) {
  if (!text || text.trim() === '' || text === 'NONE' || text === 'ERROR') {
    return { isDoc: false, classification: 'not_a_document', category: null };
  }

  const lower = text.toLowerCase();

  // 1. Meme / OTP / Ticket reject
  for (const pat of MEME_PATTERNS) {
    if (pat.test(lower)) {
      return { isDoc: false, classification: 'not_a_document', category: null, reason: `Pattern ${pat}` };
    }
  }

  // 2. Identity Signatures (Aadhaar, PAN, Passport)
  if (lower.includes('aadhaar') || lower.includes('aadhar') || lower.includes('uidai')) {
    return { isDoc: true, classification: 'Aadhaar Card', category: 'Government & Identity' };
  }
  if ((lower.includes('permanent account number') || lower.includes('income tax department')) || /\b[A-Z]{5}\d{4}[A-Z]\b/.test(text)) {
    return { isDoc: true, classification: 'PAN Card', category: 'Government & Identity' };
  }
  if (lower.includes('passport') && (lower.includes('republic of india') || lower.includes('given name'))) {
    return { isDoc: true, classification: 'Passport', category: 'Government & Identity' };
  }

  // 3. 165 Taxonomy rules
  let bestType = null;
  let bestCategory = null;
  let bestScore = 0;

  for (const rule of ocrRules) {
    let hasNeg = false;
    for (const neg of rule.negativeKeywords) {
      if (neg && neg.length >= 3 && lower.includes(neg.toLowerCase())) {
        hasNeg = true;
        break;
      }
    }
    if (hasNeg) continue;

    let matchedReq = false;
    for (const req of rule.requiredKeywords) {
      if (req && lower.includes(req.toLowerCase())) {
        matchedReq = true;
        break;
      }
    }

    let regexMatched = false;
    if (rule.regex && rule.regex.length >= 4) {
      try {
        const rx = new RegExp(rule.regex, 'i');
        if (rx.test(text)) regexMatched = true;
      } catch {}
    }

    if (!matchedReq && !regexMatched) continue;

    let score = 30;
    if (regexMatched) score += 35;
    for (const s of rule.strongIndicators) {
      if (s && lower.includes(s.toLowerCase())) score += 15;
    }
    for (const w of rule.weakIndicators) {
      if (w && lower.includes(w.toLowerCase())) score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestType = rule.name;
      bestCategory = rule.category;
    }
  }

  if (bestScore >= 35 && bestCategory) {
    return { isDoc: true, classification: bestType, category: bestCategory, score: bestScore };
  }

  return { isDoc: false, classification: 'not_a_document', category: null };
}

async function main() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Check all photos in DB that have extracted text OR were marked as document
  const res = db.exec("SELECT id, filename, is_document, document_category, extracted_text FROM photos WHERE is_document = 1 OR extracted_text != ''");
  if (!res.length || !res[0].values.length) {
    console.log('No documents or scanned photos found in DB.');
    return;
  }

  const rows = res[0].values;
  console.log(`Processing ${rows.length} scanned photos in DB...`);

  let kept = 0;
  let cleared = 0;

  for (const r of rows) {
    const id = r[0];
    const filename = r[1];
    const oldIsDoc = r[2];
    const text = r[4];

    const result = classifyText(text);

    if (result.isDoc) {
      kept++;
      db.run("UPDATE photos SET is_document = 1, document_category = ? WHERE id = ?", [result.category, id]);
      console.log(`[REAL DOCUMENT] ${filename} -> "${result.classification}" (${result.category})`);
    } else {
      if (oldIsDoc === 1) cleared++;
      db.run("UPDATE photos SET is_document = 0, document_category = NULL WHERE id = ?", [id]);
      if (oldIsDoc === 1) {
        console.log(`[CLEARED FALSE POSITIVE] ${filename} -> UNMARKED (${result.reason || 'No 165 rule match'})`);
      }
    }
  }

  // Save back to disk
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log(`\nSuccessfully saved updated DB at ${dbPath}`);
  console.log(`Final Real Documents in DB: ${kept}`);
  console.log(`Cleared False Positives: ${cleared}`);
}

main().catch(console.error);
