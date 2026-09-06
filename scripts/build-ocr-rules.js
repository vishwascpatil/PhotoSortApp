/**
 * build-ocr-rules.js
 * Compiles all 165 document types from the "OCR Docs" directory into
 * src/main/services/document/ocr_rules.json,
 * src/main/services/document/ocrRulesData.ts, and
 * src/renderer/src/services/ocr_rules.json
 */

const fs = require('fs');
const path = require('path');

const ocrDocsDir = path.join(__dirname, '..', 'OCR Docs');
const outputJsonMain = path.join(__dirname, '..', 'src', 'main', 'services', 'document', 'ocr_rules.json');
const outputTsMain = path.join(__dirname, '..', 'src', 'main', 'services', 'document', 'ocrRulesData.ts');
const outputJsonRenderer = path.join(__dirname, '..', 'src', 'renderer', 'src', 'services', 'ocr_rules.json');

// Standard 11 Categories
const CATEGORY_MAP = {
  'Government Identity': 'Government & Identity',
  'Government ID': 'Government & Identity',
  'Government Certificate': 'Government & Identity',
  'Government Identity / Immigration': 'Government & Identity',
  'Civil Registration': 'Government & Identity',
  'Vehicle': 'Vehicle',
  'Vehicle Registration': 'Vehicle',
  'Vehicle Insurance': 'Vehicle',
  'Compliance': 'Vehicle',
  'Banking & Finance': 'Banking & Finance',
  'Tax Document': 'Banking & Finance',
  'Tax Registration': 'Banking & Finance',
  'Medical': 'Medical',
  'Education': 'Education',
  'Employment': 'Employment',
  'Property': 'Property',
  'Property Ownership': 'Property',
  'Rental': 'Property',
  'Lease': 'Property',
  'Housing': 'Property',
  'Travel': 'Travel',
  'Air Travel': 'Travel',
  'Rail Travel': 'Travel',
  'Road Travel': 'Travel',
  'Accommodation': 'Travel',
  'Immigration': 'Travel',
  'Water Travel': 'Travel',
  'Utility Bills': 'Utility Bills',
  'Utility Bill': 'Utility Bills',
  'Telecom': 'Utility Bills',
  'Housing Society': 'Utility Bills',
  'Municipal': 'Utility Bills',
  'Entertainment Utility': 'Utility Bills',
  'Business & Commerce': 'Business & Commerce',
  'Business Procurement': 'Business & Commerce',
  'Business Billing': 'Business & Commerce',
  'Business Proposal': 'Business & Commerce',
  'Business Registration': 'Business & Commerce',
  'Logistics': 'Business & Commerce',
  'Inventory': 'Business & Commerce',
  'Shipping': 'Business & Commerce',
  'Customs': 'Business & Commerce',
  'International Trade': 'Business & Commerce',
  'Warranty / Service': 'Business & Commerce',
  'Service Management': 'Business & Commerce',
  'Technical Documentation': 'Business & Commerce',
  'Service Document': 'Business & Commerce',
  'Service Billing': 'Business & Commerce',
  'Product Warranty': 'Business & Commerce',
  'Retail Receipt': 'Business & Commerce',
  'Legal': 'Legal',
  'Estate Planning': 'Legal',
  'Family Law': 'Legal',
  'Police / Law Enforcement': 'Legal',
  'Corporate Governance': 'Legal',
  'Corporate Agreement': 'Legal'
};

