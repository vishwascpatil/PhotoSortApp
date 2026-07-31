import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

let db: SqlJsDatabase | null = null
let dbPath = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveDatabase()
  }, 1000)
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(dbPath, buffer)
  } catch (err) {
    console.error('Failed to save database:', err)
  }
}

export async function initDatabase(): Promise<void> {
  const dbDir = app.getPath('userData')
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })

  dbPath = join(dbDir, 'photovault.db')

  const SQL = await initSqlJs()

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // Performance settings
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = NORMAL')
  db.run('PRAGMA foreign_keys = ON')

  createTables()
  cleanupOrphanedPhotos()
  cleanupOrphanedPeople()
  rebuildExifData()
  saveDatabase()
}

function cleanupOrphanedPhotos(): void {
  // Clean up any relational data where the photo no longer exists (in case foreign keys were ever off)
  runSql('DELETE FROM photo_people WHERE photo_id NOT IN (SELECT id FROM photos)')
  runSql('DELETE FROM face_descriptors WHERE photo_id NOT IN (SELECT id FROM photos)')

  const { unlinkSync, existsSync } = require('fs')
  const photos = queryAll<{ id: number, thumbnail_path: string | null, preview_path: string | null }>(`
    SELECT id, thumbnail_path, preview_path FROM photos 
    WHERE source_folder_path IS NOT NULL 
    AND source_folder_path != ''
    AND source_folder_path NOT IN (SELECT folder_path FROM imported_folders)
  `)

  if (photos.length > 0) {
    for (const photo of photos) {
      if (photo.thumbnail_path && existsSync(photo.thumbnail_path)) {
        try { unlinkSync(photo.thumbnail_path) } catch { }
      }
      if (photo.preview_path && existsSync(photo.preview_path)) {
        try { unlinkSync(photo.preview_path) } catch { }
      }
    }
    const ids = photos.map(p => p.id)
    for (let i = 0; i < ids.length; i += 900) {
      const chunk = ids.slice(i, i + 900)
      const placeholders = chunk.map(() => '?').join(',')
      runSql(`DELETE FROM photos WHERE id IN (${placeholders})`, chunk)
    }
  }
}

function createTables(): void {
  const database = getDb()

  database.run(`
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
  `)

  // Auto-migrate existing database tables for new columns
  try { database.run('ALTER TABLE photos ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN description TEXT DEFAULT ""') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN source_folder_path TEXT') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN faces_scanned INTEGER NOT NULL DEFAULT 0') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN blur_score REAL DEFAULT -1') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN perceptual_hash TEXT DEFAULT ""') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN extracted_text TEXT DEFAULT ""') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN is_document INTEGER DEFAULT 0') } catch { }
  try { database.run('ALTER TABLE photos ADD COLUMN location_name TEXT DEFAULT NULL') } catch { }

  // Wait for columns to be created first

  try { database.run('ALTER TABLE photos ADD COLUMN document_category TEXT DEFAULT NULL') } catch { }
  try { database.run('ALTER TABLE people ADD COLUMN cover_face_base64 TEXT') } catch { }

  // Now that document_category exists, we can safely run the reset
  try { database.run("UPDATE photos SET extracted_text = '', is_document = 0, document_category = NULL") } catch (e) { console.error('reset fail 7', e) }

  database.run(`
    CREATE TABLE IF NOT EXISTS imported_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_path TEXT NOT NULL UNIQUE,
      folder_name TEXT NOT NULL,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cover_photo_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS album_photos (
      album_id INTEGER NOT NULL,
      photo_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(album_id, photo_id),
      FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE
    )
  `)

  database.run(`
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
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS photo_tags (
      photo_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY(photo_id, tag_id),
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cover_photo_id INTEGER,
      cover_face_base64 TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS photo_people (
      photo_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      PRIMARY KEY(photo_id, person_id),
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS face_descriptors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      descriptor TEXT NOT NULL,
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `)

  // Create indexes (IF NOT EXISTS not supported for indexes in all versions, use try/catch)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_photos_is_favorite ON photos(is_favorite)',
    'CREATE INDEX IF NOT EXISTS idx_photos_is_archived ON photos(is_archived)',
    'CREATE INDEX IF NOT EXISTS idx_photos_is_trashed ON photos(is_trashed)',
    'CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos(filename)',
    'CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos(album_id)',
    'CREATE INDEX IF NOT EXISTS idx_album_photos_photo ON album_photos(photo_id)',
    'CREATE INDEX IF NOT EXISTS idx_exif_model ON exif_data(model)',
    'CREATE INDEX IF NOT EXISTS idx_exif_date ON exif_data(date_taken)'
  ]
  for (const sql of indexes) {
    try { database.run(sql) } catch { }
  }
}

