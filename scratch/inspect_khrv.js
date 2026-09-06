const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');

async function main() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const res = db.exec("SELECT filename, extracted_text FROM photos WHERE filename = 'KHRV5520.JPG'");
  const text = res[0].values[0][1];
  console.log('KHRV5520.JPG text:', JSON.stringify(text));
}
main();