function normalizeKey(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Known multi-word phrases for OCR domain
const KNOWN_PHRASES = [
  'unique identification authority of india', 'unique identification authority', 'permanent account number',
  'income tax department', 'government of india', 'govt. of india', 'govt of india', 'date of birth', 'year of birth',
  'person of indian origin', 'overseas citizen of india', 'senior citizen card', 'senior citizen',
  'resident certificate', 'family id card', 'family id', 'caste certificate', 'income certificate',
  'domicile certificate', 'ews certificate', 'disability certificate', 'learner licence', 'learner license',
  'republic of india', 'passport number', 'passport no', 'place of birth', 'date of issue', 'date of expiry',
  'driving licence', 'driving license', 'transport department', 'election commission of india',
  'elector photo identity card', 'assembly constituency', 'birth certificate', 'certificate of birth',
  'municipal corporation', 'death certificate', 'certificate of death', 'cause of death', 'marriage certificate',
  'certificate of marriage', 'ration card', 'food and civil supplies', 'priority household', 'fair price shop',
  'registration certificate', 'vehicle registration', 'engine number', 'chassis number', 'fuel type',
  'vehicle class', 'pollution under control', 'road tax receipt', 'road tax', 'fitness certificate',
  'national permit', 'state permit', 'fastag statement', 'fastag', 'vehicle challan', 'driving test',
  'vehicle transfer', 'hypothecation certificate', 'service record', 'warranty book', 'bank statement',
  'bank passbook', 'account number', 'account no', 'customer id', 'opening balance', 'closing balance',
  'fixed deposit', 'recurring deposit', 'loan statement', 'loan sanction', 'credit card statement',
  'credit card', 'debit card statement', 'debit card', 'salary slip', 'salary statement', 'basic pay',
  'gross salary', 'net pay', 'net salary', 'form 16', 'form no.16', 'form 26as', 'income tax return',
  'gst registration', 'gst invoice', 'gst return', 'tax invoice', 'upi receipt', 'payment receipt',
  'cash memo', 'medical prescription', 'medical report', 'blood test', 'urine test', 'x-ray report',
  'mri report', 'ct scan', 'ultrasound report', 'ecg report', 'discharge summary', 'vaccination certificate',
  'covid certificate', 'health insurance', 'medical bill', 'lab invoice', 'student id', 'school id',
  'marks card', 'degree certificate', 'diploma certificate', 'transfer certificate', 'migration certificate',
  'bonafide certificate', 'character certificate', 'hall ticket', 'admit card', 'fee receipt',
  'course completion', 'provisional certificate', 'rank card', 'sale deed', 'gift deed', 'rental agreement',
  'lease agreement', 'property tax receipt', 'property tax', 'khata certificate', 'khata extract',
  'encumbrance certificate', 'occupancy certificate', 'possession certificate', 'building approval',
  'mutation certificate', 'land record', 'survey sketch', 'property registration', 'boarding pass',
  'flight ticket', 'train ticket', 'bus ticket', 'hotel invoice', 'hotel booking', 'travel insurance',
  'immigration stamp', 'cruise ticket', 'electricity bill', 'water bill', 'gas bill', 'mobile bill',
  'broadband bill', 'internet bill', 'cable tv bill', 'society maintenance', 'insurance premium',
  'purchase order', 'sales order', 'proforma invoice', 'delivery challan', 'goods receipt note',
  'warranty card', 'amc contract', 'service report', 'product manual', 'packing list', 'credit note',
  'debit note', 'court order', 'legal notice', 'power of attorney', 'last will', 'trust deed',
  'partnership deed', 'memorandum of understanding', 'police verification', 'fir copy', 'employee id',
  'offer letter', 'appointment letter', 'employment contract', 'experience letter', 'relieving letter',
  'promotion letter', 'internship certificate', 'increment letter', 'confirmation letter', 'resignation acceptance',
  'background verification', 'non-disclosure agreement', 'amazon.in', 'tax invoice/bill of supply',
  'bill of supply', 'high court', 'supreme court', 'district court', 'chiguru children', 'eye hospital',
  'divorce decree', 'adoption deed'
];

// Whitelist of valid solo terms for required keywords
const ALLOWED_SOLO_REQUIRED_WORDS = new Set([
  'aadhaar', 'uidai', 'pancard', 'passport', 'puc', 'fastag', 'challan',
  'passbook', 'payslip', 'marksheet', 'bonafide', 'khata', 'encumbrance',
  'affidavit', 'hypothecation', 'indemnity', 'subpoena',
  'gstin', 'visa', 'mri', 'ecg', 'usg', 'cowin', 'amc', 'fir'
]);

function extractPhrases(rawText, ruleName) {
  if (!rawText) return [];
  let working = rawText.toLowerCase().replace(/[\r\n\t]+/g, ' ');
  working = working.replace(/ommon ocr mistakes:.*$/i, '').replace(/regex:.*$/i, '');

  const matched = [];

  // Add rule name and parenthesized aliases
  const dynamicPhrases = [...KNOWN_PHRASES];
  if (ruleName) {
    const cleanName = ruleName.toLowerCase().replace(/[\/\\,\.]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanName.includes(' ')) dynamicPhrases.push(cleanName);
    const parenMatch = ruleName.match(/\((.*?)\)/);
    if (parenMatch) {
      const alias = parenMatch[1].toLowerCase().trim();
      if (alias.includes(' ') || ALLOWED_SOLO_REQUIRED_WORDS.has(alias)) dynamicPhrases.push(alias);
    }
  }

  dynamicPhrases.sort((a, b) => b.length - a.length);
  for (const phrase of dynamicPhrases) {
    if (phrase.length >= 3 && working.includes(phrase)) {
      matched.push(phrase);
      working = working.split(phrase).join(' ');
    }
  }

  // Split remainder by commas or semicolons
  const parts = working.split(/[,;•]+/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  for (const part of parts) {
    if (part.includes(' ') && part.length >= 5) {
      matched.push(part);
    } else if (ALLOWED_SOLO_REQUIRED_WORDS.has(part)) {
      matched.push(part);
    }
  }

  return Array.from(new Set(matched));
}

const DISALLOWED_SOLO_NEGATIVES = new Set([
  'bill', 'order', 'invoice', 'statement', 'card', 'receipt', 'ticket', 'bank',
  'tax', 'payment', 'report', 'service', 'account', 'customer', 'date', 'copy',
  'original', 'letter', 'form', 'certificate', 'notice', 'plan', 'deed', 'agreement',
  'note', 'voucher', 'slip', 'check', 'cash', 'pass', 'id'
]);

function extractNegatives(rawText) {
  if (!rawText) return [];
  let working = rawText.toLowerCase().replace(/[\r\n\t]+/g, ' ');
  working = working.replace(/ommon ocr mistakes:.*$/i, '').replace(/regex:.*$/i, '');

  const parts = working.split(/[,;•]+/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part.includes(' ') && part.length >= 4) {
      result.push(part);
    } else if (part.length >= 4 && !DISALLOWED_SOLO_NEGATIVES.has(part)) {
      result.push(part);
    }
  }
  return Array.from(new Set(result));
}

function extractIndicators(rawText) {
  if (!rawText) return [];
  let working = rawText.toLowerCase().replace(/[\r\n\t]+/g, ' ');
  working = working.replace(/ommon ocr mistakes:.*$/i, '').replace(/regex:.*$/i, '');

  const tokens = working.split(/[,;\/\s•\-]+/).map(s => s.trim()).filter(s => s.length >= 3);
  return Array.from(new Set(tokens.filter(t => !['ommon', 'mistakes', 'regex', 'notes', 'varies', 'same'].includes(t))));
}

// 1. Read Master List of 165 Types
const masterListContent = fs.readFileSync(path.join(ocrDocsDir, 'OCR_150_Document_Types_List.txt'), 'utf8');
const masterLines = masterListContent.split('\n').map(l => l.trim()).filter(Boolean);

const rulesMap = new Map();
const nameToRuleMap = new Map();
let currentCategory = '';

for (const line of masterLines) {
  const m = line.match(/^(\d+)\.\s*(.+)$/);
  if (m) {
    const id = parseInt(m[1], 10);
    const name = m[2].trim();
    const category = CATEGORY_MAP[currentCategory] || currentCategory || 'Government & Identity';
    const ruleObj = {
      id,
      name,
      category,
      requiredKeywords: [],
      strongIndicators: [],
      weakIndicators: [],
      negativeKeywords: [],
      regex: null
    };
    rulesMap.set(id, ruleObj);
    nameToRuleMap.set(normalizeKey(name), ruleObj);
  } else if (!line.includes('OCR Document') && !line.includes('Total Document')) {
    currentCategory = line;
  }
}

// Helper: Find rule by name with alias support
function findRule(titleName, fallbackId) {
  const norm = normalizeKey(titleName);
  if (nameToRuleMap.has(norm)) return nameToRuleMap.get(norm);

  // Common aliases
  const aliasMap = {
    'willtestament': 'will',
    'vehicleregistrationcertificaterc': 'vehicleregistrationcertificate',
    'landlinebill': 'telephonebill',
    'mobilephonebill': 'mobilebill',
    'propertymaintenancebill': 'societymaintenancebill',
    'sewagebill': 'seweragebill',
    'wastecollectionbill': 'garbagetaxbill',
    'goodsreceiptnotegrn': 'goodsreceiptnote',
    'gsttaxinvoice': 'taxinvoice',
    'purchasereceipt': 'paymentreceipt',
    'salesinvoice': 'salesorder',
    'repairinvoice': 'electricitypaymentreceipt',
    'nocforvehicle': 'nationalpermit',
    'affidavitofsupport': 'affidavit',
    'divorcedecree': 'courtorder',
    'adoptiondeed': 'trustdeed'
  };

  if (aliasMap[norm] && nameToRuleMap.has(aliasMap[norm])) {
    return nameToRuleMap.get(aliasMap[norm]);
  }

  for (const [key, rule] of nameToRuleMap.entries()) {
    if (norm.length >= 5 && (key.includes(norm) || norm.includes(key))) {
      return rule;
    }
  }

  if (fallbackId && rulesMap.has(fallbackId)) {
    return rulesMap.get(fallbackId);
  }

  return null;
}

// 2. Parse Sectional Knowledge Base Files
function parseSectionFile(filename) {
  const filePath = path.join(ocrDocsDir, filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');

  // Handle both "===\n 21. Title" and "\n 141. Title" formats
  let sections = [];
  if (content.includes('=====')) {
    const rawSecs = content.split(/={5,}\s*(\d+)\.\s*([^=]+?)\s*={5,}/);
    for (let i = 1; i < rawSecs.length; i += 3) {
      sections.push({
        id: parseInt(rawSecs[i], 10),
        title: (rawSecs[i + 1] || '').replace(/\s+/g, ' ').trim(),
        body: rawSecs[i + 2] || ''
      });
    }
  } else {
    const blocks = content.split(/\n\s*(?=\d+\.\s+)/);
    for (const block of blocks) {
      const m = block.match(/^(\d+)\.\s*([^:\n]+?)(?:\s+Category:|\s*\n)/);
      if (m) {
        sections.push({
          id: parseInt(m[1], 10),
          title: (m[2] || '').replace(/\s+/g, ' ').trim(),
          body: block
        });
      }
    }
  }

  for (const sec of sections) {
    const rule = findRule(sec.title, sec.id);
    if (!rule) continue;

    const getField = (name) => {
      const rx = new RegExp(`(?:^|\\n)\\s*${name}:?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:Category|Required Keywords|Optional Keywords|Strong Indicators|Weak Indicators|Negative Keywords|Regex|Common OCR Mistakes|ommon OCR Mistakes|OCR Mistakes|Classification Notes|Notes:|$)))`, 'i');
      const m = sec.body.match(rx);
      return m ? m[1].trim() : '';
    };

    const catField = getField('Category');
    if (catField && CATEGORY_MAP[catField]) {
      rule.category = CATEGORY_MAP[catField];
    }

    const req = extractPhrases(getField('Required Keywords'), rule.name);
    for (const r of req) {
      if (!rule.requiredKeywords.includes(r)) rule.requiredKeywords.push(r);
    }

    const strong = extractIndicators(getField('Strong Indicators'));
    for (const s of strong) {
      if (!rule.strongIndicators.includes(s)) rule.strongIndicators.push(s);
    }

    const weak = extractIndicators(getField('Weak Indicators') || getField('Optional Keywords'));
    for (const w of weak) {
      if (!rule.weakIndicators.includes(w)) rule.weakIndicators.push(w);
    }

    const neg = extractNegatives(getField('Negative Keywords'));
    for (const n of neg) {
      if (!rule.negativeKeywords.includes(n)) rule.negativeKeywords.push(n);
    }

    const rx = getField('Regex');
    if (rx && !rx.toLowerCase().includes('varies') && !rx.toLowerCase().includes('same as') && !rx.toLowerCase().includes('none')) {
      rule.rawRegex = rx;
    }
  }
}

// Parse all KB part files
parseSectionFile('OCR_Knowledge_Base_Part1_Government_Documents.txt');
parseSectionFile('OCR_Knowledge_Base_Part1_Extended_Documents_17_20.txt');
parseSectionFile('OCR_Knowledge_Base_Part2_Vehicle_Documents_21_35.txt');
parseSectionFile('OCR_Knowledge_Base_Part3A_Banking_36_45.txt');
parseSectionFile('OCR_Knowledge_Base_Part3B_Banking_46_55.txt');
parseSectionFile('OCR_Knowledge_Base_Part4_Medical_56_70.txt');
parseSectionFile('OCR_Knowledge_Base_Part5_Education_71_85.txt');
parseSectionFile('OCR_Knowledge_Base_Part7_Property_101_115_ASCII.txt');
parseSectionFile('OCR_Knowledge_Base_Part8_Travel_116_125.txt');
parseSectionFile('OCR_Knowledge_Base_Part9_Utility_126_140.txt');
parseSectionFile('OCR_Knowledge_Base_Part10_Business_141_155.txt');
parseSectionFile('OCR_Knowledge_Base_Part11_Legal_156_165.txt');

// 3. Hand-crafted Employment Rules (86–100)
const EMPLOYMENT_RULES = {
  86: {
    required: ['curriculum vitae', 'career objective'],
    strong: ['curriculum vitae', 'work experience', 'educational qualifications', 'technical skills', 'employment history'],
    weak: ['skills', 'education', 'projects', 'experience', 'hobbies', 'certifications'],
    negative: ['offer letter', 'invoice', 'receipt', 'prescription']
  },
  87: {
    required: ['offer letter', 'job offer', 'pleased to offer'],
    strong: ['offer letter', 'we are pleased to offer', 'joining date', 'annual ctc', 'remuneration package'],
    weak: ['designation', 'salary', 'benefits', 'terms of employment', 'probation'],
    negative: ['relieving letter', 'payslip', 'invoice', 'resignation']
  },
  88: {
    required: ['appointment letter', 'letter of appointment'],
    strong: ['letter of appointment', 'terms of appointment', 'effective date of appointment', 'hereby appointed'],
    weak: ['probation period', 'designation', 'code of conduct', 'duties and responsibilities'],
    negative: ['relieving letter', 'resignation', 'invoice']
  },
  89: {
    required: ['employment contract', 'employment agreement'],
    strong: ['contract of employment', 'terms and conditions of employment', 'employer and employee', 'governing law'],
    weak: ['confidentiality', 'termination clause', 'intellectual property', 'obligations'],
    negative: ['rental agreement', 'lease agreement', 'sale deed']
  },
  90: {
    required: ['experience letter', 'experience certificate', 'service certificate'],
    strong: ['experience certificate', 'to whomsoever it may concern', 'worked with our organization', 'period of employment'],
    weak: ['conduct', 'character', 'designation', 'performance'],
    negative: ['offer letter', 'payslip', 'resume']
  },
  91: {
    required: ['relieving letter', 'relieved from', 'acceptance of resignation'],
    strong: ['relieved from services', 'effective close of business', 'settlement of dues', 'no due certificate'],
    weak: ['last working day', 'notice period', 'handover'],
    negative: ['offer letter', 'appointment letter']
  },
  92: {
    required: ['promotion letter', 'promoted to'],
    strong: ['letter of promotion', 'pleased to promote', 'revised compensation', 'elevation to position'],
    weak: ['designation', 'congratulations', 'responsibilities', 'effective date'],
    negative: ['resignation', 'termination']
  },
  93: {
    required: ['internship certificate', 'certificate of internship', 'internship completion'],
    strong: ['successfully completed internship', 'intern in department', 'internship project', 'internship tenure'],
    weak: ['intern', 'mentor', 'project work', 'student'],
    negative: ['degree certificate', 'payslip']
  },
  94: {
    required: ['employee id', 'staff id card', 'employee identity card'],
    strong: ['employee code', 'emp code', 'staff id card', 'blood group', 'authorized signatory'],
    weak: ['department', 'designation', 'valid till', 'emergency contact'],
    negative: ['student id', 'aadhaar', 'voter id', 'driving licence']
  },
  95: {
    required: ['payslip', 'salary slip', 'salary statement', 'pay slip'],
    strong: ['earnings and deductions', 'basic salary', 'basic pay', 'gross salary', 'net pay', 'provident fund', 'pf number'],
    weak: ['hra', 'special allowance', 'professional tax', 'lop days', 'pan'],
    negative: ['tax invoice', 'receipt', 'bill']
  },
  96: {
    required: ['increment letter', 'salary revision', 'compensation revision'],
    strong: ['annual increment', 'revised ctc', 'performance appraisal', 'increment in salary', 'w.e.f.'],
    weak: ['grade', 'band', 'fixed pay', 'variable pay'],
    negative: ['relieving letter', 'resignation']
  },
  97: {
    required: ['confirmation letter', 'letter of confirmation'],
    strong: ['confirmation of service', 'successful completion of probation', 'confirmed in services', 'confirmed employee'],
    weak: ['probationary period', 'permanent employment', 'terms'],
    negative: ['internship', 'resignation']
  },
  98: {
    required: ['acceptance of resignation', 'resignation acceptance', 'resignation letter'],
    strong: ['accept your resignation', 'tendered resignation', 'last working day', 'clearance of dues'],
    weak: ['notice period', 'exit formalities', 'handover'],
    negative: ['offer letter', 'appointment letter']
  },
  99: {
    required: ['background verification', 'bgv report', 'employment verification'],
    strong: ['background check report', 'verification agency', 'credentials verified', 'green report', 'discrepancy report'],
    weak: ['education check', 'employment history', 'criminal record'],
    negative: ['police verification']
  },
  100: {
    required: ['non-disclosure agreement', 'nda', 'confidentiality agreement'],
    strong: ['proprietary information', 'confidential information', 'disclosing party', 'receiving party', 'non-disclosure'],
    weak: ['trade secrets', 'injunctive relief', 'term of agreement'],
    negative: ['sale deed', 'rental agreement']
  }
};

for (const [idStr, eRule] of Object.entries(EMPLOYMENT_RULES)) {
  const id = parseInt(idStr, 10);
  if (rulesMap.has(id)) {
    const rule = rulesMap.get(id);
    rule.category = 'Employment';
    rule.requiredKeywords = eRule.required;
    rule.strongIndicators = eRule.strong;
    rule.weakIndicators = eRule.weak;
    rule.negativeKeywords = eRule.negative;
  }
}

// 4. Strict Contextual Regexes
const REGEX_MAP = {
  1: '\\b[2-9]{1}[0-9]{3}\\s?[0-9]{4}\\s?[0-9]{4}\\b', // Aadhaar
  2: '\\b[A-Z]{5}[0-9]{4}[A-Z]\\b', // PAN
  3: '\\b[A-Z][0-9]{7}\\b', // Passport
  4: '\\b[A-Z]{2}[0-9]{2}\\s?[0-9]{11}\\b', // DL
  6: '\\b[A-Z]{3}[0-9]{7}\\b', // Voter ID
  21: '\\b[A-Z]{2}[0-9]{1,2}\\s?[A-Z]{1,3}\\s?[0-9]{4}\\b', // Vehicle RC
  36: '\\b[A-Z]{4}0[A-Z0-9]{6}\\b', // IFSC
  37: '\\b[A-Z]{4}0[A-Z0-9]{6}\\b', // IFSC
  38: '\\b\\d{6}\\b\\s+\\b\\d{9}\\b', // Cheque MICR
  51: '\\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\\b', // GSTIN
  52: '\\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\\b', // GST Invoice
  116: '\\bPNR\\s*[:\\-]?\\s*[A-Z0-9]{6}\\b', // Airline PNR
  117: '\\b(PNR|E-TKT|TICKET)\\s*[:\\-]?\\s*[A-Z0-9]{6,10}\\b', // Ticket PNR
  118: '\\bPNR\\s*[:\\-]?\\s*\\d{10}\\b' // IRCTC PNR
};

for (const [idStr, rx] of Object.entries(REGEX_MAP)) {
  const id = parseInt(idStr, 10);
  if (rulesMap.has(id)) {
    rulesMap.get(id).regex = rx;
  }
}

// 5. Final Sanitization of All 165 Rules
for (const [id, rule] of rulesMap.entries()) {
  // Filter requiredKeywords: MUST be multi-word OR in ALLOWED_SOLO_REQUIRED_WORDS
  const filteredReq = [];
  for (const kw of rule.requiredKeywords) {
    const trimmed = kw.trim().toLowerCase();
    if (trimmed.includes(' ') && trimmed.length >= 4) {
      filteredReq.push(trimmed);
    } else if (ALLOWED_SOLO_REQUIRED_WORDS.has(trimmed)) {
      filteredReq.push(trimmed);
    } else {
      if (!rule.weakIndicators.includes(trimmed)) rule.weakIndicators.push(trimmed);
    }
  }

  // If rule has 0 required keywords, derive phrase from rule's name
  if (filteredReq.length === 0) {
    const cleanName = rule.name.toLowerCase().replace(/[\(\)\/]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanName.includes(' ')) {
      filteredReq.push(cleanName);
    } else if (ALLOWED_SOLO_REQUIRED_WORDS.has(cleanName)) {
      filteredReq.push(cleanName);
    } else {
      filteredReq.push(`${cleanName} document`);
    }
  }

  rule.requiredKeywords = Array.from(new Set(filteredReq));

  // Clean indicators to eliminate generic stop words
  const JUNK_INDICATORS = new Set([
    'ommon', 'mistakes', 'regex', 'notes', 'varies', 'same', 'weak', 'indicators', 'indicators:',
    'strong', 'negative', 'keywords', 'keywords:', 'number', 'date', 'name', 'title', 'certificate',
    'category', 'format', 'year', 'copy', 'under', 'board'
  ]);
  rule.strongIndicators = rule.strongIndicators.filter(w => !JUNK_INDICATORS.has(w.toLowerCase()) && w.length >= 3);
  rule.weakIndicators = rule.weakIndicators.filter(w => !JUNK_INDICATORS.has(w.toLowerCase()) && w.length >= 3);

  // ─── Special Case Overrides for High-Priority Document Types ─────────────
  if (rule.id === 1) { // Aadhaar Card
    rule.category = 'Government & Identity';
    rule.requiredKeywords = ['aadhaar', 'aadhar', 'uidai', 'unique identification', 'mera aadhaar'];
    rule.strongIndicators = ['government of india', 'govt of india', 'unique identification authority', 'enrolment no', 'vid', 'male', 'female', 'dob'];
  }
  if (rule.id === 2) { // PAN Card
    rule.category = 'Government & Identity';
    rule.requiredKeywords = ['permanent account number', 'income tax department', 'pan card', 'incometax'];
    rule.strongIndicators = ['permanent account', 'income tax', 'father', 'signature', 'pan'];
  }
  if (rule.id === 3) { // Passport
    rule.category = 'Government & Identity';
    rule.requiredKeywords = ['passport', 'republic of india', 'passport no'];
    rule.strongIndicators = ['republic of india', 'given name', 'surname', 'nationality', 'place of birth'];
  }
  if (rule.id === 4) { // Driving Licence
    rule.category = 'Government & Identity';
    rule.requiredKeywords = ['driving licence', 'driving license', 'licence to drive', 'transport department', 'union of india'];
    rule.strongIndicators = ['dl no', 'valid till', 'motor vehicle', 'licensing authority'];
  }
  if (rule.id === 8) { // Birth Certificate
    rule.category = 'Government & Identity';
    rule.requiredKeywords = ['birth certificate', 'certificate of birth', 'date of birth', 'place of birth', 'registration of birth', 'art certihcate'];
    rule.strongIndicators = ['name of mother', 'name of father', 'medical officer', 'registration', 'date of approval', 'hospital', 'urban district', 'corporation'];
  }
  if (rule.id === 21) { // Vehicle RC
    rule.category = 'Vehicle';
    rule.requiredKeywords = ['registration certificate', 'vehicle registration', 'transport department', 'rc book', 'form 23'];
    rule.strongIndicators = ['chassis no', 'engine no', 'regn no', 'vehicle class', 'fuel type', 'maker class', 'owner name'];
  }
  if (rule.id === 22) { // Vehicle Insurance
    rule.category = 'Vehicle';
    rule.requiredKeywords = ['vehicle insurance', 'motor insurance', 'policy number', 'two wheeler', 'private car'];
    rule.strongIndicators = ['third party', 'insured declared value', 'idv', 'premium', 'policy period'];
  }
  if (rule.id === 36 || rule.id === 37) { // Bank Statement & Bank Passbook
    rule.category = 'Banking & Finance';
    rule.requiredKeywords = [
      'bank statement', 'bank passbook', 'account statement', 'statement of account', 
      'hdfc bank', 'icici bank', 'state bank of india', 'sbi', 'axis bank', 'canara bank', 
      'bank of baroda', 'kotak mahindra', 'punjab national bank', 'union bank', 'indian bank', 'karnataka bank'
    ];
    rule.strongIndicators = ['account no', 'a/c no', 'account number', 'customer id', 'cif', 'ifsc', 'branch', 'balance', 'credit', 'debit', 'speed post', 'dear customer'];
  }
  if (rule.id === 52 || rule.id === 145) { // GST Invoice & Tax Invoice
    rule.category = 'Business & Commerce';
    rule.requiredKeywords = ['tax invoice', 'bill of supply', 'cash memo', 'invoice/bill of supply', 'tax invoice/bill of supply', 'amazon.in', 'original for recipient', 'sold by', 'billing address', 'service lee technologies'];
    rule.strongIndicators = ['original for recipient', 'sold by', 'billing address', 'solitaire corporate park', 'gstin', 'pan no:'];
  }
  if (rule.id === 53) { // GST Return
    rule.category = 'Banking & Finance';
    rule.requiredKeywords = ['gst return', 'gstr-1', 'gstr-3b', 'gstr-9', 'input tax credit'];
    rule.strongIndicators = ['return period', 'outward supplies', 'inward supplies', 'tax liability'];
  }
  if (rule.id === 54) { // UPI Receipt
    rule.category = 'Banking & Finance';
    rule.requiredKeywords = ['transaction successful', 'payment successful', 'payment details', 'upi transaction', 'google pay', 'phonepe', 'paytm', 'bhim upi', 'payment receipt', 'scan qr code to pay'];
    rule.strongIndicators = ['transaction id', 'debited from', 'credited to', 'upi ref', 'utr', 'paid to', '@kbl', '@okaxis', '@okhdfcbank', '@upi'];
  }
  if (rule.id === 55) { // Payment Receipt
    rule.category = 'Business & Commerce';
    rule.requiredKeywords = ['payment receipt', 'receipt', 'received with thanks', 'cash receipt'];
    rule.strongIndicators = ['amount received', 'receipt no', 'received from'];
  }
  if (rule.id === 56 || rule.id === 57) { // Medical Prescription & Medical Report
    rule.category = 'Medical';
    rule.requiredKeywords = [
      'prescription', 'medical report', 'eye hospital', 'children\'s clinic', 'clinic', 'hospital', 
      'dr.', 'doctor', 'diagnosis', 'patient name', 'cataract surgery', 'medical centre', 'consultation',
      'nutrition', 'allergy and asthma', 'specialty hospital'
    ];
    rule.strongIndicators = ['mbbs', 'dnb', 'specialist', 'treatment', 'medicine', 'tablet', 'dosage', 'surgery', 'opd', 'ipd', 'clinic timings'];
  }
  if (rule.id === 71 || rule.id === 72) { // School ID & Student ID Card
    rule.category = 'Education';
    rule.requiredKeywords = ['school id', 'student id card', 'school identity card', 'student identity card', 'student id'];
    rule.strongIndicators = ['admission no', 'roll no', 'academic year', 'blood group', 'valid up to', 'date of birth'];
  }
  if (rule.id === 73 || rule.id === 82) { // Marksheet & Fee Receipt / School Notice
    rule.category = 'Education';
    rule.requiredKeywords.push('term assessment', 'important notice for parents', 'notice for parents', 'dear parents', 'annual day', 'worksheet', 'conversations :');
    rule.strongIndicators.push('portions', 'phonic sound', 'playgroup', 'learning & lots of love', 'school timings', 'bunnies');
  }
  if (rule.id === 116 || rule.id === 117) { // Boarding Pass & Flight Ticket
    rule.category = 'Travel';
    rule.requiredKeywords = ['flight ticket', 'flight itinerary', 'e-ticket', 'passenger ticket', 'boarding pass', 'indigo', 'air india', 'spicejet', 'vistara', 'akasa air', 'airline ticket', 'flight to'];
    rule.strongIndicators = ['flight', 'departure', 'arrival', 'terminal', 'gate', 'pnr', 'airline', 'seat', 'itinerary'];
  }
  if (rule.id === 118) { // Train Ticket
    rule.category = 'Travel';
    rule.requiredKeywords = ['train ticket', 'irctc', 'indian railways', 'electronic reservation slip', 'rail reservation', 'ticket confirmation'];
    rule.strongIndicators = ['irctc', 'rail reservation', 'passenger details', 'ticket fare', 'convenience fee', 'travel insurance premium', 'coach', 'berth', 'class', 'pnr'];
  }
  if (rule.id === 120 || rule.id === 121) { // Hotel Invoice & Hotel Booking
    rule.category = 'Travel';
    rule.requiredKeywords = ['hotel invoice', 'hotel booking', 'hotel reservation', 'room booking', 'hotel mainak', 'lemon grass', 'makemytrip', 'holidayz.makemytrip', 'check in', 'check out'];
    rule.strongIndicators = ['hotel', 'resort', 'double occupancy', 'room', 'booking reference', 'night stay'];
  }
  if (rule.id === 123) { // Travel Package / Tour Itinerary
    rule.category = 'Travel';
    rule.requiredKeywords = ['travel package', 'tour package', 'travel itinerary', 'andaman world travels', 'tour / sightseeing', 'package code:', 'radhanagar beach tour', 'island tour', 'trip total'];
    rule.strongIndicators = ['sightseeing', 'ferry boat', 'island', 'tour operator', 'trip total', 'port blair', 'havelock'];
  }
  if (rule.id === 126) { // Electricity Bill
    rule.category = 'Utility Bills';
    rule.requiredKeywords = ['electricity bill', 'electricity regulatory commission', 'karnataka electricity', 'bescom', 'mescom', 'hescom', 'gescom', 'electricity board', 'power supply'];
    rule.strongIndicators = ['consumer number', 'meter reading', 'kwh', 'tariff', 'regulatory commission'];
  }
  if (rule.id === 162) { // Will
    rule.category = 'Legal';
    rule.requiredKeywords = ['last will and testament', 'last will', 'testament'];
    rule.strongIndicators = ['testator', 'beneficiary', 'executor'];
    rule.negativeKeywords.push('gift deed', 'meme');
  }

  // Universal anti-meme negative keywords (strictly memes & spam, NEVER tickets or receipts)
  const universalNegatives = [
    'meme', 'reddit', 'tiktok', 'instagram', 'subscribe', 'retweet', 'lmao',
    'bruh', 'enter the 6-digit code', 'verify your number'
  ];
  for (const un of universalNegatives) {
    if (!rule.negativeKeywords.includes(un)) {
      rule.negativeKeywords.push(un);
    }
  }
}

const rulesArray = Array.from(rulesMap.values()).sort((a, b) => a.id - b.id);
console.log(`Generated ${rulesArray.length} complete document classification rules.`);

// Write to main services JSON and TS
fs.writeFileSync(outputJsonMain, JSON.stringify(rulesArray, null, 2), 'utf8');
console.log(`Saved JSON to: ${outputJsonMain}`);

const tsContent = `// Auto-generated by scripts/build-ocr-rules.js
// Total 165 Document Rules from OCR Docs Knowledge Base

export interface OcrRule {
  id: number
  name: string
  category: string
  requiredKeywords: string[]
  strongIndicators: string[]
  weakIndicators: string[]
  negativeKeywords: string[]
  regex: string | null
}

export const ocrRules: OcrRule[] = ${JSON.stringify(rulesArray, null, 2)}
`;

fs.writeFileSync(outputTsMain, tsContent, 'utf8');
console.log(`Saved TypeScript to: ${outputTsMain}`);

// Also sync with renderer services JSON
fs.writeFileSync(outputJsonRenderer, JSON.stringify(rulesArray, null, 2), 'utf8');
console.log(`Saved renderer JSON to: ${outputJsonRenderer}`);
