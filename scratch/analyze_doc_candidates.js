const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const sharp = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sharp');

const REAL_DOC_FILES = [
  'BDRC0330.JPG',
  'FZQB2179.JPG',
  'IMG_4762.JPG',
  'IMG_5621.PNG',
  'IMG_5622.JPG',
  'IMG_6190.PNG',
  'UOZG9928.JPG',
  'WQCS1135.JPG'
];

async function analyze(filePath) {
  try {
    const meta = await sharp(filePath).metadata();
    const stats = await sharp(filePath).resize(150, 150, { fit: 'inside' }).stats();

    // Saturation proxy: max(r,g,b) - min(r,g,b)
    const channels = stats.channels;
    const meanR = channels[0].mean;
    const meanG = channels[1].mean;
    const meanB = channels[2].mean;
    const maxC = Math.max(meanR, meanG, meanB);
    const minC = Math.min(meanR, meanG, meanB);
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
    const brightness = (meanR + meanG + meanB) / 3;

    return {
      w: meta.width,
      h: meta.height,
      aspect: (Math.max(meta.width, meta.height) / Math.min(meta.width, meta.height)).toFixed(2),
      brightness: brightness.toFixed(1),
      saturation: (saturation * 100).toFixed(1) + '%'
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  for (const name of REAL_DOC_FILES) {
    const res = db.exec(`SELECT file_path FROM photos WHERE filename = '${name}'`);
    if (res.length > 0) {
      const p = res[0].values[0][0];
      const data = await analyze(p);
      console.log(name, data);
    }
  }
}

main().catch(console.error);
