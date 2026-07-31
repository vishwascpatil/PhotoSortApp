const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

const ocrDocsPath = path.join(__dirname, '../OCR Docs');
const outputJsonPath = path.join(__dirname, '../src/renderer/src/services/ocr_rules.json');

function determineCategory(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('government') || lower.includes('vehicle') || lower.includes('extended')) return 'Government & Identity';
  if (lower.includes('banking')) return 'Banking & Finance';
  if (lower.includes('medical')) return 'Medical';
  if (lower.includes('education')) return 'Education';
  if (lower.includes('property')) return 'Property';
  if (lower.includes('travel')) return 'Travel';
  if (lower.includes('utility')) return 'Utility Bills';
  if (lower.includes('business') || lower.includes('commerce')) return 'Business & Commerce';
  if (lower.includes('legal')) return 'Legal';
  if (lower.includes('employment')) return 'Employment';
  return 'Unknown / Other';
}

async function parseText(text, category) {
  const rules = [];
  
  // Strip out ==== formatting lines
  text = text.replace(/={10,}/g, '');
  
  // Split text by numbers like "156. " followed by a word
  const blocks = text.split(/(?=\b\d{1,3}\.\s+[A-Za-z])/);
  
  for (let block of blocks) {
    block = block.trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' '); // collapse to single line and normalize spaces
    
    const headerMatch = block.match(/^(\d+)\.\s+([A-Za-z \/-]+?)(?=\s+Category:|\s+Required Keywords:|\s+Keywords:|$)/i);
    if (!headerMatch) continue;
    
    const id = parseInt(headerMatch[1]);
    const name = headerMatch[2].trim();
    
    const rule = {
      id,
      name,
      category: category,
      keywords: [],
      regex: null
    };
    
    // Extract everything after Keywords or Required Keywords until Strong Indicators or Regex
    const kwMatch = block.match(/(?:Required Keywords:|Keywords:)\s*(.+?)(?=\s*(?:Optional Keywords:|Strong Indicators:|Regex:|Category:|$))/i);
    if (kwMatch) {
      const kw = kwMatch[1].split(/[,\s]+/).filter(Boolean);
      rule.keywords.push(...kw.map(k => k.toLowerCase()));
    }
    
    const optMatch = block.match(/Optional Keywords:\s*(.+?)(?=\s*(?:Strong Indicators:|Weak Indicators:|Negative Keywords:|Regex:|Category:|$))/i);
    if (optMatch) {
      const kw = optMatch[1].split(/[,\s]+/).filter(Boolean);
      rule.keywords.push(...kw.map(k => k.toLowerCase()));
    }
    
    const regexMatch = block.match(/Regex:\s*(.+?)(?=\s*(?:OCR Mistakes:|Notes:|$))/i);
    if (regexMatch) {
      let rx = regexMatch[1].trim();
      if (rx && !rx.toLowerCase().includes('vary') && !rx.toLowerCase().includes('none') && rx !== '??') {
        rule.regex = rx;
      }
    }
    
    if (rule.keywords.length > 0) {
      rules.push(rule);
    }
  }
  
  return rules;
}

async function main() {
  const files = fs.readdirSync(ocrDocsPath);
  let allRules = [];
  
  for (const file of files) {
    if (file === 'OCR_150_Document_Types_List.txt') continue;
    if (file === 'OCR_Document_Keywords_Reference.txt') continue; // We will use the categorized files instead to ensure they get proper categories
    
    const filePath = path.join(ocrDocsPath, file);
    const category = determineCategory(file);
    
    let text = '';
    if (file.endsWith('.txt')) {
      text = fs.readFileSync(filePath, 'utf8');
    } else if (file.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
      } catch (err) {
        console.error('Failed to parse docx:', file);
      }
    } else {
      continue;
    }
    
    const rules = await parseText(text, category);
    allRules = allRules.concat(rules);
  }
  
  const uniqueRules = [];
  const seenNames = new Set();
  
  for (const rule of allRules) {
    const key = rule.name.toLowerCase();
    if (!seenNames.has(key) && rule.keywords.length > 0) {
      seenNames.add(key);
      uniqueRules.push(rule);
    }
  }
  
  // Create dir if not exists
  const dir = path.dirname(outputJsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outputJsonPath, JSON.stringify(uniqueRules, null, 2));
  console.log(`Successfully compiled ${uniqueRules.length} rules to ${outputJsonPath}`);
}

main().catch(console.error);
