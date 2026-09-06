const fs = require('fs');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'photovault', 'photovault.db');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const imported = db.exec('SELECT * FROM imported_folders');
  console.log('imported_folders:', JSON.stringify(imported[0]?.values, null, 2));

  const distinctSources = db.exec('SELECT source_folder_path, count(*) FROM photos GROUP BY source_folder_path');
  console.log('distinct source folders in photos table:', JSON.stringify(distinctSources[0]?.values, null, 2));
});
