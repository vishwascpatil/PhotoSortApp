const exifr = require('exifr');
const path = require('path');
const fs = require('fs');

async function testExif() {
  const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  const files = fs.readdirSync(folder).slice(0, 10);
  for (const f of files) {
    const full = path.join(folder, f);
    const all = await exifr.parse(full);
    console.log(f, 'keys:', Object.keys(all || {}));
    if (all) {
      console.log('  Make:', all.Make, 'Model:', all.Model, 'Date:', all.DateTimeOriginal || all.CreateDate);
      console.log('  GPS:', all.latitude, all.longitude, all.GPSLatitude);
    }
  }
}
testExif().catch(console.error);
