const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const sharp = require('sharp');
const exifReader = require('exif-reader');

function convertDMSToDecimal(dms, ref) {
  if (!dms || !Array.isArray(dms) || dms.length !== 3) return undefined;
  let decimal = dms[0] + (dms[1] / 60) + (dms[2] / 3600);
  if (ref && (ref.toUpperCase() === 'S' || ref.toUpperCase() === 'W')) {
    decimal = -decimal;
  }
  return decimal;
}

async function run() {
  const userData = path.join(require('os').homedir(), 'AppData', 'Roaming', 'photo-sort');
  const dbFile = path.join(userData, 'photovault.db');
  
  if (!fs.existsSync(dbFile)) {
    console.log('DB not found at', dbFile);
    return;
  }
  
  console.log('Opening DB', dbFile);
  
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbFile);
  const db = new SQL.Database(fileBuffer);
  
  const results = db.exec('SELECT id, file_path FROM photos');
  if (!results.length) {
    console.log('No photos found.');
    return;
  }
  
  const photos = results[0].values.map(row => ({ id: row[0], file_path: row[1] }));
  console.log(`Scanning ${photos.length} photos for EXIF repair...`);
  
  let repaired = 0;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!fs.existsSync(p.file_path)) continue;
    
    try {
      const metadata = await sharp(p.file_path).metadata();
      if (metadata.exif) {
        const parsed = exifReader(metadata.exif);
        if (parsed.gps) {
          const lat = convertDMSToDecimal(parsed.gps.GPSLatitude, parsed.gps.GPSLatitudeRef);
          const lon = convertDMSToDecimal(parsed.gps.GPSLongitude, parsed.gps.GPSLongitudeRef);
          if (lat !== undefined && lon !== undefined) {
            db.run('UPDATE exif_data SET gps_lat = ?, gps_lon = ? WHERE photo_id = ?', [lat, lon, p.id]);
            repaired++;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  
  if (repaired > 0) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFile, buffer);
  }
  
  console.log(`Finished repairing EXIF data! Repaired ${repaired} photos.`);
}

run();
