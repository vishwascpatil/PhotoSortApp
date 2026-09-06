const sharp = require('sharp');
const exifReader = require('exif-reader');
const fs = require('fs');
const path = require('path');

const folder = 'C:/Users/vishw/Downloads/17 pro max-backup';
const files = fs.readdirSync(folder);

async function run() {
  let totalWithExif = 0;
  let gpsCount = 0;
  const found = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = path.extname(f).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;

    try {
      const m = await sharp(path.join(folder, f), { failOn: 'none' }).metadata();
      if (m && m.exif) {
        totalWithExif++;
        const p = exifReader(m.exif);
        if (p && p.GPS && p.GPS.GPSLatitude) {
          gpsCount++;
          found.push({ file: f, lat: p.GPS.GPSLatitude, lon: p.GPS.GPSLongitude, date: p.Photo?.DateTimeOriginal });
        }
      }
    } catch(e) {}
  }

  console.log(`Finished checking image files! Total with EXIF: ${totalWithExif}, Total with GPS: ${gpsCount}`);
  if (found.length > 0) {
    console.log('Sample found with GPS:', found.slice(0, 10));
  }
}

run().catch(console.error);
