const fs = require('fs');
const path = require('path');

const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
const files = fs.readdirSync(folder);

const prefixes = {};
files.forEach(f => {
  const m = f.match(/^[A-Za-z_-]+/);
  const p = m ? m[0] : 'other';
  prefixes[p] = (prefixes[p] || 0) + 1;
});

console.log('Total files:', files.length);
console.log('Prefixes:', Object.entries(prefixes).slice(0, 30));

// Check if any file starts with IMG or has numbers
const imgFiles = files.filter(f => f.toUpperCase().startsWith('IMG'));
console.log('Files starting with IMG:', imgFiles.length, imgFiles.slice(0, 10));

// Check if ANY file has exif
const sharp = require('sharp');
async function findAnyExif() {
  let count = 0;
  for (const f of files) {
    try {
      const meta = await sharp(path.join(folder, f)).metadata();
      if (meta.exif) {
        count++;
        console.log('Found EXIF in:', f);
        if (count >= 5) break;
      }
    } catch (e) {}
  }
  console.log('Total files with EXIF found:', count);
}
findAnyExif().catch(console.error);
