const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/vishw/Downloads/17 pro max-backup';

function walkDir(d) {
  let files = [];
  try {
    const list = fs.readdirSync(d);
    for (const item of list) {
      const full = path.join(d, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        files = files.concat(walkDir(full));
      } else {
        files.push({ path: full, name: item, size: stat.size, ext: path.extname(item).toLowerCase() });
      }
    }
  } catch(e) {}
  return files;
}

const all = walkDir(dir);
console.log('Total files on disk in source folder:', all.length);

const extCounts = {};
for (const f of all) {
  extCounts[f.ext] = (extCounts[f.ext] || 0) + 1;
}
console.log('Extensions:', extCounts);
