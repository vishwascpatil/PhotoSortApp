const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const heicConvert = require('heic-convert');

async function findExactCorruptHeic() {
  const SQL = await initSqlJs();
  const dbp = 'C:\\Users\\vishw\\AppData\\Roaming\\photosort\\photovault.db';
  const db = new SQL.Database(fs.readFileSync(dbp));
  const res = db.exec("SELECT id, file_path, file_size FROM photos WHERE LOWER(file_path) LIKE '%.heic' OR LOWER(file_path) LIKE '%.heif'");
  if (!res.length || !res[0].values) {
    console.log('No photos');
    return;
  }
  const rows = res[0].values;
  console.log(`Checking ${rows.length} HEIC files with heicConvert...`);

  for (const [id, filePath, fileSize] of rows) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const buf = fs.readFileSync(filePath);
      await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.1 });
    } catch (err) {
      console.log(`>>> FOUND TARGET FILE: ${filePath} (ID: ${id}, Size: ${fileSize}) -> ${err.message}`);
    }
  }
  console.log('Done scanning.');
}

findExactCorruptHeic();