export async function rebuildExifData(): Promise<void> {
  try {
    const photos = queryAll<{ id: number; file_path: string }>(`
      SELECT p.id, p.file_path 
      FROM photos p 
      LEFT JOIN exif_data e ON p.id = e.photo_id 
      WHERE e.gps_lat IS NULL OR e.photo_id IS NULL
    `)

    if (photos.length === 0) return

    const { existsSync } = require('fs')
    const sharp = require('sharp')
    const exifReader = require('exif-reader')

    function convertDMSToDecimal(dms: number[] | undefined, ref: string | undefined): number | undefined {
      if (!dms || !Array.isArray(dms) || dms.length !== 3) return undefined
      let decimal = dms[0] + (dms[1] / 60) + (dms[2] / 3600)
      if (ref && (ref.toUpperCase() === 'S' || ref.toUpperCase() === 'W')) {
        decimal = -decimal
      }
      return decimal
    }

    for (const photo of photos) {
      if (!photo.file_path || !existsSync(photo.file_path)) continue
      try {
        const metadata = await sharp(photo.file_path, { failOn: 'none' }).metadata()
        if (metadata && metadata.exif) {
          const parsed: any = exifReader(metadata.exif)
          const photoObj = parsed.Photo || parsed.exif || parsed.image || {}
          const imageObj = parsed.Image || parsed.image || {}
          const gpsObj = parsed.GPSInfo || parsed.gps || {}

          const lat = convertDMSToDecimal(gpsObj.GPSLatitude as number[] | undefined, gpsObj.GPSLatitudeRef as string | undefined)
          const lon = convertDMSToDecimal(gpsObj.GPSLongitude as number[] | undefined, gpsObj.GPSLongitudeRef as string | undefined)

          if (lat !== undefined && lon !== undefined) {
            const make = imageObj.Make as string | undefined
            const model = imageObj.Model as string | undefined
            const iso = photoObj.ISO as number | undefined
            const fNumber = photoObj.FNumber as number | undefined
            const exposureTime = photoObj.ExposureTime ? `1/${Math.round(1 / (photoObj.ExposureTime as number))}` : undefined
            const focalLength = photoObj.FocalLength as number | undefined
            const lensModel = photoObj.LensModel as string | undefined
            const dateTaken = photoObj.DateTimeOriginal || photoObj.DateTimeDigitized || null
            const dateStr = dateTaken instanceof Date ? dateTaken.toISOString() : null

            runSql(`
              INSERT INTO exif_data (photo_id, make, model, iso, f_number, exposure_time, focal_length, gps_lat, gps_lon, date_taken, lens_model)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(photo_id) DO UPDATE SET
                make = COALESCE(excluded.make, exif_data.make),
                model = COALESCE(excluded.model, exif_data.model),
                gps_lat = excluded.gps_lat,
                gps_lon = excluded.gps_lon
            `, [photo.id, make || null, model || null, iso || null, fNumber || null, exposureTime || null, focalLength || null, lat, lon, dateStr, lensModel || null])
          }
        }
      } catch { }
    }
    saveDatabase()
  } catch (err) {
    console.error('rebuildExifData error:', err)
  }
}

// ─── Helper to convert sql.js results to objects ────────────────────────

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const database = getDb()
  const stmt = database.prepare(sql)
  if (params.length > 0) stmt.bind(params as any)

  const results: T[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    results.push(row as T)
  }
  stmt.free()
  return results
}

function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const results = queryAll<T>(sql, params)
  return results[0]
}

function runSql(sql: string, params: unknown[] = []): void {
  const database = getDb()
  database.run(sql, params as any)
  scheduleSave()
}

// ─── Photo CRUD ─────────────────────────────────────────────────────────

export interface PhotoRow {
  id: number
  file_path: string
  thumbnail_path: string | null
  preview_path: string | null
  filename: string
  mime_type: string
  width: number
  height: number
  file_size: number
  created_at: string
  imported_at: string
  is_favorite: number
  is_archived: number
  is_trashed: number
  is_locked: number
  description: string | null
  source_folder_path: string | null
  trashed_at: string | null
  rating: number
  orientation: number
  faces_scanned: number
  blur_score?: number
  perceptual_hash?: string
  extracted_text?: string
  is_document?: number
  document_category?: string
}

export interface PhotoInsert {
  file_path: string
  thumbnail_path?: string
  preview_path?: string
  filename: string
  mime_type: string
  width: number
  height: number
  file_size: number
  created_at: string
  orientation?: number
  source_folder_path?: string
}

export interface ExifInsert {
  photo_id: number
  make?: string
  model?: string
  iso?: number
  f_number?: number
  exposure_time?: string
  focal_length?: number
  gps_lat?: number
  gps_lon?: number
  date_taken?: string
  lens_model?: string
}

export function insertPhoto(photo: PhotoInsert): number {
  try {
    const existing = queryOne<{ id: number }>('SELECT id FROM photos WHERE file_path = ?', [photo.file_path])
    if (existing && existing.id > 0) {
      if (photo.source_folder_path) {
        runSql('UPDATE photos SET source_folder_path = ? WHERE id = ?', [photo.source_folder_path, existing.id])
      }
      return existing.id
    }
    const database = getDb()
    database.run(
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
    )
    const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')
    scheduleSave()
    return row?.id || 0
  } catch (err) {
    console.error('insertPhoto failed:', err)
    return 0
  }
}

export function insertExif(exif: ExifInsert): void {
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
  )
}

