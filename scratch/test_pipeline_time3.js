const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('../node_modules/sql.js');

async function test() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const t0 = Date.now();
  const allPhotos = db.exec('SELECT * FROM photos WHERE is_trashed = 0 ORDER BY created_at DESC');
  console.log('Query all photos:', Date.now() - t0, 'ms. Count:', allPhotos[0].values.length);

  const t1 = Date.now();
  const fpsRes = db.exec(`
    SELECT p.id as photoId, p.file_path as filePath, p.file_size as fileSize, p.mime_type as mimeType,
           p.width, p.height, p.created_at as createdAt, p.thumbnail_path as thumbnailPath, p.perceptual_hash as legacyHash,
           fp.sha256, fp.partial_sha256 as partialSha256, fp.phash, fp.dhash, fp.ahash, fp.block_hash as blockHash,
           COALESCE(fp.color_histogram, fp.rgb_histogram) as colorHistogramJson, fp.video_duration as videoDuration, fp.video_keyframes as videoKeyframesJson
    FROM photos p
    LEFT JOIN photo_fingerprints fp ON p.id = fp.photo_id
    WHERE p.is_trashed = 0
  `);
  console.log('Query fingerprints:', Date.now() - t1, 'ms. Count:', fpsRes[0].values.length);
}
test();
