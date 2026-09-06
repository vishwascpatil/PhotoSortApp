const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('../node_modules/sql.js');

async function test() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const unanalyzed = db.exec(`
    SELECT p.id, p.filename, p.file_path, p.mime_type, p.file_size, p.thumbnail_path
    FROM photos p 
    LEFT JOIN photo_fingerprints fp ON p.id = fp.photo_id 
    WHERE p.is_trashed = 0 AND (fp.photo_id IS NULL OR fp.dhash IS NULL OR fp.dhash = '')
  `);
  
  const rows = unanalyzed[0].values;
  console.log('Total unanalyzed:', rows.length);
  console.log('Sample unanalyzed:', rows.slice(0, 10));

  // Check how many of them exist on disk
  let missingOnDisk = 0;
  let videoCount = 0;
  for (const r of rows) {
    const fp = r[2];
    if (!fs.existsSync(fp)) missingOnDisk++;
    if (r[3]?.startsWith('video') || ['.mp4', '.mov', '.mkv'].some(e => r[1]?.toLowerCase()?.endsWith(e))) videoCount++;
  }
  console.log('Missing on disk:', missingOnDisk);
  console.log('Videos count:', videoCount);
}
test();