export function insertPhotoBatch(photos: { photo: PhotoInsert; exif?: ExifInsert }[]): { id: number; filePath: string }[] {
  const database = getDb()
  const inserted: { id: number; filePath: string }[] = []

  database.run('BEGIN TRANSACTION')
  try {
    for (const { photo, exif } of photos) {
      const id = insertPhoto(photo)
      if (id > 0) {
        if (exif) {
          insertExif({ ...exif, photo_id: id })
        }
        inserted.push({ id, filePath: photo.file_path })
      }
    }
    database.run('COMMIT')
  } catch (err) {
    database.run('ROLLBACK')
    console.error('Batch insert failed:', err)
  }

  saveDatabase()
  return inserted
}

export function updatePhotoThumbnails(id: number, thumbnailPath: string, previewPath: string): void {
  runSql('UPDATE photos SET thumbnail_path = ?, preview_path = ? WHERE id = ?', [thumbnailPath, previewPath, id])
}

export interface PhotoFilter {
  isFavorite?: boolean
  isArchived?: boolean
  isTrashed?: boolean
  isLocked?: boolean
  albumId?: number
  folderPath?: string
  search?: string
  limit?: number
  offset?: number
}

export function getPhotos(filter: PhotoFilter = {}): PhotoRow[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.isLocked !== undefined) {
    conditions.push('p.is_locked = ?')
    params.push(filter.isLocked ? 1 : 0)
  } else {
    conditions.push('p.is_locked = 0')
  }

  if (filter.isTrashed !== undefined) {
    conditions.push('p.is_trashed = ?')
    params.push(filter.isTrashed ? 1 : 0)
  } else {
    conditions.push('p.is_trashed = 0')
  }

  if (filter.isFavorite !== undefined) {
    conditions.push('p.is_favorite = ?')
    params.push(filter.isFavorite ? 1 : 0)
  }

  if (filter.folderPath) {
    conditions.push('p.source_folder_path = ?')
    params.push(filter.folderPath)
  }

  if (filter.isArchived !== undefined) {
    conditions.push('p.is_archived = ?')
    params.push(filter.isArchived ? 1 : 0)
  } else if (!filter.isTrashed) {
    conditions.push('p.is_archived = 0')
  }

  let join = ''
  if (filter.albumId) {
    join = 'INNER JOIN album_photos ap ON p.id = ap.photo_id'
    conditions.push('ap.album_id = ?')
    params.push(filter.albumId)
  }

  if (filter.search) {
    join += ' LEFT JOIN exif_data e ON p.id = e.photo_id'
    conditions.push(`(
      p.filename LIKE ? 
      OR e.model LIKE ? 
      OR e.make LIKE ? 
      OR EXISTS (
        SELECT 1 FROM photo_people pp 
        JOIN people per ON pp.person_id = per.id 
        WHERE pp.photo_id = p.id AND per.name LIKE ?
      )
    )`)
    const searchTerm = `%${filter.search}%`
    params.push(searchTerm, searchTerm, searchTerm, searchTerm)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = filter.limit ? `LIMIT ${filter.limit}` : ''
  const offset = filter.offset ? `OFFSET ${filter.offset}` : ''

  const sql = `SELECT p.* FROM photos p ${join} ${where} ORDER BY p.created_at DESC ${limit} ${offset}`
  return queryAll<PhotoRow>(sql, params)
}

export function getGeoPhotos(): (PhotoRow & { gps_lat: number, gps_lon: number })[] {
  return queryAll<PhotoRow & { gps_lat: number, gps_lon: number }>(`
    SELECT p.*, e.gps_lat, e.gps_lon 
    FROM photos p 
    INNER JOIN exif_data e ON p.id = e.photo_id 
    WHERE e.gps_lat IS NOT NULL AND e.gps_lon IS NOT NULL AND p.is_trashed = 0
  `)
}

export function getPhotoById(id: number): PhotoRow | undefined {
  return queryOne<PhotoRow>('SELECT * FROM photos WHERE id = ?', [id])
}

export function getExifByPhotoId(id: number): ExifInsert | undefined {
  return queryOne<ExifInsert>('SELECT * FROM exif_data WHERE photo_id = ?', [id])
}

export function toggleFavorite(id: number): boolean {
  const photo = getPhotoById(id)
  if (!photo) return false
  const newVal = photo.is_favorite ? 0 : 1
  runSql('UPDATE photos SET is_favorite = ? WHERE id = ?', [newVal, id])
  return newVal === 1
}

export function batchFavorite(ids: number[], favorite: boolean): void {
  const placeholders = ids.map(() => '?').join(',')
  runSql(`UPDATE photos SET is_favorite = ? WHERE id IN (${placeholders})`, [favorite ? 1 : 0, ...ids])
}

export function setArchived(ids: number[], archived: boolean): void {
  const placeholders = ids.map(() => '?').join(',')
  runSql(`UPDATE photos SET is_archived = ? WHERE id IN (${placeholders})`, [archived ? 1 : 0, ...ids])
}

