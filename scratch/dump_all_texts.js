const fs = require('fs')
const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')

async function dumpAll() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db')
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const rows = db.exec("SELECT id, filename, is_document, document_category, extracted_text FROM photos WHERE extracted_text IS NOT NULL AND extracted_text NOT IN ('', 'NONE', 'ERROR')")[0]?.values || []
  console.log('Total photos with real extracted text:', rows.length)
  for (const r of rows) {
    console.log(`=== ID ${r[0]} | ${r[1]} | isDoc: ${r[2]} | cat: ${r[3]} ===`)
    console.log((r[4] || '').replace(/\r?\n+/g, ' ').slice(0, 200))
  }
}
dumpAll()
