const fs = require('fs')
const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')

async function check() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db')
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const totalPhotos = db.exec('SELECT count(*) FROM photos')[0].values[0][0]
  console.log('Total photos in DB:', totalPhotos)

  const docCounts = db.exec('SELECT is_document, count(*) FROM photos GROUP BY is_document')[0]?.values
  console.log('Document counts by is_document:', docCounts)

  const texts = db.exec("SELECT count(*) FROM photos WHERE extracted_text IS NOT NULL AND extracted_text != ''")[0]?.values[0][0]
  console.log('Photos with extracted_text:', texts)

  const realDocs = db.exec("SELECT id, filename, is_document, document_category, file_path, extracted_text FROM photos WHERE is_document = 1")[0]?.values
  console.log('Real documents in DB:', realDocs)

  const realTexts = db.exec("SELECT id, filename, is_document, document_category, file_path, extracted_text FROM photos WHERE extracted_text IS NOT NULL AND extracted_text NOT IN ('', 'NONE', 'ERROR') LIMIT 30")[0]?.values
  console.log(`\nPhotos with non-empty, non-NONE extracted text (${realTexts ? realTexts.length : 0}):`)
  if (realTexts) {
    for (const r of realTexts) {
      console.log(`- ID: ${r[0]}, File: ${r[1]}, isDoc: ${r[2]}, cat: ${r[3]}`)
      console.log(`  Path: ${r[4]}`)
      console.log(`  Text: ${JSON.stringify(r[5])}`)
    }
  }
}

check().catch(console.error)