export function setLocked(ids: number[], locked: boolean): void {
  const placeholders = ids.map(() => '?').join(',')
  runSql(`UPDATE photos SET is_locked = ? WHERE id IN (${placeholders})`, [locked ? 1 : 0, ...ids])
}

export function updatePhotoMetadata(id: number, data: { description?: string; created_at?: string }): void {
  if (data.description !== undefined && data.created_at !== undefined) {
    runSql('UPDATE photos SET description = ?, created_at = ? WHERE id = ?', [data.description, data.created_at, id])
  } else if (data.description !== undefined) {
    runSql('UPDATE photos SET description = ? WHERE id = ?', [data.description, id])
  } else if (data.created_at !== undefined) {
    runSql('UPDATE photos SET created_at = ? WHERE id = ?', [data.created_at, id])
  }
}

export function setTrashed(ids: number[], trashed: boolean): void {
  const placeholders = ids.map(() => '?').join(',')
  if (trashed) {
    runSql(`UPDATE photos SET is_trashed = 1, trashed_at = datetime('now') WHERE id IN (${placeholders})`, ids)
  } else {
    runSql(`UPDATE photos SET is_trashed = 0, trashed_at = NULL WHERE id IN (${placeholders})`, ids)
  }
}

export function deletePermanently(ids: number[]): void {
  const { unlinkSync, existsSync } = require('fs')
  const placeholders = ids.map(() => '?').join(',')

  // Fetch file paths before deleting records
  const photos = queryAll<PhotoRow>(`SELECT file_path, thumbnail_path, preview_path FROM photos WHERE id IN (${placeholders})`, ids)

  // Physically delete original file and thumbnails from disk
  for (const photo of photos) {
    try {
      if (photo.file_path && existsSync(photo.file_path)) {
        unlinkSync(photo.file_path)
      }
      if (photo.thumbnail_path && existsSync(photo.thumbnail_path)) {
        unlinkSync(photo.thumbnail_path)
      }
      if (photo.preview_path && existsSync(photo.preview_path)) {
        unlinkSync(photo.preview_path)
      }
    } catch (err) {
      console.error('Failed to physically delete file from disk:', photo.file_path, err)
    }
  }

  // Delete records from database
  runSql(`DELETE FROM photos WHERE id IN (${placeholders})`, ids)

  cleanupOrphanedPeople()
  saveDatabase()
}

export function getPhotoCount(filter: PhotoFilter = {}): number {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.isTrashed !== undefined) {
    conditions.push('is_trashed = ?')
    params.push(filter.isTrashed ? 1 : 0)
  } else {
    conditions.push('is_trashed = 0')
  }
  if (filter.isFavorite) {
    conditions.push('is_favorite = 1')
  }
  if (filter.isArchived !== undefined) {
    conditions.push('is_archived = ?')
    params.push(filter.isArchived ? 1 : 0)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const row = queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM photos ${where}`, params)
  return row?.count || 0
}

export function getTimeline(): { date: string; count: number }[] {
  return queryAll<{ date: string; count: number }>(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM photos
    WHERE is_trashed = 0 AND is_archived = 0
    GROUP BY date(created_at)
    ORDER BY date DESC
  `)
}

export function getStats(): { totalPhotos: number; totalSize: number; favorites: number; albums: number } {
  const photoStats = queryOne<{ total: number; size: number }>(`
    SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as size
    FROM photos WHERE is_trashed = 0
  `)
  const favCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM photos WHERE is_favorite = 1 AND is_trashed = 0')
  const albumCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM albums')
  return {
    totalPhotos: photoStats?.total || 0,
    totalSize: photoStats?.size || 0,
    favorites: favCount?.count || 0,
    albums: albumCount?.count || 0
  }
}

export function getTrashedCount(): number {
  return queryOne<{ count: number }>('SELECT count(*) as count FROM photos WHERE is_trashed = 1')?.count || 0
}

export function getUnanalyzedPhotos(): PhotoRow[] {
  return queryAll<PhotoRow>('SELECT * FROM photos WHERE is_trashed = 0 AND (blur_score = -1 OR perceptual_hash = "") ORDER BY created_at DESC')
}

export function savePhotoAnalysis(photoId: number, blurScore: number, perceptualHash: string): void {
  runSql('UPDATE photos SET blur_score = ?, perceptual_hash = ? WHERE id = ?', [blurScore, perceptualHash, photoId])
}

// ─── Document Scanning (OCR) ─────────────────────────────────────────────

export function getUnscannedDocuments(): PhotoRow[] {
  // We only scan images (no videos) that haven't been OCR'd yet.
  // We assume extracted_text="" means unscanned. If it was scanned and failed, we store "ERROR".
  return queryAll<PhotoRow>('SELECT * FROM photos WHERE is_trashed = 0 AND (extracted_text = "" OR extracted_text = "ERROR") AND mime_type LIKE "image%" ORDER BY created_at DESC')
}

export function saveDocumentScan(photoId: number, extractedText: string, isDocument: boolean, category: string | null = null): void {
  const textToSave = extractedText.trim() === '' ? 'NONE' : extractedText
  runSql('UPDATE photos SET extracted_text = ?, is_document = ?, document_category = ? WHERE id = ?', [textToSave, isDocument ? 1 : 0, category, photoId])
}

