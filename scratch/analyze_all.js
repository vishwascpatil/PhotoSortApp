const fs = require('fs')
const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')

const rules = JSON.parse(fs.readFileSync('c:/Users/vishw/Desktop/photo-sort/src/main/services/document/ocr_rules.json', 'utf8'))

async function analyzeAll() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db')
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const rows = db.exec("SELECT id, filename, is_document, document_category, extracted_text FROM photos WHERE extracted_text IS NOT NULL AND extracted_text NOT IN ('', 'NONE', 'ERROR')")[0]?.values || []

  console.log(`Analyzing all ${rows.length} photos with extracted text:\n`)

  for (const r of rows) {
    const [id, filename, isDoc, cat, text] = r
    const lower = text.toLowerCase()
    console.log(`--------------------------------------------------------------------------------`)
    console.log(`ID: ${id} | File: ${filename} | isDoc in DB: ${isDoc} | Category in DB: ${cat}`)
    console.log(`TEXT PREVIEW:\n${text.slice(0, 300)}...\n`)
  }
}

analyzeAll().catch(console.error)
