const fs = require('fs');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'photovault', 'photovault.db');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const morningPhotos = db.exec(`
    SELECT p.id, p.filename, p.created_at, e.gps_lat, e.gps_lon
    FROM photos p
    LEFT JOIN exif_data e ON p.id = e.photo_id
    WHERE p.created_at LIKE '2021-10-14%'
    ORDER BY p.created_at ASC
  `)[0]?.values || [];
  console.log('2021-10-14 photos:', JSON.stringify(morningPhotos, null, 2));
});