// ─── Location Scanning ───────────────────────────────────────────────────

export function getPhotosWithMissingLocation(): (PhotoRow & { gps_lat: number | null, gps_lon: number | null })[] {
  return queryAll<PhotoRow & { gps_lat: number | null, gps_lon: number | null }>(`
    SELECT p.*, e.gps_lat, e.gps_lon 
    FROM photos p 
    LEFT JOIN exif_data e ON p.id = e.photo_id 
    WHERE p.is_trashed = 0 AND (p.location_name IS NULL OR p.location_name = "" OR p.location_name = "Unknown Location")
    ORDER BY p.created_at DESC
  `)
}

export function savePhotoLocation(photoId: number, locationName: string): void {
  runSql('UPDATE photos SET location_name = ? WHERE id = ?', [locationName, photoId])
}

// Compute Hamming distance between two hex hashes
function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 999
  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    const n1 = parseInt(hash1[i], 16)
    const n2 = parseInt(hash2[i], 16)
    // count set bits in XOR
    let xor = n1 ^ n2
    while (xor > 0) {
      distance += xor & 1
      xor >>= 1
    }
  }
  return distance
}

export function getUtilitiesData() {
  const allPhotos = queryAll<PhotoRow>('SELECT * FROM photos WHERE is_trashed = 0 ORDER BY created_at DESC')

  const whatsappPhotos = allPhotos.filter(p =>
    p.filename.toUpperCase().includes('WA') ||
    p.filename.toLowerCase().includes('whatsapp')
  )

  const blurryPhotos = allPhotos.filter(p => p.blur_score !== undefined && p.blur_score >= 0 && p.blur_score < 100)
  blurryPhotos.sort((a, b) => (a.blur_score || 0) - (b.blur_score || 0))

  // 1. Find Exact Visual & Byte Content Duplicates
  // Match photos with identical 64-bit pixel-density hash OR exact filename + size copy
  const exactDuplicates = new Map<string, PhotoRow[]>()
  allPhotos.forEach(p => {
    let key = ''
    if (p.perceptual_hash && p.perceptual_hash !== '0000000000000000') {
      // 100% Pixel Density Match
      key = `hash_${p.perceptual_hash}`
    } else if (p.file_size > 0 && p.filename) {
      // Fallback for unanalyzed photos: exact same file size & exact filename
      key = `filesize_${p.file_size}_${p.filename.toLowerCase()}`
    }

    if (key) {
      if (!exactDuplicates.has(key)) exactDuplicates.set(key, [])
      exactDuplicates.get(key)!.push(p)
    }
  })

  const duplicateGroups = Array.from(exactDuplicates.values()).filter(group => group.length > 1)

  // 2. Find Similar Photos (Strict Pixel Density Hamming Distance <= 5)
  const similarGroups: PhotoRow[][] = []
  const checkedForSimilar = new Set<number>()

  duplicateGroups.forEach(group => group.forEach(p => checkedForSimilar.add(p.id)))

  // Only compare photos that have a valid 64-bit pixel density hash
  const availableForSimilar = allPhotos.filter(p =>
    !checkedForSimilar.has(p.id) &&
    p.perceptual_hash &&
    p.perceptual_hash !== '0000000000000000'
  )

  for (let i = 0; i < availableForSimilar.length; i++) {
    const p1 = availableForSimilar[i]
    if (checkedForSimilar.has(p1.id)) continue

    const currentGroup = [p1]
    checkedForSimilar.add(p1.id)

    for (let j = i + 1; j < availableForSimilar.length; j++) {
      const p2 = availableForSimilar[j]
      if (checkedForSimilar.has(p2.id)) continue

      // Pixel Density Hamming Distance Check (<= 5 bits difference out of 64)
      const dist = hammingDistance(p1.perceptual_hash!, p2.perceptual_hash!)
      if (dist <= 5) {
        currentGroup.push(p2)
        checkedForSimilar.add(p2.id)
      }
    }

    if (currentGroup.length > 1) {
      similarGroups.push(currentGroup)
    }
  }

  return {
    whatsapp: whatsappPhotos,
    blurry: blurryPhotos,
    duplicates: duplicateGroups,
    similar: similarGroups
  }
}

export async function scanPerceptualHashesBatch(
  onProgress?: (scanned: number, total: number) => void
): Promise<{ scannedCount: number; duplicateCount: number }> {
  const unanalyzed = queryAll<{ id: number; file_path: string }>(
    "SELECT id, file_path FROM photos WHERE is_trashed = 0 AND (perceptual_hash IS NULL OR perceptual_hash = '' OR perceptual_hash = '0000000000000000')"
  )

  const total = unanalyzed.length
  if (total === 0) {
    onProgress?.(0, 0)
    return { scannedCount: 0, duplicateCount: 0 }
  }

  let completed = 0
  const BATCH_SIZE = 32

  for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
    const batch = unanalyzed.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map(async (photo) => {
        try {
          const { computePerceptualHash } = await import('./thumbnails')
          const hash = await computePerceptualHash(photo.file_path)
          if (hash && hash !== '0000000000000000') {
            runSql('UPDATE photos SET perceptual_hash = ? WHERE id = ?', [hash, photo.id])
          }
        } catch {}
        completed++
        onProgress?.(completed, total)
      })
    )
  }

  return { scannedCount: completed, duplicateCount: total }
}

