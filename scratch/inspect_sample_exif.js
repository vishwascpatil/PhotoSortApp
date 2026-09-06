const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const exifReader = require('exif-reader');

async function inspectSample() {
  const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  const sample = ['IMG_4763.JPG', 'IMG_4787.JPG', 'IMG_4788.JPG', 'IMG_4789.JPG', 'IMG_4790.JPG'];
  for (const f of sample) {
    const full = path.join(folder, f);
    const meta = await sharp(full).metadata();
    if (meta.exif) {
      const parsed = exifReader(meta.exif);
      console.log(f, ':');
      console.log('  Image:', parsed.image);
      console.log('  Photo:', parsed.photo);
      console.log('  GPS:', parsed.gps);
    }
  }
}
inspectSample().catch(console.error);
