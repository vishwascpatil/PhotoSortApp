const fs = require('fs');
const path = require('path');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');

const dbPath = path.join(process.env.APPDATA, 'photovault', 'photovault.db');
initSqlJs().then(async SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // 1. Check photos from "17 pro max-backup" in DB
  const dbPhotos = db.exec(`
    SELECT p.id, p.filename, p.created_at, p.location_name, e.gps_lat, e.gps_lon, p.file_path
    FROM photos p
    LEFT JOIN exif_data e ON p.id = e.photo_id
    WHERE p.file_path LIKE '%17 pro max-backup%'
    LIMIT 50
  `)[0]?.values || [];

  console.log(`Photos from '17 pro max-backup' in DB: ${dbPhotos.length}`);
  if (dbPhotos.length > 0) {
    console.log('Sample photos in DB:', JSON.stringify(dbPhotos.slice(0, 10), null, 2));
  }

  // Check how many have GPS in DB
  const gpsInDb = db.exec(`
    SELECT count(*)
    FROM photos p
    JOIN exif_data e ON p.id = e.photo_id
    WHERE p.file_path LIKE '%17 pro max-backup%' AND e.gps_lat IS NOT NULL
  `)[0]?.values[0][0];
  console.log(`Photos from '17 pro max-backup' with GPS in DB: ${gpsInDb}`);

  // 2. Check files on disk directly in C:\Users\vishw\Downloads\17 pro max-backup
  const folderPath = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    console.log(`Total files on disk in ${folderPath}: ${files.length}`);
    console.log('Sample filenames on disk:', files.slice(0, 20));

    // Let's inspect EXIF of first 20 images on disk using exifr or sharp
    const exifr = require('exifr');
    let diskGpsCount = 0;
    const sampleDiskGps = [];

    for (const f of files.slice(0, 50)) {
      const fullPath = path.join(folderPath, f);
      try {
        const gps = await exifr.gps(fullPath);
        if (gps && gps.latitude) {
          diskGpsCount++;
          sampleDiskGps.push({ file: f, lat: gps.latitude, lon: gps.longitude });
        }
      } catch (e) {}
    }
    console.log(`GPS found in sample of 50 disk files: ${diskGpsCount}`);
    console.log('Sample disk GPS coordinates:', sampleDiskGps);
  } else {
    console.log(`Folder does not exist: ${folderPath}`);
  }
});