// ─── Albums CRUD ─────────────────────────────────────────────────────────

export interface AlbumRow {
  id: number
  name: string
  cover_photo_id: number | null
  created_at: string
  updated_at: string
  photo_count?: number
  cover_thumbnail?: string | null
}

export function createAlbum(name: string): number {
  runSql('INSERT INTO albums (name) VALUES (?)', [name])
  const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')
  return row?.id || 0
}

export function getAlbums(): AlbumRow[] {
  return queryAll<AlbumRow>(`
    SELECT a.*, COUNT(ap.photo_id) as photo_count, p.thumbnail_path as cover_thumbnail
    FROM albums a
    LEFT JOIN album_photos ap ON a.id = ap.album_id
    LEFT JOIN photos p ON a.cover_photo_id = p.id
    GROUP BY a.id
    ORDER BY a.updated_at DESC
  `)
}

export function getAlbumById(id: number): AlbumRow | undefined {
  return queryOne<AlbumRow>(`
    SELECT a.*, COUNT(ap.photo_id) as photo_count, p.thumbnail_path as cover_thumbnail
    FROM albums a
    LEFT JOIN album_photos ap ON a.id = ap.album_id
    LEFT JOIN photos p ON a.cover_photo_id = p.id
    WHERE a.id = ?
    GROUP BY a.id
  `, [id])
}

export function updateAlbum(id: number, name: string): void {
  runSql("UPDATE albums SET name = ?, updated_at = datetime('now') WHERE id = ?", [name, id])
}

export function deleteAlbum(id: number): void {
  runSql('DELETE FROM albums WHERE id = ?', [id])
}

export function addPhotosToAlbum(albumId: number, photoIds: number[]): void {
  const database = getDb()
  const maxPosRow = queryOne<{ max: number }>('SELECT COALESCE(MAX(position), 0) as max FROM album_photos WHERE album_id = ?', [albumId])
  let pos = maxPosRow?.max || 0

  database.run('BEGIN TRANSACTION')
  try {
    for (const photoId of photoIds) {
      pos++
      try {
        runSql('INSERT OR IGNORE INTO album_photos (album_id, photo_id, position) VALUES (?, ?, ?)', [albumId, photoId, pos])
      } catch { }
    }
    // Set cover photo if none exists
    const album = getAlbumById(albumId)
    if (album && !album.cover_photo_id && photoIds.length > 0) {
      runSql('UPDATE albums SET cover_photo_id = ? WHERE id = ?', [photoIds[0], albumId])
    }
    runSql("UPDATE albums SET updated_at = datetime('now') WHERE id = ?", [albumId])
    database.run('COMMIT')
  } catch {
    database.run('ROLLBACK')
  }
  saveDatabase()
}

export function removePhotosFromAlbum(albumId: number, photoIds: number[]): void {
  const placeholders = photoIds.map(() => '?').join(',')
  runSql(`DELETE FROM album_photos WHERE album_id = ? AND photo_id IN (${placeholders})`, [albumId, ...photoIds])
}

// ─── People & Face CRUD ──────────────────────────────────────────────────

export interface PersonRow {
  id: number
  name: string
  cover_photo_id: number | null
  created_at: string
  photo_count?: number
  cover_thumbnail?: string | null
  cover_face_base64?: string | null
}

export function createPerson(name: string, coverPhotoId?: number, faceBase64?: string): number {
  const database = getDb()
  database.run('INSERT INTO people (name, cover_photo_id, cover_face_base64) VALUES (?, ?, ?)', [name, coverPhotoId || null, faceBase64 || null])
  const id = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')?.id || 0
  saveDatabase()
  return id
}

export function updatePersonName(personId: number, name: string): void {
  runSql('UPDATE people SET name = ? WHERE id = ?', [name, personId])
}

export function mergePeople(primaryId: number, secondaryId: number): void {
  // Move all photo_people relationships to primaryId (ignore if primary already has the photo)
  runSql('UPDATE OR IGNORE photo_people SET person_id = ? WHERE person_id = ?', [primaryId, secondaryId])
  runSql('DELETE FROM photo_people WHERE person_id = ?', [secondaryId])

  // Move all face_descriptors to primaryId
  runSql('UPDATE face_descriptors SET person_id = ? WHERE person_id = ?', [primaryId, secondaryId])

  // Keep primary name if secondary was 'Unknown Person' and primary is custom, otherwise keep primary name
  const primaryName = queryOne<{ name: string }>('SELECT name FROM people WHERE id = ?', [primaryId])?.name
  const secondaryName = queryOne<{ name: string }>('SELECT name FROM people WHERE id = ?', [secondaryId])?.name
  if (primaryName === 'Unknown Person' && secondaryName && secondaryName !== 'Unknown Person') {
    runSql('UPDATE people SET name = ? WHERE id = ?', [secondaryName, primaryId])
  }

  // Delete secondary person
  runSql('DELETE FROM people WHERE id = ?', [secondaryId])

  saveDatabase()
}

