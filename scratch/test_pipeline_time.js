const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('../node_modules/sql.js');

async function test() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Let's test candidate generation and evaluation
  const fpsRes = db.exec(`
    SELECT p.id as photoId, p.file_path as filePath, p.file_size as fileSize, p.mime_type as mimeType,
           p.width, p.height, p.created_at as createdAt, p.thumbnail_path as thumbnailPath,
           fp.sha256, fp.partial_sha256 as partialSha256, fp.phash, fp.dhash, fp.ahash, fp.block_hash as blockHash
    FROM photos p
    LEFT JOIN photo_fingerprints fp ON p.id = fp.photo_id
    WHERE p.is_trashed = 0
  `);

  const cols = fpsRes[0].columns;
  const records = fpsRes[0].values.map(r => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = r[i]);
    return obj;
  });

  console.log('Total records:', records.length);

  // Measure Candidate Pair Generation
  const t0 = Date.now();
  const candidateMap = new Map();
  const addPair = (id1, id2) => {
    if (id1 === id2) return;
    const minId = Math.min(id1, id2);
    const maxId = Math.max(id1, id2);
    const key = `${minId}`;
    if (!candidateMap.has(key)) candidateMap.set(key, new Set());
    candidateMap.get(key).add(maxId);
  };

  const exactSizeBuckets = new Map();
  const shaBuckets = new Map();
  const lshBand1 = new Map();
  const lshBand2 = new Map();
  const lshBand3 = new Map();
  const lshBand4 = new Map();

  records.forEach(rec => {
    if (rec.fileSize > 0) {
      const sKey = `size_${rec.fileSize}`;
      if (!exactSizeBuckets.has(sKey)) exactSizeBuckets.set(sKey, []);
      exactSizeBuckets.get(sKey).push(rec.photoId);
    }
    if (rec.partialSha256) {
      const pKey = `p_${rec.partialSha256}`;
      if (!shaBuckets.has(pKey)) shaBuckets.set(pKey, []);
      shaBuckets.get(pKey).push(rec.photoId);
    }
    const h = rec.dhash;
    if (h && h.length === 64) {
      const b1 = h.substring(0, 16);
      const b2 = h.substring(16, 32);
      const b3 = h.substring(32, 48);
      const b4 = h.substring(48, 64);
      if (!lshBand1.has(b1)) lshBand1.set(b1, []);
      lshBand1.get(b1).push(rec.photoId);
      if (!lshBand2.has(b2)) lshBand2.set(b2, []);
      lshBand2.get(b2).push(rec.photoId);
      if (!lshBand3.has(b3)) lshBand3.set(b3, []);
      lshBand3.get(b3).push(rec.photoId);
      if (!lshBand4.has(b4)) lshBand4.set(b4, []);
      lshBand4.get(b4).push(rec.photoId);
    }
  });

  const pairUp = (bucket) => {
    for (const ids of bucket.values()) {
      if (ids.length > 1 && ids.length < 500) {
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            addPair(ids[i], ids[j]);
          }
        }
      }
    }
  };

  pairUp(exactSizeBuckets);
  pairUp(shaBuckets);
  pairUp(lshBand1);
  pairUp(lshBand2);
  pairUp(lshBand3);
  pairUp(lshBand4);

  let totalPairs = 0;
  candidateMap.forEach(set => totalPairs += set.size);
  console.log('Candidate pairs generation took:', Date.now() - t0, 'ms. Total candidate pairs:', totalPairs);
}
test();
