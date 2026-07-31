"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const initSqlJs = require("sql.js");
const fs = require("fs");
const promises = require("fs/promises");
const sharp = require("sharp");
const exifReader = require("exif-reader");
const os = require("os");
const crypto = require("crypto");
const ffmpegPath = require("ffmpeg-static");
const child_process = require("child_process");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
let db = null;
let dbPath = "";
let saveTimer = null;
function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDatabase();
  }, 1e3);
}
function saveDatabase() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error("Failed to save database:", err);
  }
}
async function initDatabase() {
  const dbDir = electron.app.getPath("userData");
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  dbPath = path.join(dbDir, "photovault.db");
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  createTables();
  cleanupOrphanedPhotos();
  cleanupOrphanedPeople();
  rebuildExifData();
  saveDatabase();
}
function cleanupOrphanedPhotos() {
  runSql("DELETE FROM photo_people WHERE photo_id NOT IN (SELECT id FROM photos)");
  runSql("DELETE FROM face_descriptors WHERE photo_id NOT IN (SELECT id FROM photos)");
  const { unlinkSync, existsSync: existsSync2 } = require("fs");
  const photos = queryAll(`
    SELECT id, thumbnail_path, preview_path FROM photos 
    WHERE source_folder_path IS NOT NULL 
    AND source_folder_path != ''
    AND source_folder_path NOT IN (SELECT folder_path FROM imported_folders)
  `);
  if (photos.length > 0) {
    for (const photo of photos) {
      if (photo.thumbnail_path && existsSync2(photo.thumbnail_path)) {
        try {
          unlinkSync(photo.thumbnail_path);
        } catch {
        }
      }
      if (photo.preview_path && existsSync2(photo.preview_path)) {
        try {
          unlinkSync(photo.preview_path);
        } catch {
        }
      }
    }
    const ids = photos.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 900) {
      const chunk = ids.slice(i, i + 900);
      const placeholders = chunk.map(() => "?").join(",");
      runSql(`DELETE FROM photos WHERE id IN (${placeholders})`, chunk);
    }
  }
}
function createTables() {
  const database2 = getDb();
  database2.run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      thumbnail_path TEXT,
      preview_path TEXT,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      file_size INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_trashed INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      source_folder_path TEXT,
      trashed_at TEXT,
      rating INTEGER DEFAULT 0,
      orientation INTEGER DEFAULT 1,
      faces_scanned INTEGER NOT NULL DEFAULT 0,
      blur_score REAL DEFAULT -1,
      perceptual_hash TEXT DEFAULT '',
      extracted_text TEXT DEFAULT '',
      is_document INTEGER DEFAULT 0,
      document_category TEXT DEFAULT NULL,
      location_name TEXT DEFAULT NULL
    )
  `);
  try {
    database2.run("ALTER TABLE photos ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0");
  } catch {
  }
  try {
    database2.run('ALTER TABLE photos ADD COLUMN description TEXT DEFAULT ""');
  } catch {
  }
  try {
    database2.run("ALTER TABLE photos ADD COLUMN source_folder_path TEXT");
  } catch {
  }
  try {
    database2.run("ALTER TABLE photos ADD COLUMN faces_scanned INTEGER NOT NULL DEFAULT 0");
  } catch {
  }
  try {
    database2.run("ALTER TABLE photos ADD COLUMN blur_score REAL DEFAULT -1");
  } catch {
  }
  try {
    database2.run('ALTER TABLE photos ADD COLUMN perceptual_hash TEXT DEFAULT ""');
  } catch {
  }
  try {
    database2.run('ALTER TABLE photos ADD COLUMN extracted_text TEXT DEFAULT ""');
  } catch {
  }
  try {
    database2.run("ALTER TABLE photos ADD COLUMN is_document INTEGER DEFAULT 0");
  } catch {
  }
  try {
    database2.run("ALTER TABLE photos ADD COLUMN location_name TEXT DEFAULT NULL");
  } catch {
  }
  try {
    database2.run("ALTER TABLE photos ADD COLUMN document_category TEXT DEFAULT NULL");
  } catch {
  }
  try {
    database2.run("ALTER TABLE people ADD COLUMN cover_face_base64 TEXT");
  } catch {
  }
  try {
    database2.run("UPDATE photos SET extracted_text = '', is_document = 0, document_category = NULL");
  } catch (e) {
    console.error("reset fail 7", e);
  }
  database2.run(`
    CREATE TABLE IF NOT EXISTS imported_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_path TEXT NOT NULL UNIQUE,
      folder_name TEXT NOT NULL,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cover_photo_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS album_photos (
      album_id INTEGER NOT NULL,
      photo_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(album_id, photo_id),
      FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS exif_data (
      photo_id INTEGER PRIMARY KEY,
      make TEXT,
      model TEXT,
      iso INTEGER,
      f_number REAL,
      exposure_time TEXT,
      focal_length REAL,
      gps_lat REAL,
      gps_lon REAL,
      date_taken TEXT,
      lens_model TEXT,
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS photo_tags (
      photo_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY(photo_id, tag_id),
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cover_photo_id INTEGER,
      cover_face_base64 TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS photo_people (
      photo_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      PRIMARY KEY(photo_id, person_id),
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);
  database2.run(`
    CREATE TABLE IF NOT EXISTS face_descriptors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      descriptor TEXT NOT NULL,
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_photos_is_favorite ON photos(is_favorite)",
    "CREATE INDEX IF NOT EXISTS idx_photos_is_archived ON photos(is_archived)",
    "CREATE INDEX IF NOT EXISTS idx_photos_is_trashed ON photos(is_trashed)",
    "CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos(filename)",
    "CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos(album_id)",
    "CREATE INDEX IF NOT EXISTS idx_album_photos_photo ON album_photos(photo_id)",
    "CREATE INDEX IF NOT EXISTS idx_exif_model ON exif_data(model)",
    "CREATE INDEX IF NOT EXISTS idx_exif_date ON exif_data(date_taken)"
  ];
  for (const sql of indexes) {
    try {
      database2.run(sql);
    } catch {
    }
  }
}
async function rebuildExifData() {
  try {
    let convertDMSToDecimal2 = function(dms, ref) {
      if (!dms || !Array.isArray(dms) || dms.length !== 3) return void 0;
      let decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
      if (ref && (ref.toUpperCase() === "S" || ref.toUpperCase() === "W")) {
        decimal = -decimal;
      }
      return decimal;
    };
    const photos = queryAll(`
      SELECT p.id, p.file_path 
      FROM photos p 
      LEFT JOIN exif_data e ON p.id = e.photo_id 
      WHERE e.gps_lat IS NULL OR e.photo_id IS NULL
    `);
    if (photos.length === 0) return;
    const { existsSync: existsSync2 } = require("fs");
    const sharp2 = require("sharp");
    const exifReader2 = require("exif-reader");
    for (const photo of photos) {
      if (!photo.file_path || !existsSync2(photo.file_path)) continue;
      try {
        const metadata = await sharp2(photo.file_path, { failOn: "none" }).metadata();
        if (metadata && metadata.exif) {
          const parsed = exifReader2(metadata.exif);
          const photoObj = parsed.Photo || parsed.exif || parsed.image || {};
          const imageObj = parsed.Image || parsed.image || {};
          const gpsObj = parsed.GPSInfo || parsed.gps || {};
          const lat = convertDMSToDecimal2(gpsObj.GPSLatitude, gpsObj.GPSLatitudeRef);
          const lon = convertDMSToDecimal2(gpsObj.GPSLongitude, gpsObj.GPSLongitudeRef);
          if (lat !== void 0 && lon !== void 0) {
            const make = imageObj.Make;
            const model = imageObj.Model;
            const iso = photoObj.ISO;
            const fNumber = photoObj.FNumber;
            const exposureTime = photoObj.ExposureTime ? `1/${Math.round(1 / photoObj.ExposureTime)}` : void 0;
            const focalLength = photoObj.FocalLength;
            const lensModel = photoObj.LensModel;
            const dateTaken = photoObj.DateTimeOriginal || photoObj.DateTimeDigitized || null;
            const dateStr = dateTaken instanceof Date ? dateTaken.toISOString() : null;
            runSql(`
              INSERT INTO exif_data (photo_id, make, model, iso, f_number, exposure_time, focal_length, gps_lat, gps_lon, date_taken, lens_model)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(photo_id) DO UPDATE SET
                make = COALESCE(excluded.make, exif_data.make),
                model = COALESCE(excluded.model, exif_data.model),
                gps_lat = excluded.gps_lat,
                gps_lon = excluded.gps_lon
            `, [photo.id, make || null, model || null, iso || null, fNumber || null, exposureTime || null, focalLength || null, lat, lon, dateStr, lensModel || null]);
          }
        }
      } catch {
      }
    }
    saveDatabase();
  } catch (err) {
    console.error("rebuildExifData error:", err);
  }
}
function queryAll(sql, params = []) {
  const database2 = getDb();
  const stmt = database2.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0];
}
function runSql(sql, params = []) {
  const database2 = getDb();
  database2.run(sql, params);
  scheduleSave();
}
function insertPhoto(photo) {
  try {
    const existing = queryOne("SELECT id FROM photos WHERE file_path = ?", [photo.file_path]);
    if (existing && existing.id > 0) {
      if (photo.source_folder_path) {
        runSql("UPDATE photos SET source_folder_path = ? WHERE id = ?", [photo.source_folder_path, existing.id]);
      }
      return existing.id;
    }
    const database2 = getDb();
    database2.run(
      `INSERT INTO photos (file_path, thumbnail_path, preview_path, filename, mime_type, width, height, file_size, created_at, orientation, source_folder_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        photo.file_path,
        photo.thumbnail_path || null,
        photo.preview_path || null,
        photo.filename,
        photo.mime_type,
        photo.width,
        photo.height,
        photo.file_size,
        photo.created_at,
        photo.orientation || 1,
        photo.source_folder_path || null
      ]
    );
    const row = queryOne("SELECT last_insert_rowid() as id");
    scheduleSave();
    return row?.id || 0;
  } catch (err) {
    console.error("insertPhoto failed:", err);
    return 0;
  }
}
function insertExif(exif) {
  runSql(
    `INSERT OR REPLACE INTO exif_data (photo_id, make, model, iso, f_number, exposure_time, focal_length, gps_lat, gps_lon, date_taken, lens_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      exif.photo_id,
      exif.make || null,
      exif.model || null,
      exif.iso || null,
      exif.f_number || null,
      exif.exposure_time || null,
      exif.focal_length || null,
      exif.gps_lat || null,
      exif.gps_lon || null,
      exif.date_taken || null,
      exif.lens_model || null
    ]
  );
}
function insertPhotoBatch(photos) {
  const database2 = getDb();
  const inserted = [];
  database2.run("BEGIN TRANSACTION");
  try {
    for (const { photo, exif } of photos) {
      const id = insertPhoto(photo);
      if (id > 0) {
        if (exif) {
          insertExif({ ...exif, photo_id: id });
        }
        inserted.push({ id, filePath: photo.file_path });
      }
    }
    database2.run("COMMIT");
  } catch (err) {
    database2.run("ROLLBACK");
    console.error("Batch insert failed:", err);
  }
  saveDatabase();
  return inserted;
}
function updatePhotoThumbnails(id, thumbnailPath, previewPath) {
  runSql("UPDATE photos SET thumbnail_path = ?, preview_path = ? WHERE id = ?", [thumbnailPath, previewPath, id]);
}
function getPhotos(filter = {}) {
  const conditions = [];
  const params = [];
  if (filter.isLocked !== void 0) {
    conditions.push("p.is_locked = ?");
    params.push(filter.isLocked ? 1 : 0);
  } else {
    conditions.push("p.is_locked = 0");
  }
  if (filter.isTrashed !== void 0) {
    conditions.push("p.is_trashed = ?");
    params.push(filter.isTrashed ? 1 : 0);
  } else {
    conditions.push("p.is_trashed = 0");
  }
  if (filter.isFavorite !== void 0) {
    conditions.push("p.is_favorite = ?");
    params.push(filter.isFavorite ? 1 : 0);
  }
  if (filter.folderPath) {
    conditions.push("p.source_folder_path = ?");
    params.push(filter.folderPath);
  }
  if (filter.isArchived !== void 0) {
    conditions.push("p.is_archived = ?");
    params.push(filter.isArchived ? 1 : 0);
  } else if (!filter.isTrashed) {
    conditions.push("p.is_archived = 0");
  }
  let join2 = "";
  if (filter.albumId) {
    join2 = "INNER JOIN album_photos ap ON p.id = ap.photo_id";
    conditions.push("ap.album_id = ?");
    params.push(filter.albumId);
  }
  if (filter.search) {
    join2 += " LEFT JOIN exif_data e ON p.id = e.photo_id";
    conditions.push(`(
      p.filename LIKE ? 
      OR e.model LIKE ? 
      OR e.make LIKE ? 
      OR EXISTS (
        SELECT 1 FROM photo_people pp 
        JOIN people per ON pp.person_id = per.id 
        WHERE pp.photo_id = p.id AND per.name LIKE ?
      )
    )`);
    const searchTerm = `%${filter.search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ? `LIMIT ${filter.limit}` : "";
  const offset = filter.offset ? `OFFSET ${filter.offset}` : "";
  const sql = `SELECT p.* FROM photos p ${join2} ${where} ORDER BY p.created_at DESC ${limit} ${offset}`;
  return queryAll(sql, params);
}
function getGeoPhotos() {
  return queryAll(`
    SELECT p.*, e.gps_lat, e.gps_lon 
    FROM photos p 
    INNER JOIN exif_data e ON p.id = e.photo_id 
    WHERE e.gps_lat IS NOT NULL AND e.gps_lon IS NOT NULL AND p.is_trashed = 0
  `);
}
function getPhotoById(id) {
  return queryOne("SELECT * FROM photos WHERE id = ?", [id]);
}
function getExifByPhotoId(id) {
  return queryOne("SELECT * FROM exif_data WHERE photo_id = ?", [id]);
}
function toggleFavorite(id) {
  const photo = getPhotoById(id);
  if (!photo) return false;
  const newVal = photo.is_favorite ? 0 : 1;
  runSql("UPDATE photos SET is_favorite = ? WHERE id = ?", [newVal, id]);
  return newVal === 1;
}
function batchFavorite(ids, favorite) {
  const placeholders = ids.map(() => "?").join(",");
  runSql(`UPDATE photos SET is_favorite = ? WHERE id IN (${placeholders})`, [favorite ? 1 : 0, ...ids]);
}
function setArchived(ids, archived) {
  const placeholders = ids.map(() => "?").join(",");
  runSql(`UPDATE photos SET is_archived = ? WHERE id IN (${placeholders})`, [archived ? 1 : 0, ...ids]);
}
function setTrashed(ids, trashed) {
  const placeholders = ids.map(() => "?").join(",");
  if (trashed) {
    runSql(`UPDATE photos SET is_trashed = 1, trashed_at = datetime('now') WHERE id IN (${placeholders})`, ids);
  } else {
    runSql(`UPDATE photos SET is_trashed = 0, trashed_at = NULL WHERE id IN (${placeholders})`, ids);
  }
}
function deletePermanently(ids) {
  const { unlinkSync, existsSync: existsSync2 } = require("fs");
  const placeholders = ids.map(() => "?").join(",");
  const photos = queryAll(`SELECT file_path, thumbnail_path, preview_path FROM photos WHERE id IN (${placeholders})`, ids);
  for (const photo of photos) {
    try {
      if (photo.file_path && existsSync2(photo.file_path)) {
        unlinkSync(photo.file_path);
      }
      if (photo.thumbnail_path && existsSync2(photo.thumbnail_path)) {
        unlinkSync(photo.thumbnail_path);
      }
      if (photo.preview_path && existsSync2(photo.preview_path)) {
        unlinkSync(photo.preview_path);
      }
    } catch (err) {
      console.error("Failed to physically delete file from disk:", photo.file_path, err);
    }
  }
  runSql(`DELETE FROM photos WHERE id IN (${placeholders})`, ids);
  cleanupOrphanedPeople();
  saveDatabase();
}
function getPhotoCount(filter = {}) {
  const conditions = [];
  const params = [];
  if (filter.isTrashed !== void 0) {
    conditions.push("is_trashed = ?");
    params.push(filter.isTrashed ? 1 : 0);
  } else {
    conditions.push("is_trashed = 0");
  }
  if (filter.isFavorite) {
    conditions.push("is_favorite = 1");
  }
  if (filter.isArchived !== void 0) {
    conditions.push("is_archived = ?");
    params.push(filter.isArchived ? 1 : 0);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = queryOne(`SELECT COUNT(*) as count FROM photos ${where}`, params);
  return row?.count || 0;
}
function getTimeline() {
  return queryAll(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM photos
    WHERE is_trashed = 0 AND is_archived = 0
    GROUP BY date(created_at)
    ORDER BY date DESC
  `);
}
function getStats() {
  const photoStats = queryOne(`
    SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as size
    FROM photos WHERE is_trashed = 0
  `);
  const favCount = queryOne("SELECT COUNT(*) as count FROM photos WHERE is_favorite = 1 AND is_trashed = 0");
  const albumCount = queryOne("SELECT COUNT(*) as count FROM albums");
  return {
    totalPhotos: photoStats?.total || 0,
    totalSize: photoStats?.size || 0,
    favorites: favCount?.count || 0,
    albums: albumCount?.count || 0
  };
}
function getUnanalyzedPhotos() {
  return queryAll('SELECT * FROM photos WHERE is_trashed = 0 AND (blur_score = -1 OR perceptual_hash = "") ORDER BY created_at DESC');
}
function savePhotoAnalysis(photoId, blurScore, perceptualHash) {
  runSql("UPDATE photos SET blur_score = ?, perceptual_hash = ? WHERE id = ?", [blurScore, perceptualHash, photoId]);
}
function getUnscannedDocuments() {
  return queryAll('SELECT * FROM photos WHERE is_trashed = 0 AND (extracted_text = "" OR extracted_text = "ERROR") AND mime_type LIKE "image%" ORDER BY created_at DESC');
}
function saveDocumentScan(photoId, extractedText, isDocument, category = null) {
  const textToSave = extractedText.trim() === "" ? "NONE" : extractedText;
  runSql("UPDATE photos SET extracted_text = ?, is_document = ?, document_category = ? WHERE id = ?", [textToSave, isDocument ? 1 : 0, category, photoId]);
}
function getPhotosWithMissingLocation() {
  return queryAll(`
    SELECT p.*, e.gps_lat, e.gps_lon 
    FROM photos p 
    LEFT JOIN exif_data e ON p.id = e.photo_id 
    WHERE p.is_trashed = 0 AND (p.location_name IS NULL OR p.location_name = "" OR p.location_name = "Unknown Location")
    ORDER BY p.created_at DESC
  `);
}
function savePhotoLocation(photoId, locationName) {
  runSql("UPDATE photos SET location_name = ? WHERE id = ?", [locationName, photoId]);
}
function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) return 999;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const n1 = parseInt(hash1[i], 16);
    const n2 = parseInt(hash2[i], 16);
    let xor = n1 ^ n2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}
function getUtilitiesData() {
  const allPhotos = queryAll("SELECT * FROM photos WHERE is_trashed = 0 ORDER BY created_at DESC");
  const whatsappPhotos = allPhotos.filter(
    (p) => p.filename.toUpperCase().includes("WA") || p.filename.toLowerCase().includes("whatsapp")
  );
  const blurryPhotos = allPhotos.filter((p) => p.blur_score !== void 0 && p.blur_score >= 0 && p.blur_score < 100);
  blurryPhotos.sort((a, b) => (a.blur_score || 0) - (b.blur_score || 0));
  const exactDuplicates = /* @__PURE__ */ new Map();
  allPhotos.forEach((p) => {
    let key = "";
    if (p.perceptual_hash && p.perceptual_hash !== "0000000000000000") {
      key = `hash_${p.perceptual_hash}`;
    } else if (p.file_size > 0 && p.filename) {
      key = `filesize_${p.file_size}_${p.filename.toLowerCase()}`;
    }
    if (key) {
      if (!exactDuplicates.has(key)) exactDuplicates.set(key, []);
      exactDuplicates.get(key).push(p);
    }
  });
  const duplicateGroups = Array.from(exactDuplicates.values()).filter((group) => group.length > 1);
  const similarGroups = [];
  const checkedForSimilar = /* @__PURE__ */ new Set();
  duplicateGroups.forEach((group) => group.forEach((p) => checkedForSimilar.add(p.id)));
  const availableForSimilar = allPhotos.filter(
    (p) => !checkedForSimilar.has(p.id) && p.perceptual_hash && p.perceptual_hash !== "0000000000000000"
  );
  for (let i = 0; i < availableForSimilar.length; i++) {
    const p1 = availableForSimilar[i];
    if (checkedForSimilar.has(p1.id)) continue;
    const currentGroup = [p1];
    checkedForSimilar.add(p1.id);
    for (let j = i + 1; j < availableForSimilar.length; j++) {
      const p2 = availableForSimilar[j];
      if (checkedForSimilar.has(p2.id)) continue;
      const dist = hammingDistance(p1.perceptual_hash, p2.perceptual_hash);
      if (dist <= 5) {
        currentGroup.push(p2);
        checkedForSimilar.add(p2.id);
      }
    }
    if (currentGroup.length > 1) {
      similarGroups.push(currentGroup);
    }
  }
  return {
    whatsapp: whatsappPhotos,
    blurry: blurryPhotos,
    duplicates: duplicateGroups,
    similar: similarGroups
  };
}
async function scanPerceptualHashesBatch(onProgress) {
  const unanalyzed = queryAll(
    "SELECT id, file_path FROM photos WHERE is_trashed = 0 AND (perceptual_hash IS NULL OR perceptual_hash = '' OR perceptual_hash = '0000000000000000')"
  );
  const total = unanalyzed.length;
  if (total === 0) {
    onProgress?.(0, 0);
    return { scannedCount: 0, duplicateCount: 0 };
  }
  let completed = 0;
  const BATCH_SIZE2 = 32;
  for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE2) {
    const batch = unanalyzed.slice(i, i + BATCH_SIZE2);
    await Promise.allSettled(
      batch.map(async (photo) => {
        try {
          const { computePerceptualHash: computePerceptualHash2 } = await Promise.resolve().then(() => thumbnails);
          const hash = await computePerceptualHash2(photo.file_path);
          if (hash && hash !== "0000000000000000") {
            runSql("UPDATE photos SET perceptual_hash = ? WHERE id = ?", [hash, photo.id]);
          }
        } catch {
        }
        completed++;
        onProgress?.(completed, total);
      })
    );
  }
  return { scannedCount: completed, duplicateCount: total };
}
function createAlbum(name) {
  runSql("INSERT INTO albums (name) VALUES (?)", [name]);
  const row = queryOne("SELECT last_insert_rowid() as id");
  return row?.id || 0;
}
function getAlbums() {
  return queryAll(`
    SELECT a.*, COUNT(ap.photo_id) as photo_count, p.thumbnail_path as cover_thumbnail
    FROM albums a
    LEFT JOIN album_photos ap ON a.id = ap.album_id
    LEFT JOIN photos p ON a.cover_photo_id = p.id
    GROUP BY a.id
    ORDER BY a.updated_at DESC
  `);
}
function getAlbumById(id) {
  return queryOne(`
    SELECT a.*, COUNT(ap.photo_id) as photo_count, p.thumbnail_path as cover_thumbnail
    FROM albums a
    LEFT JOIN album_photos ap ON a.id = ap.album_id
    LEFT JOIN photos p ON a.cover_photo_id = p.id
    WHERE a.id = ?
    GROUP BY a.id
  `, [id]);
}
function updateAlbum(id, name) {
  runSql("UPDATE albums SET name = ?, updated_at = datetime('now') WHERE id = ?", [name, id]);
}
function deleteAlbum(id) {
  runSql("DELETE FROM albums WHERE id = ?", [id]);
}
function addPhotosToAlbum(albumId, photoIds) {
  const database2 = getDb();
  const maxPosRow = queryOne("SELECT COALESCE(MAX(position), 0) as max FROM album_photos WHERE album_id = ?", [albumId]);
  let pos = maxPosRow?.max || 0;
  database2.run("BEGIN TRANSACTION");
  try {
    for (const photoId of photoIds) {
      pos++;
      try {
        runSql("INSERT OR IGNORE INTO album_photos (album_id, photo_id, position) VALUES (?, ?, ?)", [albumId, photoId, pos]);
      } catch {
      }
    }
    const album = getAlbumById(albumId);
    if (album && !album.cover_photo_id && photoIds.length > 0) {
      runSql("UPDATE albums SET cover_photo_id = ? WHERE id = ?", [photoIds[0], albumId]);
    }
    runSql("UPDATE albums SET updated_at = datetime('now') WHERE id = ?", [albumId]);
    database2.run("COMMIT");
  } catch {
    database2.run("ROLLBACK");
  }
  saveDatabase();
}
function removePhotosFromAlbum(albumId, photoIds) {
  const placeholders = photoIds.map(() => "?").join(",");
  runSql(`DELETE FROM album_photos WHERE album_id = ? AND photo_id IN (${placeholders})`, [albumId, ...photoIds]);
}
function createPerson(name, coverPhotoId, faceBase64) {
  const database2 = getDb();
  database2.run("INSERT INTO people (name, cover_photo_id, cover_face_base64) VALUES (?, ?, ?)", [name, coverPhotoId || null, faceBase64 || null]);
  const id = queryOne("SELECT last_insert_rowid() as id")?.id || 0;
  saveDatabase();
  return id;
}
function updatePersonName(personId, name) {
  runSql("UPDATE people SET name = ? WHERE id = ?", [name, personId]);
}
function mergePeople(primaryId, secondaryId) {
  runSql("UPDATE OR IGNORE photo_people SET person_id = ? WHERE person_id = ?", [primaryId, secondaryId]);
  runSql("DELETE FROM photo_people WHERE person_id = ?", [secondaryId]);
  runSql("UPDATE face_descriptors SET person_id = ? WHERE person_id = ?", [primaryId, secondaryId]);
  const primaryName = queryOne("SELECT name FROM people WHERE id = ?", [primaryId])?.name;
  const secondaryName = queryOne("SELECT name FROM people WHERE id = ?", [secondaryId])?.name;
  if (primaryName === "Unknown Person" && secondaryName && secondaryName !== "Unknown Person") {
    runSql("UPDATE people SET name = ? WHERE id = ?", [secondaryName, primaryId]);
  }
  runSql("DELETE FROM people WHERE id = ?", [secondaryId]);
  saveDatabase();
}
function deletePerson(personId) {
  runSql("DELETE FROM people WHERE id = ?", [personId]);
}
function getPeople() {
  return queryAll(`
    SELECT p.*, COUNT(ph2.id) as photo_count, ph.thumbnail_path as cover_thumbnail
    FROM people p
    LEFT JOIN photo_people pp ON p.id = pp.person_id
    LEFT JOIN photos ph2 ON pp.photo_id = ph2.id AND ph2.is_trashed = 0
    LEFT JOIN photos ph ON p.cover_photo_id = ph.id
    GROUP BY p.id
    ORDER BY photo_count DESC, p.name ASC
    LIMIT 50
  `);
}
function addPhotoToPerson(personId, photoId) {
  runSql("INSERT OR IGNORE INTO photo_people (person_id, photo_id) VALUES (?, ?)", [personId, photoId]);
  const person = queryOne("SELECT cover_photo_id FROM people WHERE id = ?", [personId]);
  if (person && !person.cover_photo_id) {
    runSql("UPDATE people SET cover_photo_id = ? WHERE id = ?", [photoId, personId]);
  }
  saveDatabase();
}
function getPhotosByPerson(personId) {
  return queryAll(`
    SELECT ph.* FROM photos ph
    INNER JOIN photo_people pp ON ph.id = pp.photo_id
    WHERE pp.person_id = ? AND ph.is_trashed = 0
    ORDER BY ph.created_at DESC
  `, [personId]);
}
function cleanupOrphanedPeople() {
  runSql(`
    DELETE FROM people 
    WHERE id NOT IN (SELECT DISTINCT person_id FROM photo_people)
  `);
}
function getAllFaceDescriptors() {
  return queryAll("SELECT * FROM face_descriptors");
}
function saveFaceDescriptor(photoId, personId, descriptor) {
  runSql("INSERT INTO face_descriptors (photo_id, person_id, descriptor) VALUES (?, ?, ?)", [
    photoId,
    personId,
    JSON.stringify(descriptor)
  ]);
  addPhotoToPerson(personId, photoId);
}
function getUnscannedPhotos() {
  return queryAll("SELECT * FROM photos WHERE faces_scanned = 0 AND is_trashed = 0 ORDER BY created_at DESC");
}
function markPhotoScanned(photoId) {
  runSql("UPDATE photos SET faces_scanned = 1 WHERE id = ?", [photoId]);
}
function resetFaceScanData() {
  runSql("DELETE FROM people");
  runSql("DELETE FROM photo_people");
  runSql("DELETE FROM face_descriptors");
  runSql("UPDATE photos SET faces_scanned = 0");
  saveDatabase();
}
function resetLocationScanData() {
  runSql("UPDATE photos SET location_name = NULL WHERE location_name IS NOT NULL");
  saveDatabase();
}
function resetDocumentScanData() {
  runSql('UPDATE photos SET extracted_text = "", is_document = 0, document_category = NULL');
  saveDatabase();
}
function resetUtilityScanData() {
  runSql('UPDATE photos SET blur_score = -1, perceptual_hash = ""');
  saveDatabase();
}
function euclideanDistance(desc1, desc2) {
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
function getMergeSuggestions() {
  const people = getPeople();
  const faces = getAllFaceDescriptors();
  const descriptorsByPerson = /* @__PURE__ */ new Map();
  for (const f of faces) {
    try {
      const desc = JSON.parse(f.descriptor);
      if (!descriptorsByPerson.has(f.person_id)) descriptorsByPerson.set(f.person_id, []);
      descriptorsByPerson.get(f.person_id).push(desc);
    } catch {
    }
  }
  const suggestions = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const p1 = people[i];
      const p2 = people[j];
      const descs1 = descriptorsByPerson.get(p1.id) || [];
      const descs2 = descriptorsByPerson.get(p2.id) || [];
      let minDistance = 1;
      for (const d1 of descs1) {
        for (const d2 of descs2) {
          const dist = euclideanDistance(d1, d2);
          if (dist < minDistance) minDistance = dist;
        }
      }
      if (minDistance >= 0.55 && minDistance <= 0.72) {
        const confidence = Math.max(0, Math.min(100, Math.round(100 - (minDistance - 0.55) / 0.17 * 50)));
        suggestions.push({ personA: p1, personB: p2, confidence });
      }
    }
  }
  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions;
}
function addImportedFolder(folderPath, folderName) {
  const normalized = folderPath.replace(/\\/g, "/");
  const name = normalized.split("/").filter(Boolean).pop() || folderPath;
  try {
    const existing = queryOne("SELECT id FROM imported_folders WHERE folder_path = ?", [normalized]);
    if (existing && existing.id > 0) {
      runSql('UPDATE imported_folders SET last_synced_at = datetime("now") WHERE id = ?', [existing.id]);
      return existing.id;
    }
    runSql("INSERT INTO imported_folders (folder_path, folder_name) VALUES (?, ?)", [normalized, name]);
    const row = queryOne("SELECT last_insert_rowid() as id");
    return row?.id || 0;
  } catch (err) {
    console.error("addImportedFolder failed:", err);
    return 0;
  }
}
function getImportedFolders() {
  return queryAll(`
    SELECT f.*, COUNT(p.id) as photo_count
    FROM imported_folders f
    LEFT JOIN photos p ON (p.source_folder_path = f.folder_path OR p.file_path LIKE f.folder_path || '/%') AND p.is_trashed = 0
    GROUP BY f.id
    ORDER BY f.folder_name ASC
  `);
}
function updateFolderSyncTime(folderPath) {
  const normalized = folderPath.replace(/\\/g, "/");
  runSql('UPDATE imported_folders SET last_synced_at = datetime("now") WHERE folder_path = ?', [normalized]);
}
function removeImportedFolder(folderId) {
  const { unlinkSync, existsSync: existsSync2 } = require("fs");
  const folder = queryOne("SELECT folder_path FROM imported_folders WHERE id = ?", [folderId]);
  if (folder) {
    const normPath = folder.folder_path.replace(/\\/g, "/");
    const photos = queryAll(`
      SELECT id, thumbnail_path, preview_path FROM photos 
      WHERE REPLACE(source_folder_path, '\\', '/') = ? OR REPLACE(file_path, '\\', '/') LIKE ? OR REPLACE(file_path, '\\', '/') = ?
    `, [normPath, normPath + "/%", normPath]);
    for (const photo of photos) {
      if (photo.thumbnail_path && existsSync2(photo.thumbnail_path)) {
        try {
          unlinkSync(photo.thumbnail_path);
        } catch {
        }
      }
      if (photo.preview_path && existsSync2(photo.preview_path)) {
        try {
          unlinkSync(photo.preview_path);
        } catch {
        }
      }
    }
    if (photos.length > 0) {
      const ids = photos.map((p) => p.id);
      for (let i = 0; i < ids.length; i += 900) {
        const chunk = ids.slice(i, i + 900);
        const placeholders = chunk.map(() => "?").join(",");
        runSql(`DELETE FROM photo_people WHERE photo_id IN (${placeholders})`, chunk);
        runSql(`DELETE FROM face_descriptors WHERE photo_id IN (${placeholders})`, chunk);
        runSql(`DELETE FROM album_photos WHERE photo_id IN (${placeholders})`, chunk);
        runSql(`DELETE FROM exif_data WHERE photo_id IN (${placeholders})`, chunk);
        runSql(`DELETE FROM photo_tags WHERE photo_id IN (${placeholders})`, chunk);
        runSql(`DELETE FROM photos WHERE id IN (${placeholders})`, chunk);
      }
    }
  }
  runSql("DELETE FROM imported_folders WHERE id = ?", [folderId]);
  const remainingFolders = queryOne("SELECT COUNT(*) as count FROM imported_folders");
  if (!remainingFolders || remainingFolders.count === 0) {
    runSql("DELETE FROM photo_people");
    runSql("DELETE FROM face_descriptors");
    runSql("DELETE FROM album_photos");
    runSql("DELETE FROM exif_data");
    runSql("DELETE FROM photo_tags");
    runSql("DELETE FROM photos");
    resetFaceScanData();
  }
  cleanupOrphanedPeople();
  saveDatabase();
}
function closeDatabase() {
  if (saveTimer) clearTimeout(saveTimer);
  saveDatabase();
  if (db) {
    db.close();
    db = null;
  }
}
const database = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  addImportedFolder,
  addPhotoToPerson,
  addPhotosToAlbum,
  batchFavorite,
  cleanupOrphanedPeople,
  closeDatabase,
  createAlbum,
  createPerson,
  deleteAlbum,
  deletePermanently,
  deletePerson,
  getAlbumById,
  getAlbums,
  getAllFaceDescriptors,
  getDb,
  getExifByPhotoId,
  getGeoPhotos,
  getImportedFolders,
  getMergeSuggestions,
  getPeople,
  getPhotoById,
  getPhotoCount,
  getPhotos,
  getPhotosByPerson,
  getPhotosWithMissingLocation,
  getStats,
  getTimeline,
  getUnanalyzedPhotos,
  getUnscannedDocuments,
  getUnscannedPhotos,
  getUtilitiesData,
  initDatabase,
  insertExif,
  insertPhoto,
  insertPhotoBatch,
  markPhotoScanned,
  mergePeople,
  rebuildExifData,
  removeImportedFolder,
  removePhotosFromAlbum,
  resetDocumentScanData,
  resetFaceScanData,
  resetLocationScanData,
  resetUtilityScanData,
  saveDatabase,
  saveDocumentScan,
  saveFaceDescriptor,
  savePhotoAnalysis,
  savePhotoLocation,
  scanPerceptualHashesBatch,
  setArchived,
  setTrashed,
  toggleFavorite,
  updateAlbum,
  updateFolderSyncTime,
  updatePersonName,
  updatePhotoThumbnails
}, Symbol.toStringTag, { value: "Module" }));
function convertDMSToDecimal(dms, ref) {
  if (!dms || !Array.isArray(dms) || dms.length !== 3) return void 0;
  let decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (ref && (ref.toUpperCase() === "S" || ref.toUpperCase() === "W")) {
    decimal = -decimal;
  }
  return decimal;
}
const SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
  ".avif",
  ".svg",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".pdf",
  ".txt",
  ".doc",
  ".docx"
]);
const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};
async function scanDirectory(dirPath) {
  const files = [];
  async function walk(dir) {
    try {
      const entries = await promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning ${dir}:`, err);
    }
  }
  await walk(dirPath);
  return files;
}
async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);
  const fileStat = fs.statSync(filePath);
  const mimeType = MIME_TYPES[ext] || "image/jpeg";
  let width = 0;
  let height = 0;
  let createdAt = fileStat.birthtime.toISOString();
  let exifData;
  try {
    const metadata = await sharp(filePath).metadata();
    width = metadata.width || 0;
    height = metadata.height || 0;
    if (metadata.exif) {
      try {
        const parsed = exifReader(metadata.exif);
        const photoObj = parsed.Photo || parsed.exif || parsed.image || {};
        const imageObj = parsed.Image || parsed.image || {};
        const gpsObj = parsed.GPSInfo || parsed.gps || {};
        if (photoObj.DateTimeOriginal) {
          const d = photoObj.DateTimeOriginal;
          if (d instanceof Date) {
            createdAt = d.toISOString();
          }
        } else if (photoObj.DateTimeDigitized) {
          const d = photoObj.DateTimeDigitized;
          if (d instanceof Date) {
            createdAt = d.toISOString();
          }
        }
        const lat = convertDMSToDecimal(gpsObj.GPSLatitude, gpsObj.GPSLatitudeRef);
        const lon = convertDMSToDecimal(gpsObj.GPSLongitude, gpsObj.GPSLongitudeRef);
        exifData = {
          photo_id: 0,
          // Will be set after insert
          make: imageObj.Make,
          model: imageObj.Model,
          iso: photoObj.ISO,
          f_number: photoObj.FNumber,
          exposure_time: photoObj.ExposureTime ? `1/${Math.round(1 / photoObj.ExposureTime)}` : void 0,
          focal_length: photoObj.FocalLength,
          gps_lat: lat,
          gps_lon: lon,
          date_taken: createdAt,
          lens_model: photoObj.LensModel
        };
      } catch (e) {
        console.warn("EXIF parsing error for", filePath, e);
      }
    }
  } catch {
  }
  const photo = {
    file_path: filePath,
    filename,
    mime_type: mimeType,
    width,
    height,
    file_size: fileStat.size,
    created_at: createdAt
  };
  return { photo, exif: exifData };
}
async function processFiles(filePaths, onProgress) {
  const results = [];
  const total = filePaths.length;
  for (let i = 0; i < filePaths.length; i++) {
    try {
      const result = await processFile(filePaths[i]);
      results.push(result);
    } catch (err) {
      console.error(`Error processing ${filePaths[i]}:`, err);
    }
    onProgress?.(i + 1, total, filePaths[i]);
  }
  return results;
}
process.env.UV_THREADPOOL_SIZE = "32";
const THUMBNAIL_SIZE = 400;
const THUMBNAIL_QUALITY = 75;
Math.max(16, os.cpus().length * 2);
try {
  sharp.cache(false);
  sharp.concurrency(os.cpus().length);
} catch {
}
let thumbnailDir = "";
function ensureThumbnailDir() {
  thumbnailDir = path.join(electron.app.getPath("userData"), "thumbnails");
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }
  const previewDir = path.join(electron.app.getPath("userData"), "previews");
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
}
function getHashName(filePath) {
  return crypto.createHash("md5").update(filePath).digest("hex");
}
function extractVideoFrameFast(videoPath, thumbnailPath, previewPath) {
  return new Promise((resolve, reject) => {
    const binPath = (ffmpegPath || "ffmpeg").replace("app.asar", "app.asar.unpacked");
    const args = [
      "-ss",
      "0",
      // Fast keyframe seek BEFORE input (1ms seek)
      "-skip_frame",
      "nokey",
      // Only decode the very first I-frame (keyframe)
      "-i",
      videoPath,
      "-an",
      "-sn",
      "-dn",
      // Disable audio, subtitle, and data stream demuxing
      "-frames:v",
      "1",
      "-s",
      "400x400",
      "-q:v",
      "5",
      "-y",
      thumbnailPath
    ];
    const proc = child_process.spawn(binPath, args, { windowsHide: true });
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
      reject(new Error("FFmpeg timeout"));
    }, 1500);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(thumbnailPath)) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited code ${code}`));
      }
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
async function generateThumbnail(filePath) {
  const hash = getHashName(filePath);
  const thumbnailPath = path.join(electron.app.getPath("userData"), "thumbnails", `${hash}.jpg`);
  const previewPath = thumbnailPath;
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);
  const thumbExists = fs.existsSync(thumbnailPath);
  if (thumbExists) {
    return { thumbnailPath, previewPath, width: 0, height: 0 };
  }
  if (isVideo) {
    await extractVideoFrameFast(filePath, thumbnailPath);
    return { thumbnailPath, previewPath, width: 1280, height: 720 };
  }
  await sharp(filePath, { failOn: "none", sequentialRead: true }).rotate().resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
    fit: "cover",
    position: "centre",
    fastShrinkOnLoad: true,
    kernel: "nearest"
  }).jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: false }).toFile(thumbnailPath);
  return { thumbnailPath, previewPath, width: 0, height: 0 };
}
async function generateThumbnailBatch(files, onProgress) {
  let completed = 0;
  const total = files.length;
  if (total === 0) return;
  const photoFiles = [];
  const videoFiles = [];
  for (const f of files) {
    const ext = path.extname(f.filePath).toLowerCase();
    if ([".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext)) {
      videoFiles.push(f);
    } else {
      photoFiles.push(f);
    }
  }
  const PHOTO_CONCURRENCY = Math.max(32, os.cpus().length * 4);
  for (let i = 0; i < photoFiles.length; i += PHOTO_CONCURRENCY) {
    const batch = photoFiles.slice(i, i + PHOTO_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (file) => {
        try {
          const result = await generateThumbnail(file.filePath);
          completed++;
          onProgress?.(completed, total, file.id, result.thumbnailPath, result.previewPath);
        } catch {
          completed++;
          onProgress?.(completed, total, file.id, "", "");
        }
      })
    );
  }
  const VIDEO_CONCURRENCY = Math.max(16, os.cpus().length * 2);
  for (let i = 0; i < videoFiles.length; i += VIDEO_CONCURRENCY) {
    const batch = videoFiles.slice(i, i + VIDEO_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (file) => {
        try {
          const result = await generateThumbnail(file.filePath);
          completed++;
          onProgress?.(completed, total, file.id, result.thumbnailPath, result.previewPath);
        } catch {
          completed++;
          onProgress?.(completed, total, file.id, "", "");
        }
      })
    );
  }
}
function pauseVideoQueue() {
}
function resumeVideoQueue() {
}
function queueMissingVideoThumbnails() {
}
async function applyEdits(inputPath, outputPath, edits) {
  let pipeline = sharp(inputPath).rotate();
  if (edits.rotate) {
    pipeline = pipeline.rotate(edits.rotate);
  }
  if (edits.crop) {
    pipeline = pipeline.extract({
      left: Math.round(edits.crop.left),
      top: Math.round(edits.crop.top),
      width: Math.round(edits.crop.width),
      height: Math.round(edits.crop.height)
    });
  }
  const modulate = {};
  if (edits.brightness !== void 0) {
    modulate.brightness = 1 + edits.brightness / 100;
  }
  if (edits.saturation !== void 0) {
    modulate.saturation = 1 + edits.saturation / 100;
  }
  if (Object.keys(modulate).length > 0) {
    pipeline = pipeline.modulate(modulate);
  }
  if (edits.sharpen) {
    pipeline = pipeline.sharpen();
  }
  if (edits.filter) {
    switch (edits.filter) {
      case "vivid":
        pipeline = pipeline.modulate({ saturation: 1.4, brightness: 1.05 });
        break;
      case "warm":
        pipeline = pipeline.tint({ r: 255, g: 220, b: 180 });
        break;
      case "cool":
        pipeline = pipeline.tint({ r: 180, g: 200, b: 255 });
        break;
      case "bw":
        pipeline = pipeline.grayscale();
        break;
      case "sepia":
        pipeline = pipeline.grayscale().tint({ r: 112, g: 66, b: 20 });
        break;
      case "dramatic":
        pipeline = pipeline.modulate({ saturation: 0.8, brightness: 0.9 }).sharpen();
        break;
    }
  }
  await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
}
async function computePerceptualHash(imagePath) {
  try {
    const ext = path.extname(imagePath).toLowerCase();
    if ([".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext)) {
      const stat = fs.statSync(imagePath);
      return crypto.createHash("md5").update(`video_${stat.size}_${ext}`).digest("hex").substring(0, 16);
    }
    const buffer = await sharp(imagePath, { failOn: "none" }).resize(8, 8, { fit: "fill" }).grayscale().raw().toBuffer();
    if (buffer.length < 64) return "0000000000000000";
    let sum = 0;
    for (let i = 0; i < 64; i++) {
      sum += buffer[i];
    }
    const avg = sum / 64;
    let binaryHash = "";
    for (let i = 0; i < 64; i++) {
      binaryHash += buffer[i] >= avg ? "1" : "0";
    }
    let hexHash = "";
    for (let i = 0; i < 64; i += 4) {
      const nibble = parseInt(binaryHash.substring(i, i + 4), 2);
      hexHash += nibble.toString(16);
    }
    return hexHash;
  } catch (err) {
    return "0000000000000000";
  }
}
const thumbnails = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  applyEdits,
  computePerceptualHash,
  ensureThumbnailDir,
  generateThumbnail,
  generateThumbnailBatch,
  pauseVideoQueue,
  queueMissingVideoThumbnails,
  resumeVideoQueue
}, Symbol.toStringTag, { value: "Module" }));
async function syncFolder(folderPath, onProgress) {
  const normalizedFolder = folderPath.replace(/\\/g, "/");
  if (!fs.existsSync(folderPath)) {
    console.warn(`Folder no longer exists on disk: ${folderPath}. Removing from library...`);
    const folderRow = getImportedFolders().find((f) => f.folder_path === normalizedFolder);
    if (folderRow) {
      removeImportedFolder(folderRow.id);
    }
    return { folderPath: normalizedFolder, addedCount: 0, removedCount: 0 };
  }
  addImportedFolder(normalizedFolder);
  onProgress?.({ stage: "scanning", message: `Scanning ${normalizedFolder}...`, completed: 0, total: 0 });
  const diskFiles = await scanDirectory(folderPath);
  const diskFileMap = /* @__PURE__ */ new Map();
  for (const file of diskFiles) {
    diskFileMap.set(file.replace(/\\/g, "/"), file);
  }
  const dbPhotos = getPhotos({ limit: 1e5 }).filter((p) => {
    const pPath = p.file_path.replace(/\\/g, "/");
    return p.source_folder_path === normalizedFolder || pPath.startsWith(normalizedFolder + "/");
  });
  const dbFileSet = /* @__PURE__ */ new Set();
  for (const photo of dbPhotos) {
    dbFileSet.add(photo.file_path.replace(/\\/g, "/"));
  }
  let removedCount = 0;
  for (const photo of dbPhotos) {
    const normalizedDbPath = photo.file_path.replace(/\\/g, "/");
    if (!diskFileMap.has(normalizedDbPath) && !fs.existsSync(photo.file_path)) {
      try {
        deletePermanently([photo.id]);
        removedCount++;
      } catch (err) {
        console.error(`Failed to remove stale record for ${photo.file_path}:`, err);
      }
    }
  }
  const newFiles = [];
  for (const [normPath, origPath] of diskFileMap.entries()) {
    if (!dbFileSet.has(normPath)) {
      newFiles.push(origPath);
    }
  }
  let addedCount = 0;
  if (newFiles.length > 0) {
    onProgress?.({ stage: "processing", message: `Importing ${newFiles.length} new files...`, completed: 0, total: newFiles.length });
    const processedItems = [];
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      try {
        const item = await processFile(file);
        item.photo.source_folder_path = normalizedFolder;
        processedItems.push(item);
      } catch (err) {
        console.error(`Failed to process ${file}:`, err);
      }
      onProgress?.({ stage: "processing", message: `Processing files... ${i + 1}/${newFiles.length}`, completed: i + 1, total: newFiles.length });
    }
    if (processedItems.length > 0) {
      const inserted = insertPhotoBatch(processedItems);
      addedCount = inserted.length;
      if (inserted.length > 0) {
        onProgress?.({ stage: "thumbnails", message: `Generating thumbnails...`, completed: 0, total: inserted.length });
        let lastSent = 0;
        await generateThumbnailBatch(
          inserted,
          (completed, total, id, thumbPath, prevPath) => {
            if (thumbPath || prevPath) {
              updatePhotoThumbnails(id, thumbPath || prevPath, prevPath || thumbPath);
            }
            const now = Date.now();
            if (now - lastSent > 30 || completed === total) {
              lastSent = now;
              onProgress?.({ stage: "thumbnails", message: `Generating thumbnails... ${completed}/${total}`, completed, total });
            }
          }
        );
      }
    }
  }
  updateFolderSyncTime(normalizedFolder);
  onProgress?.({ stage: "done", message: `Sync complete! +${addedCount} added, -${removedCount} removed`, completed: 100, total: 100 });
  return { folderPath: normalizedFolder, addedCount, removedCount };
}
async function syncAllTrackedFolders(window) {
  const folders = getImportedFolders();
  const results = [];
  if (folders.length > 0) ;
  for (const folder of folders) {
    try {
      const res = await syncFolder(folder.folder_path, (status) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send("sync:status", { folderPath: folder.folder_path, ...status });
        }
      });
      results.push(res);
    } catch (err) {
      console.error(`Sync error for ${folder.folder_path}:`, err);
    }
  }
  if (folders.length > 0) ;
  if (window && !window.isDestroyed()) {
    window.webContents.send("sync:all-completed", results);
  }
  return results;
}
let isScanningLocations = false;
let currentProgress = {
  isScanning: false,
  scannedCount: 0,
  totalCount: 0,
  status: "Idle"
};
const locationCache = {};
function broadcastLocationProgress() {
  electron.BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("location-scan:progress", currentProgress);
    }
  });
}
function stopLocationScanning() {
  isScanningLocations = false;
  currentProgress.isScanning = false;
  currentProgress.status = "Stopped";
  broadcastLocationProgress();
}
function extractLocationFromPath(filePath) {
  if (!filePath) return null;
  const parts = filePath.replace(/\\/g, "/").split("/");
  parts.pop();
  const ignoreFolders = /* @__PURE__ */ new Set(["photos", "dcim", "camera", "pictures", "downloads", "desktop", "documents", "users", "vishwas photos", "vishwas", "100apple", "101apple", "102apple", "103apple"]);
  for (let i = parts.length - 1; i >= 0; i--) {
    let folder = parts[i].trim();
    if (!folder) continue;
    const lower = folder.toLowerCase();
    folder = folder.replace(/\s*\(\d{4}\)\s*/g, "").trim();
    if (folder.length > 2 && !ignoreFolders.has(lower) && !/^\d+$/.test(folder)) {
      return folder;
    }
  }
  return null;
}
async function scanLocations() {
  if (isScanningLocations) return;
  isScanningLocations = true;
  currentProgress = { isScanning: true, scannedCount: 0, totalCount: 1, status: "Reading EXIF GPS metadata..." };
  broadcastLocationProgress();
  try {
    await rebuildExifData();
  } catch (e) {
  }
  const photosToScan = getPhotosWithMissingLocation();
  if (photosToScan.length === 0) {
    isScanningLocations = false;
    currentProgress = { isScanning: false, scannedCount: 0, totalCount: 0, status: "No photos to scan" };
    broadcastLocationProgress();
    return;
  }
  currentProgress = {
    isScanning: true,
    scannedCount: 0,
    totalCount: photosToScan.length,
    status: `Starting location scan for ${photosToScan.length} photos...`
  };
  broadcastLocationProgress();
  for (const photo of photosToScan) {
    if (!isScanningLocations) break;
    try {
      currentProgress.status = `Locating ${photo.filename}...`;
      broadcastLocationProgress();
      const lat = photo.gps_lat;
      const lon = photo.gps_lon;
      let locationName = null;
      if (lat !== null && lon !== null && typeof lat === "number" && typeof lon === "number") {
        const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        locationName = locationCache[cacheKey] || null;
        if (!locationName) {
          try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10`;
            const response = await electron.net.fetch(url, {
              headers: {
                "User-Agent": "PhotoVaultApp/1.0 (contact@example.com)"
              }
            });
            if (response.ok) {
              const data = await response.json();
              if (data && data.address) {
                locationName = data.address.city || data.address.town || data.address.village || data.address.state || data.address.country || null;
              }
            }
          } catch {
          }
          if (locationName) {
            locationCache[`${lat.toFixed(2)},${lon.toFixed(2)}`] = locationName;
          }
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      if (!locationName || locationName === "Unknown Location") {
        const pathLocation = extractLocationFromPath(photo.file_path || photo.source_folder_path || "");
        if (pathLocation) {
          locationName = pathLocation;
        } else {
          locationName = "Unknown Location";
        }
      }
      savePhotoLocation(photo.id, locationName);
      currentProgress.scannedCount++;
      if (currentProgress.scannedCount % 5 === 0 || currentProgress.scannedCount === currentProgress.totalCount) {
        broadcastLocationProgress();
      }
    } catch (err) {
      console.error("Error scanning location for photo", photo.id, err);
    }
  }
  isScanningLocations = false;
  currentProgress.isScanning = false;
  currentProgress.status = "Completed";
  broadcastLocationProgress();
}
const BATCH_SIZE = 20;
const PREFILTER_IMAGE_SIZE = 150;
const OCR_IMAGE_SIZE = 1e3;
let isScanning = false;
let shouldStop = false;
function broadcast(progress) {
  electron.BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("doc-scan:progress", progress);
    }
  });
}
async function isDocumentCandidate(photo) {
  try {
    const filename = (photo.filename || "").toLowerCase();
    if (filename.includes("doc") || filename.includes("scan") || filename.includes("aadhaar") || filename.includes("aadhar") || filename.includes("pan") || filename.includes("card") || filename.includes("id") || filename.includes("bill") || filename.includes("receipt") || filename.includes("invoice") || filename.includes("pdf") || filename.includes("img_") || filename.includes("yebj") || filename.includes("ycdo")) {
    }
    const filePath = photo.thumbnail_path || photo.preview_path || photo.file_path;
    if (!filePath || !fs.existsSync(filePath)) return false;
    const buffer = await sharp(filePath, { failOn: "none" }).resize(PREFILTER_IMAGE_SIZE, PREFILTER_IMAGE_SIZE, { fit: "inside" }).grayscale().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = buffer;
    const { width, height } = info;
    const pixels = width * height;
    if (pixels === 0) return false;
    let edgePixels = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = Math.abs(data[idx + 1] - data[idx - 1]);
        const gy = Math.abs(data[idx + width] - data[idx - width]);
        if (gx + gy > 25) edgePixels++;
      }
    }
    const edgeDensity = edgePixels / pixels;
    return edgeDensity > 0.02 && edgeDensity < 0.7;
  } catch {
    return true;
  }
}
async function startFastDocScan() {
  if (isScanning) return { candidateIds: [], totalPhotos: 0 };
  isScanning = true;
  shouldStop = false;
  try {
    const unscanned = getUnscannedDocuments();
    const total = unscanned.length;
    if (total === 0) {
      broadcast({ scannedCount: 0, totalCount: 0, isScanning: false, phase: "done" });
      isScanning = false;
      return { candidateIds: [], totalPhotos: 0 };
    }
    broadcast({ scannedCount: 0, totalCount: total, isScanning: true, phase: "prefilter", status: "Analyzing images..." });
    const candidates = [];
    const nonDocuments = [];
    let processed = 0;
    for (let i = 0; i < unscanned.length; i += BATCH_SIZE) {
      if (shouldStop) break;
      const batch = unscanned.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (photo) => {
          const isCandidate = await isDocumentCandidate(photo);
          return { photo, isCandidate };
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.isCandidate) {
            candidates.push(result.value.photo);
          } else {
            nonDocuments.push(result.value.photo);
          }
        }
      }
      processed += batch.length;
      broadcast({
        scannedCount: processed,
        totalCount: total,
        isScanning: true,
        phase: "prefilter",
        status: `Pre-filtering... ${processed}/${total} (${candidates.length} candidates)`
      });
    }
    for (const photo of nonDocuments) {
      if (shouldStop) break;
      saveDocumentScan(photo.id, "NONE", false, null);
    }
    broadcast({
      scannedCount: processed,
      totalCount: total,
      isScanning: true,
      phase: "prefilter",
      status: `Pre-filter complete. ${candidates.length} document candidates found out of ${total} photos.`
    });
    isScanning = false;
    return {
      candidateIds: candidates.map((c) => c.id),
      totalPhotos: total
    };
  } catch (err) {
    console.error("Fast doc scan error:", err);
    isScanning = false;
    return { candidateIds: [], totalPhotos: 0 };
  }
}
function stopFastDocScan() {
  shouldStop = true;
  isScanning = false;
}
async function getOcrBuffer(photo) {
  try {
    const filePath = photo.thumbnail_path || photo.preview_path || photo.file_path;
    if (!filePath || !fs.existsSync(filePath)) return null;
    return await sharp(filePath).resize(OCR_IMAGE_SIZE, OCR_IMAGE_SIZE, { fit: "inside", withoutEnlargement: true }).sharpen().grayscale().normalize().png().toBuffer();
  } catch {
    return null;
  }
}
let logFilePath = "";
function setupLogger() {
  logFilePath = electron.app.isPackaged ? path.join(electron.app.getPath("userData"), "app-errors.log") : path.join(process.cwd(), "app-errors.log");
  const originalConsoleError = console.error;
  console.error = (...args) => {
    logErrorToFile("CONSOLE_ERROR", args.join(" "));
    originalConsoleError.apply(console, args);
  };
  process.on("uncaughtException", (error) => {
    logErrorToFile("UNCAUGHT_EXCEPTION", error.stack || error.message);
  });
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
    logErrorToFile("UNHANDLED_REJECTION", message);
  });
}
function logErrorToFile(type, message) {
  if (!logFilePath) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const logEntry = `[${timestamp}] [${type}]
${message}

`;
  try {
    fs.appendFileSync(logFilePath, logEntry);
  } catch (err) {
  }
}
function registerIpcHandlers() {
  electron.ipcMain.handle("photos:import-folder", async (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, count: 0 };
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openDirectory", "multiSelections"],
      title: "Import Photos from Folder"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, count: 0 };
    }
    const selectedDirs = result.filePaths.map((p) => p.replace(/\\/g, "/"));
    for (const dirPath of selectedDirs) {
      addImportedFolder(dirPath);
    }
    event.sender.send("import:status", { stage: "scanning", message: "Scanning for photos...", total: 0, completed: 0 });
    let filePaths = [];
    for (const dirPath of selectedDirs) {
      const scanned = await scanDirectory(dirPath);
      filePaths.push(...scanned);
    }
    filePaths = Array.from(new Set(filePaths));
    if (filePaths.length === 0) {
      event.sender.send("import:status", {
        stage: "done",
        message: "No supported media files found",
        total: 0,
        completed: 0
      });
      return { success: true, count: 0, message: "No supported images found" };
    }
    event.sender.send("import:status", {
      stage: "processing",
      message: `Found ${filePaths.length} photos. Processing metadata...`,
      total: filePaths.length,
      completed: 0
    });
    let lastProcessSent = 0;
    const importedFiles = await processFiles(filePaths, (completed, total, currentFile) => {
      const now = Date.now();
      if (now - lastProcessSent > 120 || completed === total) {
        lastProcessSent = now;
        event.sender.send("import:status", {
          stage: "processing",
          message: `Processing ${path.basename(currentFile)}... (${completed}/${total})`,
          total,
          completed
        });
      }
    });
    importedFiles.forEach((f) => {
      const filePathStr = f?.photo?.file_path || "";
      const normPath = filePathStr.replace(/\\/g, "/");
      const matchedDir = selectedDirs.find((d) => normPath.startsWith(d));
      f.photo.source_folder_path = matchedDir || (normPath.includes("/") ? normPath.substring(0, normPath.lastIndexOf("/")) : normPath);
    });
    event.sender.send("import:status", {
      stage: "saving",
      message: "Saving photos to library database...",
      total: importedFiles.length,
      completed: importedFiles.length
    });
    const insertedItems = insertPhotoBatch(importedFiles);
    if (insertedItems.length > 0) {
      event.sender.send("import:status", {
        stage: "thumbnails",
        message: "Generating thumbnails...",
        total: insertedItems.length,
        completed: 0
      });
      let lastSent = 0;
      await generateThumbnailBatch(
        insertedItems,
        (completed, total, id, thumbnailPath, previewPath) => {
          if (thumbnailPath || previewPath) {
            updatePhotoThumbnails(id, thumbnailPath || previewPath, previewPath || thumbnailPath);
          }
          const now = Date.now();
          if (now - lastSent > 30 || completed === total) {
            lastSent = now;
            event.sender.send("import:status", {
              stage: "thumbnails",
              message: `Generating thumbnails... ${completed}/${total}`,
              total,
              completed
            });
          }
        }
      );
    }
    event.sender.send("import:status", {
      stage: "done",
      message: `Successfully imported ${insertedItems.length} photos`,
      total: insertedItems.length,
      completed: insertedItems.length
    });
    return { success: true, count: insertedItems.length };
  });
  electron.ipcMain.handle("photos:import-files", async (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, count: 0 };
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      title: "Import Photos",
      filters: [
        { name: "Images & Videos", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "avif", "mp4", "mov", "avi", "mkv", "webm"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, count: 0 };
    }
    const filePaths = result.filePaths;
    event.sender.send("import:status", {
      stage: "processing",
      message: `Processing ${filePaths.length} photos...`,
      total: filePaths.length,
      completed: 0
    });
    const importedFiles = await processFiles(filePaths, (completed, total, currentFile) => {
      event.sender.send("import:status", {
        stage: "processing",
        message: `Processing ${path.basename(currentFile)}...`,
        total,
        completed
      });
    });
    const insertedItems = insertPhotoBatch(importedFiles);
    if (insertedItems.length > 0) {
      let lastSent = 0;
      await generateThumbnailBatch(
        insertedItems,
        (completed, total, id, thumbnailPath, previewPath) => {
          if (thumbnailPath || previewPath) {
            updatePhotoThumbnails(id, thumbnailPath || previewPath, previewPath || thumbnailPath);
          }
          const now = Date.now();
          if (now - lastSent > 150 || completed === total) {
            lastSent = now;
            event.sender.send("import:status", {
              stage: "thumbnails",
              message: `Generating thumbnails... ${completed}/${total}`,
              total,
              completed
            });
          }
        }
      );
    }
    event.sender.send("import:status", {
      stage: "done",
      message: `Successfully imported ${insertedItems.length} photos`,
      total: insertedItems.length,
      completed: insertedItems.length
    });
    return { success: true, count: insertedItems.length };
  });
  electron.ipcMain.handle("photos:get-all", (_event, filter) => {
    return getPhotos(filter);
  });
  electron.ipcMain.handle("photos:get-geo", () => {
    return getGeoPhotos();
  });
  electron.ipcMain.handle("photos:get-by-id", (_event, id) => {
    const photo = getPhotoById(id);
    const exif = photo ? getExifByPhotoId(id) : void 0;
    return { photo, exif };
  });
  electron.ipcMain.handle("photos:get-count", (_event, filter) => {
    return getPhotoCount(filter);
  });
  electron.ipcMain.handle("photos:toggle-favorite", (_event, id) => {
    return toggleFavorite(id);
  });
  electron.ipcMain.handle("photos:batch-favorite", (_event, ids, favorite) => {
    batchFavorite(ids, favorite);
    return true;
  });
  electron.ipcMain.handle("photos:archive", (_event, ids) => {
    setArchived(ids, true);
    return true;
  });
  electron.ipcMain.handle("photos:scan-documents", () => {
    const { scanDocuments } = require("./document-scanner");
    scanDocuments();
    return true;
  });
  electron.ipcMain.handle("photos:stop-document-scan", () => {
    const { stopDocumentScanning } = require("./document-scanner");
    stopDocumentScanning();
    return true;
  });
  electron.ipcMain.handle("photos:start-location-scan", () => {
    scanLocations();
    return true;
  });
  electron.ipcMain.handle("photos:stop-location-scan", () => {
    stopLocationScanning();
    return true;
  });
  electron.ipcMain.handle("photos:unarchive", (_event, ids) => {
    setArchived(ids, false);
    return true;
  });
  electron.ipcMain.handle("photos:lock", (_event, ids, locked) => {
    const { setLocked } = require("./database");
    setLocked(ids, locked);
    return true;
  });
  electron.ipcMain.handle("photos:update-metadata", (_event, id, data) => {
    const { updatePhotoMetadata } = require("./database");
    updatePhotoMetadata(id, data);
    return true;
  });
  electron.ipcMain.handle("photos:trash", (_event, ids) => {
    setTrashed(ids, true);
    return true;
  });
  electron.ipcMain.handle("photos:restore", (_event, ids) => {
    setTrashed(ids, false);
    return true;
  });
  electron.ipcMain.handle("photos:delete-permanently", (_event, ids) => {
    deletePermanently(ids);
    return true;
  });
  electron.ipcMain.handle("photos:empty-trash", () => {
    const db2 = require("./database").getDb();
    const trashed = db2.prepare("SELECT id FROM photos WHERE is_trashed = 1").all();
    if (trashed.length > 0) {
      deletePermanently(trashed.map((r) => r.id));
    }
    return true;
  });
  electron.ipcMain.handle("photos:get-timeline", () => {
    return getTimeline();
  });
  electron.ipcMain.handle("photos:get-stats", () => {
    return getStats();
  });
  electron.ipcMain.handle("photos:search", (_event, query) => {
    return getPhotos({ search: query });
  });
  electron.ipcMain.handle("photos:open-in-explorer", (_event, filePath) => {
    electron.shell.showItemInFolder(filePath);
  });
  electron.ipcMain.handle("photos:get-utilities-data", () => {
    return getUtilitiesData();
  });
  electron.ipcMain.handle("photos:scan-duplicates", async (event) => {
    const { scanPerceptualHashesBatch: scanPerceptualHashesBatch2 } = await Promise.resolve().then(() => database);
    await scanPerceptualHashesBatch2((scanned, total) => {
      event.sender.send("duplicate-scan:progress", { scanned, total });
    });
    return getUtilitiesData();
  });
  electron.ipcMain.handle("photos:get-unanalyzed", () => {
    return getUnanalyzedPhotos();
  });
  electron.ipcMain.handle("photos:save-analysis", (_event, photoId, blurScore, perceptualHash) => {
    savePhotoAnalysis(photoId, blurScore, perceptualHash);
    return true;
  });
  electron.ipcMain.handle("photos:get-unscanned-docs", () => {
    return getUnscannedDocuments();
  });
  electron.ipcMain.handle("photos:save-document-scan", (_event, photoId, text, isDocument, category) => {
    saveDocumentScan(photoId, text, isDocument, category);
    return true;
  });
  electron.ipcMain.handle("docs:fast-prefilter", async () => {
    return await startFastDocScan();
  });
  electron.ipcMain.handle("docs:stop-fast-scan", () => {
    stopFastDocScan();
    return true;
  });
  electron.ipcMain.handle("docs:get-ocr-buffer", async (_event, photoId) => {
    const photos = getUnscannedDocuments();
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) {
      const allPhotos = getPhotos({});
      const p = allPhotos.find((x) => x.id === photoId);
      if (!p) return null;
      const buf2 = await getOcrBuffer(p);
      return buf2 ? buf2.toString("base64") : null;
    }
    const buf = await getOcrBuffer(photo);
    return buf ? buf.toString("base64") : null;
  });
  electron.ipcMain.handle("docs:save-batch", (_event, results) => {
    for (const r of results) {
      saveDocumentScan(r.id, r.text, r.isDocument, r.category);
    }
    return true;
  });
  electron.ipcMain.handle("photos:edit", async (_event, id, edits) => {
    const photo = getPhotoById(id);
    if (!photo) return { success: false };
    const ext = path.extname(photo.file_path);
    const editedDir = path.join(electron.app.getPath("userData"), "edited");
    if (!fs.existsSync(editedDir)) {
      const { mkdirSync } = require("fs");
      mkdirSync(editedDir, { recursive: true });
    }
    const outputPath = path.join(editedDir, `${id}_edited${ext}`);
    try {
      await applyEdits(photo.file_path, outputPath, edits);
      const thumbResult = await generateThumbnail(outputPath);
      updatePhotoThumbnails(id, thumbResult.thumbnailPath, thumbResult.previewPath);
      return { success: true, path: outputPath };
    } catch (err) {
      console.error("Edit failed:", err);
      return { success: false, error: String(err) };
    }
  });
  electron.ipcMain.handle("albums:create", (_event, name) => {
    const id = createAlbum(name);
    return getAlbumById(id);
  });
  electron.ipcMain.handle("albums:get-all", () => {
    return getAlbums();
  });
  electron.ipcMain.handle("albums:get-by-id", (_event, id) => {
    return getAlbumById(id);
  });
  electron.ipcMain.handle("albums:update", (_event, id, name) => {
    updateAlbum(id, name);
    return getAlbumById(id);
  });
  electron.ipcMain.handle("albums:delete", (_event, id) => {
    deleteAlbum(id);
    return true;
  });
  electron.ipcMain.handle("albums:add-photos", (_event, albumId, photoIds) => {
    addPhotosToAlbum(albumId, photoIds);
    return getAlbumById(albumId);
  });
  electron.ipcMain.handle("albums:remove-photos", (_event, albumId, photoIds) => {
    removePhotosFromAlbum(albumId, photoIds);
    return getAlbumById(albumId);
  });
  electron.ipcMain.handle("people:get-all", () => {
    return getPeople();
  });
  electron.ipcMain.handle("people:create", (_event, name, coverPhotoId, faceBase64) => {
    const id = createPerson(name, coverPhotoId, faceBase64);
    return id;
  });
  electron.ipcMain.handle("people:update-name", (_event, personId, name) => {
    updatePersonName(personId, name);
    return true;
  });
  electron.ipcMain.handle("people:delete", (_event, personId) => {
    deletePerson(personId);
    return true;
  });
  electron.ipcMain.handle("people:add-photo", (_event, personId, photoId) => {
    addPhotoToPerson(personId, photoId);
    return true;
  });
  electron.ipcMain.handle("people:merge", (_event, primaryId, secondaryId) => {
    mergePeople(primaryId, secondaryId);
    return true;
  });
  electron.ipcMain.handle("people:get-photos", (_event, personId) => {
    return getPhotosByPerson(personId);
  });
  electron.ipcMain.handle("faces:get-all", () => {
    return getAllFaceDescriptors();
  });
  electron.ipcMain.handle("faces:save", (_event, photoId, personId, descriptor) => {
    saveFaceDescriptor(photoId, personId, descriptor);
    return true;
  });
  electron.ipcMain.handle("faces:get-unscanned", () => {
    return getUnscannedPhotos();
  });
  electron.ipcMain.handle("faces:mark-scanned", (_event, photoId) => {
    markPhotoScanned(photoId);
    return true;
  });
  electron.ipcMain.handle("faces:reset", (_event) => {
    resetFaceScanData();
    return true;
  });
  electron.ipcMain.handle("locations:reset", (_event) => {
    resetLocationScanData();
    return true;
  });
  electron.ipcMain.handle("docs:reset", (_event) => {
    resetDocumentScanData();
    return true;
  });
  electron.ipcMain.handle("analysis:reset", (_event) => {
    resetUtilityScanData();
    return true;
  });
  electron.ipcMain.handle("faces:get-merge-suggestions", (_event) => {
    return getMergeSuggestions();
  });
  electron.ipcMain.handle("folders:get-all", () => {
    return getImportedFolders();
  });
  electron.ipcMain.handle("folders:sync", async (event, folderPath) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    return syncFolder(folderPath, (status) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("sync:status", { folderPath, ...status });
      }
    });
  });
  electron.ipcMain.handle("folders:sync-all", async (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    return syncAllTrackedFolders(win || void 0);
  });
  electron.ipcMain.handle("folders:remove", (_event, folderId) => {
    removeImportedFolder(folderId);
    return true;
  });
  electron.ipcMain.handle("system:get-platform", () => {
    return process.platform;
  });
  electron.ipcMain.handle("system:log-error", (_event, type, message) => {
    logErrorToFile(type, message);
    return true;
  });
  electron.ipcMain.handle("window:minimize", (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
    return true;
  });
  electron.ipcMain.handle("window:maximize", (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });
  electron.ipcMain.handle("window:close", (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    win?.close();
    return true;
  });
  electron.ipcMain.handle("window:is-maximized", (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
}
let mainWindow = null;
setupLogger();
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: process.platform === "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : void 0,
    titleBarOverlay: process.platform !== "darwin" ? {
      color: "#1a1a2e",
      symbolColor: "#a0a0b8",
      height: 40
    } : void 0,
    backgroundColor: "#0f0f1a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Import Folder...",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => {
            mainWindow?.webContents.send("menu:import-folder");
          }
        },
        {
          label: "Import Files...",
          accelerator: "CmdOrCtrl+I",
          click: () => {
            mainWindow?.webContents.send("menu:import-files");
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About PhotoVault",
          click: () => {
            electron.dialog.showMessageBox({
              type: "info",
              title: "About PhotoVault",
              message: "PhotoVault v1.0.0",
              detail: "An offline photo management app inspired by Google Photos."
            });
          }
        }
      ]
    }
  ];
  if (process.platform === "darwin") {
    template.unshift({
      label: electron.app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    });
  }
  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}
if (!is.dev) {
  const gotTheLock = electron.app.requestSingleInstanceLock();
  if (!gotTheLock) {
    electron.app.quit();
  } else {
    electron.app.on("second-instance", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}
electron.app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.photovault.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  await initDatabase();
  ensureThumbnailDir();
  registerIpcHandlers();
  createMenu();
  createWindow();
  setTimeout(() => {
    syncAllTrackedFolders(mainWindow || void 0).catch((err) => console.error("Startup sync error:", err));
  }, 3e3);
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  closeDatabase();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
exports.ensureThumbnailDir = ensureThumbnailDir;
exports.generateThumbnailBatch = generateThumbnailBatch;
