const fs = require('fs');
const path = require('path');

const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
const files = fs.readdirSync(folder);

// Check if any filenames contain keywords
const keywords = ['hampi', 'kolhapur', 'lalbagh', 'lal', 'bagh', 'gobbi', 'gobi', 'goodu', 'basavanagudi', 'bangalore', 'blr'];
const matches = files.filter(f => keywords.some(k => f.toLowerCase().includes(k)));
console.log('Filename matches:', matches);

// Check dates across all 1425 files using fs.stat or exif DateTimeOriginal
const sharp = require('sharp');
const exifReader = require('exif-reader');

async function findDatesAndCameras() {
  const dateMap = {};
  const makeModels = {};

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = path.extname(f).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;

    try {
      const m = await sharp(path.join(folder, f), { failOn: 'none' }).metadata();
      if (m && m.exif) {
        const p = exifReader(m.exif);
        const dt = p.Photo?.DateTimeOriginal || p.Image?.DateTime;
        if (dt) {
          const dStr = dt instanceof Date ? dt.toISOString().slice(0, 10) : String(dt).slice(0, 10).replace(/:/g, '-');
          if (!dateMap[dStr]) dateMap[dStr] = [];
          dateMap[dStr].push(f);
        }
        const model = p.Image?.Model || 'Unknown';
        makeModels[model] = (makeModels[model] || 0) + 1;
      }
    } catch(e) {}
  }

  console.log('Camera models:', makeModels);
  console.log('Unique dates found in EXIF:', Object.keys(dateMap).sort());
  for (const [d, flist] of Object.entries(dateMap).sort()) {
    console.log(`Date: ${d} -> ${flist.length} photos (e.g. ${flist.slice(0, 4).join(', ')})`);
  }
}

findDatesAndCameras().catch(console.error);