export function deletePerson(personId: number): void {
  runSql('DELETE FROM people WHERE id = ?', [personId])
}

export function getPeople(): PersonRow[] {
  return queryAll<PersonRow>(`
    SELECT p.*, COUNT(ph2.id) as photo_count, ph.thumbnail_path as cover_thumbnail
    FROM people p
    LEFT JOIN photo_people pp ON p.id = pp.person_id
    LEFT JOIN photos ph2 ON pp.photo_id = ph2.id AND ph2.is_trashed = 0
    LEFT JOIN photos ph ON p.cover_photo_id = ph.id
    GROUP BY p.id
    ORDER BY photo_count DESC, p.name ASC
    LIMIT 50
  `)
}

export function addPhotoToPerson(personId: number, photoId: number): void {
  runSql('INSERT OR IGNORE INTO photo_people (person_id, photo_id) VALUES (?, ?)', [personId, photoId])

  // Set cover photo if none exists
  const person = queryOne<{ cover_photo_id: number | null }>('SELECT cover_photo_id FROM people WHERE id = ?', [personId])
  if (person && !person.cover_photo_id) {
    runSql('UPDATE people SET cover_photo_id = ? WHERE id = ?', [photoId, personId])
  }

  saveDatabase()
}

export function getPhotosByPerson(personId: number): PhotoRow[] {
  return queryAll<PhotoRow>(`
    SELECT ph.* FROM photos ph
    INNER JOIN photo_people pp ON ph.id = pp.photo_id
    WHERE pp.person_id = ? AND ph.is_trashed = 0
    ORDER BY ph.created_at DESC
  `, [personId])
}

export function cleanupOrphanedPeople(): void {
  runSql(`
    DELETE FROM people 
    WHERE id NOT IN (SELECT DISTINCT person_id FROM photo_people)
  `)
}

// ─── Face Descriptors ──────────────────────────────────────────────────

export interface FaceDescriptorRow {
  id: number
  photo_id: number
  person_id: number
  descriptor: string
}

export function getAllFaceDescriptors(): FaceDescriptorRow[] {
  return queryAll<FaceDescriptorRow>('SELECT * FROM face_descriptors')
}

export function saveFaceDescriptor(photoId: number, personId: number, descriptor: number[]): void {
  runSql('INSERT INTO face_descriptors (photo_id, person_id, descriptor) VALUES (?, ?, ?)', [
    photoId, personId, JSON.stringify(descriptor)
  ])
  addPhotoToPerson(personId, photoId)
}

export function getUnscannedPhotos(): PhotoRow[] {
  return queryAll<PhotoRow>('SELECT * FROM photos WHERE faces_scanned = 0 AND is_trashed = 0 ORDER BY created_at DESC')
}

export function markPhotoScanned(photoId: number): void {
  runSql('UPDATE photos SET faces_scanned = 1 WHERE id = ?', [photoId])
}

export function resetFaceScanData(): void {
  runSql('DELETE FROM people') // This will cascade to photo_people and face_descriptors if foreign keys are working
  runSql('DELETE FROM photo_people') // Failsafe
  runSql('DELETE FROM face_descriptors') // Failsafe
  runSql('UPDATE photos SET faces_scanned = 0')
  saveDatabase()
}

export function resetLocationScanData(): void {
  runSql('UPDATE photos SET location_name = NULL WHERE location_name IS NOT NULL')
  saveDatabase()
}

export function resetDocumentScanData(): void {
  runSql('UPDATE photos SET extracted_text = "", is_document = 0, document_category = NULL')
  saveDatabase()
}

export function resetUtilityScanData(): void {
  runSql('UPDATE photos SET blur_score = -1, perceptual_hash = ""')
  saveDatabase()
}

export interface MergeSuggestion {
  personA: PersonRow
  personB: PersonRow
  confidence: number
}

function euclideanDistance(desc1: number[], desc2: number[]): number {
  let sum = 0
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

export function getMergeSuggestions(): MergeSuggestion[] {
  const people = getPeople()
  const faces = getAllFaceDescriptors()

  // Group descriptors by person
  const descriptorsByPerson = new Map<number, number[][]>()
  for (const f of faces) {
    try {
      const desc = JSON.parse(f.descriptor) as number[]
      if (!descriptorsByPerson.has(f.person_id)) descriptorsByPerson.set(f.person_id, [])
      descriptorsByPerson.get(f.person_id)!.push(desc)
    } catch { }
  }

  const suggestions: MergeSuggestion[] = []

  // Compare all pairs of people
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const p1 = people[i]
      const p2 = people[j]
      const descs1 = descriptorsByPerson.get(p1.id) || []
      const descs2 = descriptorsByPerson.get(p2.id) || []

      let minDistance = 1.0

      // Find the closest pair of faces between these two people
      for (const d1 of descs1) {
        for (const d2 of descs2) {
          const dist = euclideanDistance(d1, d2)
          if (dist < minDistance) minDistance = dist
        }
      }

      // 0.55 is our strict cutoff. 0.72 is our "they might be the same person" cutoff.
      if (minDistance >= 0.55 && minDistance <= 0.72) {
        // Map 0.55 -> 95%, 0.72 -> 50%
        const confidence = Math.max(0, Math.min(100, Math.round(100 - ((minDistance - 0.55) / 0.17) * 50)))
        suggestions.push({ personA: p1, personB: p2, confidence })
      }
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence)
  return suggestions
}

