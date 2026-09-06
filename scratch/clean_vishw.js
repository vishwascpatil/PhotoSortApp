const fs = require('fs');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'photovault', 'photovault.db');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const vishwCount = db.exec("SELECT count(*) FROM photos WHERE location_name LIKE '%vishw%'")[0]?.values[0][0] || 0;
  console.log('Photos with vishw in location_name:', vishwCount);
  if (vishwCount > 0) {
    db.run("UPDATE photos SET location_name = NULL WHERE location_name LIKE '%vishw%'");
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('Cleaned up Vishw location names from DB!');
  }
  const locs = db.exec("SELECT location_name, count(*) FROM photos WHERE location_name IS NOT NULL GROUP BY location_name");
  console.log('Current locations in DB:', JSON.stringify(locs[0]?.values, null, 2));
});
