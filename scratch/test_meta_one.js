const sharp = require('sharp');
const exifReader = require('exif-reader');
const path = require('path');
const fs = require('fs');

async function testOne() {
  const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  const files = fs.readdirSync(folder).slice(0, 15);
  for (const f of files) {
    const full = path.join(folder, f);
    try {
      const meta = await sharp(full).metadata();
      console.log(f, 'has exif:', Boolean(meta.exif), 'format:', meta.format);
      if (meta.exif) {
        const parsed = exifReader(meta.exif);
        console.log('  parsed sections:', Object.keys(parsed));
        console.log('  image:', parsed.image);
        console.log('  photo:', parsed.photo);
      }
    } catch (e) {
      console.log(f, 'error:', e.message);
    }
  }
}
testOne().catch(console.error);