// ─── Folders ────────────────────────────────────────────────────────────

export interface ImportedFolderRow {
  id: number
  folder_path: string
  folder_name: string
  photo_count: number
  last_synced_at: string
  created_at: string
}

export function addImportedFolder(folderPath: string, folderName?: string): number {
  const normalized = folderPath.replace(/\\/g, '/')
  const name = folderName || normalized.split('/').filter(Boolean).pop() || folderPath
  try {
    const existing = queryOne<{ id: number }>('SELECT id FROM imported_folders WHERE folder_path = ?', [normalized])
    if (existing && existing.id > 0) {
      runSql('UPDATE imported_folders SET last_synced_at = datetime("now") WHERE id = ?', [existing.id])
      return existing.id
    }
    runSql('INSERT INTO imported_folders (folder_path, folder_name) VALUES (?, ?)', [normalized, name])
    const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')
    return row?.id || 0
  } catch (err) {
    console.error('addImportedFolder failed:', err)
    return 0
  }
}

export function getImportedFolders(): ImportedFolderRow[] {
  return queryAll<ImportedFolderRow>(`
    SELECT f.*, COUNT(p.id) as photo_count
    FROM imported_folders f
    LEFT JOIN photos p ON (p.source_folder_path = f.folder_path OR p.file_path LIKE f.folder_path || '/%') AND p.is_trashed = 0
    GROUP BY f.id
    ORDER BY f.folder_name ASC
  `)
}

export function updateFolderSyncTime(folderPath: string): void {
  const normalized = folderPath.replace(/\\/g, '/')
  runSql('UPDATE imported_folders SET last_synced_at = datetime("now") WHERE folder_path = ?', [normalized])
}

export function removeImportedFolder(folderId: number): void {
  const { unlinkSync, existsSync } = require('fs')
  const folder = queryOne<{ folder_path: string }>('SELECT folder_path FROM imported_folders WHERE id = ?', [folderId])

  if (folder) {
    const normPath = folder.folder_path.replace(/\\/g, '/')
    const photos = queryAll<{ id: number, thumbnail_path: string | null, preview_path: string | null }>(`
      SELECT id, thumbnail_path, preview_path FROM photos 
      WHERE REPLACE(source_folder_path, '\\', '/') = ? OR REPLACE(file_path, '\\', '/') LIKE ? OR REPLACE(file_path, '\\', '/') = ?
    `, [normPath, normPath + '/%', normPath])

    for (const photo of photos) {
      if (photo.thumbnail_path && existsSync(photo.thumbnail_path)) {
        try { unlinkSync(photo.thumbnail_path) } catch { }
      }
      if (photo.preview_path && existsSync(photo.preview_path)) {
        try { unlinkSync(photo.preview_path) } catch { }
      }
    }

    if (photos.length > 0) {
      const ids = photos.map(p => p.id)
      // Chunk deletions if too many photos (sqlite variable limit is 999)
      for (let i = 0; i < ids.length; i += 900) {
        const chunk = ids.slice(i, i + 900)
        const placeholders = chunk.map(() => '?').join(',')

        // Explicitly clean up relational data before deleting photos (failsafe for foreign keys)
        runSql(`DELETE FROM photo_people WHERE photo_id IN (${placeholders})`, chunk)
        runSql(`DELETE FROM face_descriptors WHERE photo_id IN (${placeholders})`, chunk)
        runSql(`DELETE FROM album_photos WHERE photo_id IN (${placeholders})`, chunk)
        runSql(`DELETE FROM exif_data WHERE photo_id IN (${placeholders})`, chunk)
        runSql(`DELETE FROM photo_tags WHERE photo_id IN (${placeholders})`, chunk)

        runSql(`DELETE FROM photos WHERE id IN (${placeholders})`, chunk)
      }
    }
  }

  runSql('DELETE FROM imported_folders WHERE id = ?', [folderId])

  // Failsafe: If no imported folders remain, clear all leftover photos and metadata
  const remainingFolders = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM imported_folders')
  if (!remainingFolders || remainingFolders.count === 0) {
    runSql('DELETE FROM photo_people')
    runSql('DELETE FROM face_descriptors')
    runSql('DELETE FROM album_photos')
    runSql('DELETE FROM exif_data')
    runSql('DELETE FROM photo_tags')
    runSql('DELETE FROM photos')
    resetFaceScanData()
  }

  cleanupOrphanedPeople()
  saveDatabase()
}

export function closeDatabase(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveDatabase()
  if (db) {
    db.close()
    db = null
  }
}
