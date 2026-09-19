const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');

async function purge() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  if (!fs.existsSync(dbPath)) {
    console.log('No DB at', dbPath);
    return;
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // 1. Check before counts
  const beforeCounts = db.exec(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN p.location_name IS NOT NULL AND p.location_name != '' THEN 1 ELSE 0 END) as has_loc,
      SUM(CASE WHEN e.gps_lat IS NOT NULL THEN 1 ELSE 0 END) as has_gps,
      SUM(CASE WHEN (p.location_name IS NOT NULL AND p.location_name != '') AND e.gps_lat IS NULL THEN 1 ELSE 0 END) as loc_without_gps
    FROM photos p
    LEFT JOIN exif_data e ON p.id = e.photo_id
  `);
  console.log('BEFORE PURGE:', beforeCounts[0].columns, beforeCounts[0].values);

  // 2. HARD PURGE: Clear location_name for all photos without real EXIF GPS
  db.run(`
    UPDATE photos 
    SET location_name = NULL 
    WHERE location_name IS NOT NULL 
      AND id NOT IN (SELECT photo_id FROM exif_data WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL)
  `);

  // 3. Check after counts
  const afterCounts = db.exec(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN p.location_name IS NOT NULL AND p.location_name != '' THEN 1 ELSE 0 END) as has_loc,
      SUM(CASE WHEN e.gps_lat IS NOT NULL THEN 1 ELSE 0 END) as has_gps,
      SUM(CASE WHEN (p.location_name IS NOT NULL AND p.location_name != '') AND e.gps_lat IS NULL THEN 1 ELSE 0 END) as loc_without_gps
    FROM photos p
    LEFT JOIN exif_data e ON p.id = e.photo_id
  `);
  console.log('AFTER PURGE:', afterCounts[0].columns, afterCounts[0].values);

  const remainingLocs = db.exec(`
    SELECT p.location_name, COUNT(*) 
    FROM photos p
    WHERE p.location_name IS NOT NULL AND p.location_name != ''
    GROUP BY p.location_name
  `);
  console.log('REMAINING LOCATIONS (All backed by verified EXIF GPS):', remainingLocs.length ? remainingLocs[0].values : 'None');

  // 4. Save back to disk
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log('Successfully saved cleaned database to', dbPath);
}

purge().catch(console.error);
