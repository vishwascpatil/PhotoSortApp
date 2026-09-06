const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

app.whenReady().then(async () => {
  const dbDir = path.join(app.getPath('appData'), 'photosort');
  const dbPath = path.join(dbDir, 'photovault.db');
  console.log('Using dbPath:', dbPath);
  if (!fs.existsSync(dbPath)) {
    console.log('Not found');
    app.quit();
    return;
  }
  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  
  try {
    const foldersRes = db.exec('SELECT * FROM imported_folders');
    console.log('Imported Folders:', JSON.stringify(foldersRes[0]?.values || [], null, 2));

    const countRes = db.exec('SELECT count(*), sum(file_size) FROM photos WHERE is_trashed = 0');
    console.log('Photos Count & Size:', JSON.stringify(countRes[0]?.values || [], null, 2));

    const samplePaths = db.exec('SELECT file_path, filename, file_size FROM photos WHERE is_trashed = 0 LIMIT 3');
    console.log('Sample Paths:', JSON.stringify(samplePaths[0]?.values || [], null, 2));
  } catch(e) {
    console.error('Error:', e);
  }
  app.quit();
});
