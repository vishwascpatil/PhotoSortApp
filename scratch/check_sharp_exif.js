const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const exifReader = require('exif-reader');

async function checkAll() {
  const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  const files = fs.readdirSync(folder);
  let exifCount = 0;
  let hasGps = 0;
  const sampleWithExif = [];

  for (const f of files) {
    const full = path.join(folder, f);
    try {
      const meta = await sharp(full).metadata();
      if (meta && meta.exif) {
        exifCount++;
        const parsed = exifReader(meta.exif);
        if (parsed.gps && parsed.gps.GPSLatitude) {
          hasGps++;
          sampleWithExif.push({ file: f, gps: parsed.gps });
        }
      }
    } catch (e) {}
  }
  console.log(`Files with EXIF: ${exifCount} / ${files.length}`);
  console.log(`Files with GPS in EXIF: ${hasGps} / ${files.length}`);
  console.log('Sample GPS:', sampleWithExif.slice(0, 5));
}
checkAll().catch(console.error);
