const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');

async function main() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const res = db.exec("SELECT id, filename, extracted_text FROM photos WHERE id = 40918");
  const text = res[0].values[0][2];
  console.log('Filename:', res[0].values[0][1]);
  console.log('Extracted text:');
  console.log(JSON.stringify(text));

  const lower = text.toLowerCase();
  console.log('lower includes aadhaar?', lower.includes('aadhaar'));
  console.log('lower includes aadhar?', lower.includes('aadhar'));
  console.log('lower includes uidai?', lower.includes('uidai'));
}
main();
