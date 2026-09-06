const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('../node_modules/sql.js');

async function test() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const unanalyzed = db.exec(`
    SELECT COUNT(*) as count 
    FROM photos p 
    LEFT JOIN photo_fingerprints fp ON p.id = fp.photo_id 
    WHERE p.is_trashed = 0 AND (fp.photo_id IS NULL OR fp.dhash IS NULL OR fp.dhash = '')
  `);
  console.log('Unanalyzed count:', unanalyzed[0].values[0][0]);

  const t0 = Date.now();
  const fps = db.exec(`
    SELECT p.id as photoId, p.file_path as filePath, p.file_size as fileSize, p.mime_type as mimeType,
           p.width, p.height, p.created_at as createdAt, p.thumbnail_path as thumbnailPath, p.perceptual_hash as legacyHash,
           fp.sha256, fp.partial_sha256 as partialSha256, fp.phash, fp.dhash, fp.ahash, fp.block_hash as blockHash
    FROM photos p
    LEFT JOIN photo_fingerprints fp ON p.id = fp.photo_id
    WHERE p.is_trashed = 0
  `);
  console.log('Query time:', Date.now() - t0, 'ms, rows:', fps[0].values.length);
}
test();
