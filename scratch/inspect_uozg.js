const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');

async function main() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const res = db.exec("SELECT filename, extracted_text FROM photos WHERE filename LIKE '%UOZG9928%'");
  if (res.length > 0) {
    const text = res[0].values[0][1];
    console.log('Text of UOZG9928.JPG:');
    console.log(JSON.stringify(text));
    const m = text.match(/(?:^|\s)@[a-zA-Z0-9_]{3,}\b/i);
    console.log('Matched @:', m ? m[0] : 'NONE');
  }
}
main();
