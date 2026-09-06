const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.dng', '.raw', '.cr2', '.cr3',
  '.nef', '.arw', '.rw2', '.orf', '.webp', '.tiff', '.tif', '.bmp', '.gif',
  '.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv', '.3gp', '.wmv', '.flv'
]);

function scanFolderDisk(folderPath) {
  let mediaCount = 0;
  let mediaBytes = 0;
  const nonMedia = [];
  let totalBytes = 0;

  function walk(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            const ext = path.extname(entry.name).toLowerCase();
            totalBytes += stat.size;
            if (MEDIA_EXTENSIONS.has(ext)) {
              mediaCount++;
              mediaBytes += stat.size;
            } else {
              nonMedia.push({
                filename: entry.name,
                relativePath: path.relative(folderPath, fullPath),
                extension: ext || '(none)',
                size: stat.size
              });
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
  }

  walk(folderPath);

  return {
    totalDiskFiles: mediaCount + nonMedia.length,
    mediaFilesOnDisk: mediaCount,
    mediaBytes,
    nonMediaFilesCount: nonMedia.length,
    nonMediaFiles: nonMedia,
    totalDiskBytes: totalBytes
  };
}

app.whenReady().then(async () => {
  const dbDir = path.join(app.getPath('appData'), 'photosort');
  const dbPath = path.join(dbDir, 'photovault.db');
  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);

  const stmt = db.prepare('SELECT id, file_path, filename, file_size FROM photos WHERE is_trashed = 0');
  const photos = [];
  while (stmt.step()) {
    photos.push(stmt.getAsObject());
  }
  stmt.free();

  const sourceFolder = 'C:/Users/vishw/Downloads/17 pro max-backup';
  console.log(`Scanning source folder on disk: ${sourceFolder}...`);
  const t0 = Date.now();
  const diskScan = scanFolderDisk(sourceFolder);
  const tDisk = Date.now() - t0;
  console.log(`Disk scan done in ${tDisk}ms:`, {
    totalFiles: diskScan.totalDiskFiles,
    mediaFiles: diskScan.mediaFilesOnDisk,
    nonMediaCount: diskScan.nonMediaFilesCount,
    totalBytes: diskScan.totalDiskBytes
  });

  // Verify photos against disk
  let matchedCount = 0;
  let originalBytes = 0;
  let missing = [];
  for (const p of photos) {
    if (fs.existsSync(p.file_path)) {
      matchedCount++;
      originalBytes += p.file_size || 0;
    } else {
      missing.push({ id: p.id, filename: p.filename, originalPath: p.file_path, reason: 'Source missing on disk' });
    }
  }

  console.log(`Audit result: matched ${matchedCount} of ${photos.length} photos, ${originalBytes} bytes, missing: ${missing.length}`);
  console.log(`Counts match: ${matchedCount === photos.length}`);
  app.quit();
});
