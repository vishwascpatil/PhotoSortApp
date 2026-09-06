const fs = require('fs')
const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')

async function listAll() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db')
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const rows = db.exec("SELECT id, filename, file_path, extracted_text FROM photos WHERE extracted_text IS NOT NULL AND extracted_text NOT IN ('', 'NONE', 'ERROR')")[0]?.values || []

  console.log(`Total photos with text: ${rows.length}`)
  for (let i = 0; i < Math.min(43, rows.length); i++) {
    const [id, filename, filePath, text] = rows[i]
    const cleanText = text.replace(/\r?\n+/g, ' ').trim()
    console.log(`[${i+1}/${rows.length}] ID: ${id} | ${filename}`)
    console.log(`  Preview: "${cleanText.slice(0, 160)}..."`)
  }
}

listAll().catch(console.error)
