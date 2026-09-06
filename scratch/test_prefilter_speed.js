const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const sharp = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sharp');

const REAL_DOC_FILES = new Set([
  'BDRC0330.JPG',
  'FZQB2179.JPG',
  'IMG_4762.JPG',
  'IMG_5621.PNG',
  'IMG_5622.JPG',
  'IMG_6190.PNG',
  'UOZG9928.JPG',
  'WQCS1135.JPG'
]);

async function isCandidate(photo) {
  try {
    if (photo.mime_type && photo.mime_type.startsWith('video')) return false;
    const filename = (photo.filename || '').toLowerCase();
    const filePath = photo.thumbnail_path || photo.preview_path || photo.file_path;
    if (!filePath || !fs.existsSync(filePath)) return false;

    // Filename quick-pass
    const hasDocName = [
      'aadhaar', 'aadhar', 'pancard', 'pan_card', 'passport', 'voter_id',
      'driving_licence', 'driving_license', 'marksheet', 'certificate',
      'invoice', 'receipt', 'tax_invoice', 'salary_slip', 'payslip',
      'bank_statement', 'passbook', 'electricity_bill', 'water_bill',
      'rc_book', 'vehicle_rc', 'puc'
    ].some(kw => filename.includes(kw)) || filename.endsWith('.pdf');

    if (hasDocName) return true;

    // Check stats on small 120px thumbnail
    const stats = await sharp(filePath, { failOn: 'none' })
      .resize(120, 120, { fit: 'inside' })
      .stats();

    if (!stats.channels || stats.channels.length < 3) return true;

    const r = stats.channels[0].mean;
    const g = stats.channels[1].mean;
    const b = stats.channels[2].mean;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
    const brightness = (r + g + b) / 3;

    // Photos with vibrant colors (saturation > 25%) or very dark (brightness < 40) are NOT documents
    if (saturation > 0.25 || brightness < 40) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const res = db.exec("SELECT id, filename, file_path, thumbnail_path, preview_path, mime_type FROM photos WHERE is_trashed = 0");
  const cols = res[0].columns;
  const rows = res[0].values.map(v => {
    const obj = {};
    cols.forEach((col, idx) => { obj[col] = v[idx]; });
    return obj;
  });

  console.log(`Analyzing ${rows.length} photos with color-saturation & brightness gate...`);
  const t0 = Date.now();

  let candidates = [];
  let missedReal = [];

  const BATCH_SIZE = 30;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async p => ({ photo: p, cand: await isCandidate(p) })));
    for (const r of results) {
      if (r.cand) {
        candidates.push(r.photo.filename);
      } else if (REAL_DOC_FILES.has(r.photo.filename)) {
        missedReal.push(r.photo.filename);
      }
    }
  }

  const elapsed = Date.now() - t0;
  console.log(`Pre-filter finished in ${(elapsed / 1000).toFixed(2)}s!`);
  console.log(`Total Candidates: ${candidates.length} out of ${rows.length} (${((rows.length - candidates.length) / rows.length * 100).toFixed(1)}% filtered out!)`);
  console.log(`Missed any real documents?`, missedReal.length === 0 ? 'NONE! ALL 8 REAL DOCS PRESERVED!' : missedReal);
}

main().catch(console.error);
